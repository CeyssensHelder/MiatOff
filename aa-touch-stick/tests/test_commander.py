#!/usr/bin/env python3
"""Exercise the native Commander helper with synthetic evdev records and dialog children."""
# SPDX-License-Identifier: GPL-3.0-or-later
from concurrent.futures import ThreadPoolExecutor
import fcntl
import json
import os
import re
from pathlib import Path
import signal
import stat
import struct
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / "commander" / "dialog.c"
EV_SYN, EV_KEY, EV_REL, EV_ABS = 0, 1, 2, 3
SYN_REPORT, SYN_DROPPED, KEY_ENTER, KEY_BACKSPACE, KEY_N, KEY_M, REL_HWHEEL = 0, 3, 28, 14, 49, 50, 6
SIGNATURE = "0003:0000:0000:0000"  # the Virtual Keyboard on the 74.00.324A log
ARM_AFTER_REDRAW = 0.43  # production 350 ms settle + one 25 ms poll; leave time for scheduling
STUB = """#!/usr/bin/env python3
import json, os, signal, sys
signal.signal(signal.SIGUSR1, lambda *_: sys.exit(int(os.environ['MO_STUB_TOUCH'])))
term = os.environ.get('MO_STUB_TERM')
if term == 'ignore':
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
elif term:
    def on_term(*_):
        with open(os.environ['MO_STUB_LOG'] + '.term', 'a') as log:
            print(os.getpid(), file=log, flush=True)
        sys.exit(int(term))
    signal.signal(signal.SIGTERM, on_term)
signal.alarm(10)
with open(os.environ['MO_STUB_LOG'], 'a') as log:
    print(json.dumps([os.getpid(), sys.argv[1:]]), file=log, flush=True)
while True:
    signal.pause()
"""


def turn(*steps):
    """Knob detents as the car sends them: a KEY_M (clockwise) or KEY_N press and release per step."""
    return [(EV_KEY, KEY_M if step > 0 else KEY_N, value) for step in steps for value in (1, 0)]


def records(events):
    return b"".join(struct.pack("@llHHi", 0, 0, kind, code, value) for kind, code, value in events)


class HelperCase(unittest.TestCase):
    DEFINES = ["-DMIATOFF_COMMANDER_TEST"]

    @classmethod
    def setUpClass(cls):
        folder = tempfile.TemporaryDirectory()
        cls.addClassCleanup(folder.cleanup)
        cls.helper = Path(folder.name) / "commander"
        subprocess.run(["cc", "-std=c99", "-Wall", "-Wextra", "-Werror", *cls.DEFINES,
                        str(SOURCE), "-o", str(cls.helper)], check=True)
        subprocess.run([str(cls.helper), "--check-runtime"], check=True)

    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        root = Path(folder.name)
        self.marker = root / "AATOUCH.ID"
        self.marker.touch()
        self.root = root
        self.fixture = root / "events"
        self.fd = self.fifo(self.fixture)
        self.dialog = root / "jci-dialog"
        self.dialog.write_text(STUB, encoding="utf-8")
        self.dialog.chmod(0o700)
        self.log = root / "dialogs.jsonl"
        self.stderr = root / "stderr.log"

    def fifo(self, path):
        os.mkfifo(path)
        fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
        self.addCleanup(lambda: self.close_fd(fd))
        return fd

    def close_fd(self, fd):
        try:
            os.close(fd)
        except OSError:
            pass

    def close_input(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def start(self, order, *labels, sign="+", touch=1, held=False, short_timeout=False, term=None,
              inputs=SIGNATURE, extra=None):
        env = dict(os.environ, MO_COMMANDER_EVENTS=str(self.fixture), MO_STUB_LOG=str(self.log),
                   MO_STUB_TOUCH=str(touch), **(extra or {}))
        if term is not None:
            env["MO_STUB_TERM"] = str(term)
        if held:
            env["MO_COMMANDER_ENTER_HELD"] = "1"
        if short_timeout:
            env["MO_COMMANDER_SHORT_TIMEOUT"] = "1"
        with self.stderr.open("ab") as stderr:
            self.process = subprocess.Popen([str(self.helper), str(self.dialog), str(self.marker),
                                             inputs, sign, order, "Test", r"A\nB", *labels], env=env, stderr=stderr)
        self.addCleanup(self.stop_process)
        return self.wait_dialogs(1)[-1]

    def stop_process(self):
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=3)

    def wait_dialogs(self, count, timeout=3):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if self.log.exists():
                lines = self.log.read_text(encoding="utf-8").splitlines()
                if len(lines) >= count:
                    return [json.loads(line) for line in lines]
            if hasattr(self, "process") and self.process.poll() is not None:
                self.fail(f"helper exited {self.process.returncode} before dialog {count}")
            time.sleep(0.005)
        self.fail(f"dialog {count} did not appear")

    def send(self, *events, fd=None):
        os.write(self.fd if fd is None else fd, records(events))

    def press(self, code=KEY_ENTER, fd=None):
        self.send((EV_KEY, code, 1), (EV_KEY, code, 0), fd=fd)

    def result(self, expected):
        self.assertEqual(self.process.wait(timeout=3), expected)
        for pid, _ in self.wait_dialogs(1):
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)


class CommanderTests(HelperCase):
    def test_one_step_per_detent_and_wheel_axes_ignored(self):
        self.start("012", "A", "B", "CANCEL")
        self.send((EV_REL, REL_HWHEEL, 1), (EV_KEY, KEY_M, 1), (EV_KEY, KEY_M, 2), (EV_KEY, KEY_M, 2),
                  (EV_KEY, KEY_M, 0))  # autorepeat would be three steps, back to CANCEL
        _, args = self.wait_dialogs(2)[-1]
        self.assertIn("--ok-label=[A]", args)
        self.send(*turn(-1))
        _, args = self.wait_dialogs(3)[-1]
        self.assertIn("--button3-label=[CANCEL]", args)
        self.press(KEY_BACKSPACE)
        self.result(3)

    def test_probe_logs_every_device_and_ignores_watched_input(self):
        watch = self.fifo(self.root / "watch")
        self.start("01", "INSTALL", "CANCEL", inputs="-",
                   extra={"MO_COMMANDER_WATCH_EVENTS": str(self.root / "watch")})
        self.send((EV_ABS, 0, 100), (EV_SYN, SYN_REPORT, 0), (EV_KEY, KEY_ENTER, 1), (EV_KEY, KEY_ENTER, 0),
                  *turn(1), fd=watch)
        self.send(*turn(-1))
        self.wait_dialogs(2)
        os.close(watch)  # a watched device going away does not end the prompt
        time.sleep(ARM_AFTER_REDRAW)
        self.assertIsNone(self.process.poll())
        self.press(KEY_BACKSPACE)
        self.result(3)
        log = self.stderr.read_text()
        self.assertIn("Commander: WATCH_EVENTS type 3 code 0 value 100\n", log)
        self.assertIn("Commander: WATCH_EVENTS type 1 code 28 value 1\n", log)
        self.assertIn("Commander: EVENTS type 1 code 49 value 1\n", log)
        self.assertIn("Commander: WATCH_EVENTS closed\n", log)
        self.assertIn("Commander: Back dismissed the prompt\n", log)
        self.assertNotIn("type 0 code 0", log)
        self.assertEqual(len(self.wait_dialogs(2)), 2)

    def test_installer_mode_logs_no_events(self):
        self.start("01", "INSTALL", "CANCEL")
        self.send(*turn(1))
        self.wait_dialogs(2)
        self.press(KEY_BACKSPACE)
        self.result(3)
        self.assertNotIn("type", self.stderr.read_text())

    def test_two_buttons_cancel_then_wrap_and_select(self):
        pid, args = self.start("01", "INSTALL", "CANCEL")
        self.assertIn("--cancel-label=[CANCEL]", args)
        self.assertIn(r"--text=A\nB", args)
        self.send(*turn(1))
        child, args = self.wait_dialogs(2)[-1]
        self.assertNotEqual(child, pid)
        self.assertIn("--ok-label=[INSTALL]", args)
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)
        self.press()  # still drawing
        time.sleep(ARM_AFTER_REDRAW)
        self.assertIsNone(self.process.poll())
        self.press()
        self.result(0)

    def test_three_choices_use_visual_order_and_coalesce_turns(self):
        _, args = self.start("201", "A", "B", "C", sign="-")
        self.assertFalse(any("[" in arg for arg in args))
        time.sleep(ARM_AFTER_REDRAW)
        self.press()
        self.send(*turn(-1), *turn(-1), *turn(-1))
        _, args = self.wait_dialogs(2)[-1]
        self.assertIn("--cancel-label=[B]", args)
        time.sleep(ARM_AFTER_REDRAW)
        self.assertEqual(len(self.wait_dialogs(2)), 2)
        self.press()
        self.result(1)

    def test_back_is_distinct_from_remove(self):
        _, args = self.start("012", "REPAIR", "REMOVE", "CANCEL")
        self.assertIn("--button3-label=[CANCEL]", args)
        self.press(KEY_BACKSPACE)
        self.result(3)

    def test_held_enter_and_dropped_events_require_fresh_press(self):
        self.start("01", "INSTALL", "CANCEL", held=True)
        time.sleep(ARM_AFTER_REDRAW)
        self.send((EV_KEY, KEY_ENTER, 1), (EV_KEY, KEY_ENTER, 2), (EV_KEY, KEY_ENTER, 0))
        self.send((EV_KEY, KEY_ENTER, 1), (EV_SYN, SYN_DROPPED, 0),
                  (EV_KEY, KEY_ENTER, 0), (EV_SYN, SYN_REPORT, 0), (EV_KEY, KEY_ENTER, 0))
        time.sleep(ARM_AFTER_REDRAW)
        self.assertIsNone(self.process.poll())
        self.press()
        self.result(1)

    def test_touch_during_pending_redraw_preserves_button_index(self):
        pid, _ = self.start("201", "REPAIR", "REMOVE", "CANCEL", touch=2)
        self.send(*turn(1))
        os.kill(pid, signal.SIGUSR1)
        self.result(2)

    def test_unplug_dismisses_even_with_touch_ready(self):
        pid, _ = self.start("01", "INSTALL", "CANCEL", touch=0)
        self.marker.unlink()
        try:
            os.kill(pid, signal.SIGUSR1)
        except ProcessLookupError:
            pass
        self.result(3)

    def test_input_loss_dismisses(self):
        self.start("01", "INSTALL", "CANCEL")
        self.close_input()
        self.result(3)

    def test_input_loss_and_completed_touch_in_same_poll_dismiss(self):
        pid, _ = self.start("01", "INSTALL", "CANCEL", touch=0)
        os.kill(self.process.pid, signal.SIGSTOP)
        os.waitpid(self.process.pid, os.WUNTRACED)
        try:
            os.kill(pid, signal.SIGUSR1)
            self.close_input()
        finally:
            os.kill(self.process.pid, signal.SIGCONT)
        self.result(3)

    def test_reversing_a_turn_preserves_settle_time(self):
        self.start("01", "INSTALL", "CANCEL")
        self.send(*turn(1))
        self.wait_dialogs(2)
        self.send(*turn(1), *turn(-1))
        time.sleep(0.14)  # debounce expired, new dialog still settling
        self.press()
        time.sleep(ARM_AFTER_REDRAW)
        self.assertIsNone(self.process.poll())
        self.press()
        self.result(0)

    def test_dialog_failure_is_not_a_dismissal(self):
        pid, _ = self.start("012", "REPAIR", "REMOVE", "CANCEL", touch=7)
        os.kill(pid, signal.SIGUSR1)
        self.result(5)

    def test_marker_stays_open_for_the_prompt(self):
        self.start("01", "INSTALL", "CANCEL")
        fds = Path(f"/proc/{self.process.pid}/fd")
        self.assertIn(str(self.marker), [os.readlink(fd) for fd in fds.iterdir()])
        self.press(KEY_BACKSPACE)
        self.result(3)

    def test_redraw_closes_with_sigterm_and_ignores_its_exit_code(self):
        pid, _ = self.start("01", "INSTALL", "CANCEL", term=0)  # exit 0 on SIGTERM looks like INSTALL
        self.send(*turn(1))
        _, args = self.wait_dialogs(2)[-1]
        self.assertIn("--ok-label=[INSTALL]", args)
        self.assertEqual(Path(f"{self.log}.term").read_text().split()[0], str(pid))
        time.sleep(ARM_AFTER_REDRAW)
        self.assertIsNone(self.process.poll())
        self.press(KEY_BACKSPACE)
        self.result(3)

    def test_redraw_kills_a_dialog_that_ignores_sigterm(self):
        pid, _ = self.start("01", "INSTALL", "CANCEL", term="ignore")
        self.send(*turn(1))
        self.wait_dialogs(2)
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)
        self.press(KEY_BACKSPACE)
        self.result(3)

    def test_timeout_dismisses(self):
        self.start("01", "INSTALL", "CANCEL", short_timeout=True)
        self.result(3)

    def test_signal_dismisses(self):
        self.start("01", "INSTALL", "CANCEL")
        self.process.terminate()
        self.result(3)

    def test_raw_knob_input_confirms_one_real_installer_step(self):
        with patch.dict(os.environ, MO_SYNTHETIC="1", MO_DOCKER_IMAGE="", MO_COMMANDER_EVENTS=str(self.fixture),
                        MO_STUB_LOG=str(self.log), MO_STUB_TOUCH="99"):
            import test_aa_touch_stick as sim

            car = sim.fresh(self.marker.parent, "raw-knob")
            dialog = sim.write(car.root, "jci/tools/jci-dialog", STUB)
            dialog.chmod(0o755)
            with (car.root / "jci/version.ini").open("a", encoding="ascii") as version:
                version.write('JCI_SW_FLAVOR="unit-test"\n')
            helper = self.helper.read_bytes()
            (car.stick / "miatoff-commander").write_bytes(helper)
            car.extra.update(COMMANDER_TEST_DIALOGS="1", COMMANDER_SHA256=sim.sha(helper),
                             COMMANDER_PROFILES=f"'unit-test {sim.sha(dialog.read_bytes())} {SIGNATURE} + 01 012'")
            (car.stick / "miatoff-plan.txt").write_bytes(b"aa_touch=install\nwarning=install\n")
            with ThreadPoolExecutor(max_workers=1) as worker:
                run = worker.submit(car.run, "")
                try:
                    _, args = self.wait_dialogs(1, timeout=15)[-1]
                    self.assertIn("--cancel-label=[CANCEL]", args)
                    self.send(*turn(1))
                    _, args = self.wait_dialogs(2)[-1]
                    self.assertIn("--ok-label=[INSTALL]", args)
                    time.sleep(ARM_AFTER_REDRAW)
                    self.press()
                    self.assertEqual(run.result(timeout=15).returncode, 0)
                finally:
                    (car.stick / "AATOUCH.ID").unlink(missing_ok=True)
            self.assertEqual(car.state("disclaimer:"), "patched")
            self.assertEqual(car.state(), "stock")


UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_RELBIT = 0x40045564, 0x40045565, 0x40045566
UI_DEV_CREATE, UI_DEV_DESTROY, UI_GET_SYSNAME = 0x5501, 0x5502, (2 << 30) | (64 << 16) | (ord("U") << 8) | 44
EVIOCGRAB = 0x40044590


class VirtualDevice:
    """A uinput device with a /dev/input node, shaped like one on the 74.00.324A log."""

    def __init__(self, name, bus, keys=(), axes=()):
        self.fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
        self.made = None
        for kind, request, codes in ((EV_KEY, UI_SET_KEYBIT, keys), (EV_REL, UI_SET_RELBIT, axes)):
            if codes:
                fcntl.ioctl(self.fd, UI_SET_EVBIT, kind)
                for code in codes:
                    fcntl.ioctl(self.fd, request, code)
        os.write(self.fd, struct.pack("80s4HI", name.encode(), bus, 0, 0, 0, 0) + bytes(4 * 64 * 4))
        fcntl.ioctl(self.fd, UI_DEV_CREATE)
        sysname = bytearray(64)
        fcntl.ioctl(self.fd, UI_GET_SYSNAME, sysname)
        base = Path("/sys/devices/virtual/input") / sysname.split(b"\0")[0].decode()
        until = time.monotonic() + 3
        while not (events := sorted(base.glob("event*"))) and time.monotonic() < until:
            time.sleep(0.01)
        major, minor = map(int, (events[0] / "dev").read_text().split(":"))
        self.node = Path("/dev/input") / events[0].name
        self.node.parent.mkdir(exist_ok=True)
        if not self.node.exists():
            os.mknod(self.node, 0o600 | stat.S_IFCHR, os.makedev(major, minor))
            self.made = self.node

    def send(self, *events):
        os.write(self.fd, records(events + ((EV_SYN, SYN_REPORT, 0),)))

    def press(self, code=KEY_ENTER):
        self.send((EV_KEY, code, 1))
        self.send((EV_KEY, code, 0))

    def close(self):
        if self.fd is None:
            return
        fcntl.ioctl(self.fd, UI_DEV_DESTROY)
        os.close(self.fd)
        self.fd = None
        if self.made:
            self.made.unlink()


@unittest.skipUnless(os.access("/dev/uinput", os.W_OK), "needs /dev/uinput (Docker --privileged)")
class RealInputTests(HelperCase):
    """The production build against real evdev devices named and shaped as on the car."""
    DEFINES = []

    def setUp(self):
        super().setUp()
        keys = range(1, 248)
        self.devices = {}
        for label, name, bus, codes, axes in (
                ("touch", "LVDS TouchScreen", 0, [330], ()),
                ("keyboard", "Virtual Keyboard", 3, keys, ()),
                ("mouse", "Virtual Mouse", 3, (), range(10)),
                ("filtered-keyboard", "filtered-keyboard-0x0000000274992336", 6, keys, ()),
                ("filtered-mouse", "filtered-mouse-0x0000000274B4FD6B", 6, [272, 273, 274], [0, 1, 6, 8]),
                ("filtered-touch", "filtered-touchscreen-0x0000000274CF9F20", 6, [330], ())):
            device = VirtualDevice(name, bus, codes, axes)
            self.addCleanup(device.close)
            self.devices[label] = device

    def reader(self, label):
        """What Mazda would read from a device: a second, ordinary reader."""
        fd = os.open(self.devices[label].node, os.O_RDONLY | os.O_NONBLOCK)
        self.addCleanup(self.close_fd, fd)
        return fd

    @staticmethod
    def pending(fd):
        try:
            data = os.read(fd, 4096)
        except BlockingIOError:
            return []
        return [struct.unpack("@llHHi", data[i:i + 24])[2:] for i in range(0, len(data), 24)]

    def test_knob_drives_the_prompt_and_mazda_sees_none_of_it(self):
        mazda = {label: self.reader(label) for label in ("keyboard", "filtered-keyboard")}
        self.start("01", "INSTALL", "CANCEL")
        self.devices["mouse"].send((EV_REL, REL_HWHEEL, 1))  # Virtual Mouse carries nothing on the car
        self.devices["filtered-keyboard"].send(*turn(1))  # Mazda's copy is held but not read
        time.sleep(0.2)
        self.assertEqual(len(self.wait_dialogs(1)), 1)
        self.devices["keyboard"].send(*turn(1))
        _, args = self.wait_dialogs(2)[-1]
        self.assertIn("--ok-label=[INSTALL]", args)
        time.sleep(ARM_AFTER_REDRAW)
        self.devices["keyboard"].press()
        self.result(0)
        for label, fd in mazda.items():
            self.assertEqual(self.pending(fd), [], label)
        self.devices["keyboard"].send(*turn(-1))  # let go when the helper ends
        self.assertIn((EV_KEY, KEY_N, 1), self.pending(mazda["keyboard"]))

    def test_a_key_held_at_start_is_released_to_mazda_first(self):
        mazda = self.reader("keyboard")
        self.devices["keyboard"].send((EV_KEY, KEY_N, 1))
        threading.Timer(0.4, self.devices["keyboard"].send, args=((EV_KEY, KEY_N, 0),)).start()
        started = time.monotonic()
        self.start("01", "INSTALL", "CANCEL")
        self.assertGreater(time.monotonic() - started, 0.35)
        self.assertEqual(self.pending(mazda), [(EV_KEY, KEY_N, 1), (EV_SYN, SYN_REPORT, 0),
                                               (EV_KEY, KEY_N, 0), (EV_SYN, SYN_REPORT, 0)])
        self.devices["keyboard"].press(KEY_BACKSPACE)
        self.result(3)
        self.assertEqual(self.pending(mazda), [])

    def test_a_key_held_too_long_leaves_touch(self):
        self.devices["keyboard"].send((EV_KEY, KEY_N, 1))
        args = [str(self.helper), str(self.dialog), str(self.marker), SIGNATURE, "+", "01", "T", "X", "A", "B"]
        self.assertEqual(subprocess.run(args, timeout=10).returncode, 4)
        self.devices["keyboard"].send((EV_KEY, KEY_N, 0))
        self.assertFalse(self.log.exists())

    def test_a_held_device_means_no_commander(self):
        other = os.open(self.devices["filtered-keyboard"].node, os.O_RDONLY | os.O_NONBLOCK)
        self.addCleanup(self.close_fd, other)
        fcntl.ioctl(other, EVIOCGRAB, 1)  # someone else already holds Mazda's copy
        args = [str(self.helper), str(self.dialog), str(self.marker), SIGNATURE, "+", "01", "T", "X", "A", "B"]
        self.assertEqual(subprocess.run(args, timeout=10).returncode, 4)
        self.assertFalse(self.log.exists())

    def test_probe_lists_every_device_and_logs_its_events(self):
        self.start("01", "INSTALL", "CANCEL", inputs="-")
        self.devices["filtered-mouse"].send((EV_REL, REL_HWHEEL, -1))
        self.devices["keyboard"].send(*turn(1))
        self.wait_dialogs(2)
        self.devices["keyboard"].press(KEY_BACKSPACE)
        self.result(3)
        log = self.stderr.read_text()
        for label, role in (("keyboard", " Commander, held during the prompt"),
                            ("filtered-keyboard", " held during the prompt"), ("mouse", "")):
            node = self.devices[label].node.name
            self.assertRegex(log, rf'Commander: {node} "[^"]+" [0-9a-f:]{{19}}{re.escape(role)}\n')
        for label in ("keyboard", "filtered-keyboard"):
            self.assertIn(f"Commander: {self.devices[label].node.name} held\n", log)
        self.assertIn(f"Commander: {self.devices['filtered-mouse'].node.name} type 2 code 6 value -1\n", log)
        self.assertIn(f"Commander: {self.devices['keyboard'].node.name} type 1 code 50 value 1\n", log)
        self.assertIn(f"Commander: {self.devices['keyboard'].node.name} type 1 code 14 value 0\n", log)

    def test_missing_or_other_devices_are_unavailable(self):
        self.devices.pop("keyboard").close()
        args = [str(self.helper), str(self.dialog), str(self.marker), SIGNATURE, "+", "01", "T", "X", "A", "B"]
        self.assertEqual(subprocess.run(args, timeout=5).returncode, 4)
        self.devices["keyboard"] = VirtualDevice("Virtual Keyboard", 3, range(1, 248))
        self.addCleanup(self.devices["keyboard"].close)
        args[3] = "0003:1234:0000:0000"
        self.assertEqual(subprocess.run(args, timeout=5).returncode, 4)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
