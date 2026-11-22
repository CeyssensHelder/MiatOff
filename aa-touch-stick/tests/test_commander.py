#!/usr/bin/env python3
"""Exercise the native Commander helper with synthetic evdev records and dialog children."""
# SPDX-License-Identifier: GPL-3.0-or-later
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / "commander" / "dialog.c"
EV_SYN, EV_KEY, EV_REL = 0, 1, 2
SYN_REPORT, SYN_DROPPED, KEY_ENTER, KEY_BACKSPACE, REL_HWHEEL = 0, 3, 28, 14, 6
ARM_AFTER_REDRAW = 0.43  # production 350 ms settle + one 25 ms poll; leave time for scheduling
STUB = """#!/usr/bin/env python3
import json, os, signal, sys
signal.signal(signal.SIGUSR1, lambda *_: sys.exit(int(os.environ['MO_STUB_TOUCH'])))
signal.alarm(10)
with open(os.environ['MO_STUB_LOG'], 'a') as log:
    print(json.dumps([os.getpid(), sys.argv[1:]]), file=log, flush=True)
while True:
    signal.pause()
"""


class CommanderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder = tempfile.TemporaryDirectory()
        cls.addClassCleanup(folder.cleanup)
        cls.helper = Path(folder.name) / "commander"
        subprocess.run(["cc", "-std=c99", "-Wall", "-Wextra", "-Werror", "-DMIATOFF_COMMANDER_TEST",
                        str(SOURCE), "-o", str(cls.helper)], check=True)
        subprocess.run([str(cls.helper), "--check-runtime"], check=True)

    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        root = Path(folder.name)
        self.marker = root / "AATOUCH.ID"
        self.marker.touch()
        self.fixture = root / "events"
        os.mkfifo(self.fixture)
        self.fd = os.open(self.fixture, os.O_RDWR | os.O_NONBLOCK)
        self.addCleanup(self.close_input)
        self.dialog = root / "jci-dialog"
        self.dialog.write_text(STUB, encoding="utf-8")
        self.dialog.chmod(0o700)
        self.log = root / "dialogs.jsonl"

    def close_input(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def start(self, order, *labels, sign="+", touch=1, held=False, short_timeout=False):
        env = dict(os.environ, MO_COMMANDER_EVENTS=str(self.fixture), MO_STUB_LOG=str(self.log),
                   MO_STUB_TOUCH=str(touch))
        if held:
            env["MO_COMMANDER_ENTER_HELD"] = "1"
        if short_timeout:
            env["MO_COMMANDER_SHORT_TIMEOUT"] = "1"
        self.process = subprocess.Popen([str(self.helper), str(self.dialog), str(self.marker),
                                         "0000:0000:0000:0000", sign, order, "Test", r"A\nB", *labels], env=env)
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

    def send(self, *events):
        os.write(self.fd, b"".join(struct.pack("@llHHi", 0, 0, kind, code, value)
                                   for kind, code, value in events))

    def press(self, code=KEY_ENTER):
        self.send((EV_KEY, code, 1), (EV_KEY, code, 0))

    def result(self, expected):
        self.assertEqual(self.process.wait(timeout=3), expected)
        for pid, _ in self.wait_dialogs(1):
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_two_buttons_cancel_then_wrap_and_select(self):
        pid, args = self.start("01", "INSTALL", "CANCEL")
        self.assertIn("--cancel-label=[CANCEL]", args)
        self.assertIn(r"--text=A\nB", args)
        self.send((EV_REL, REL_HWHEEL, 1))
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
        self.send((EV_REL, REL_HWHEEL, -1), (EV_REL, REL_HWHEEL, -1), (EV_REL, REL_HWHEEL, -1))
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
        self.send((EV_REL, REL_HWHEEL, 1))
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
        self.send((EV_REL, REL_HWHEEL, 1))
        self.wait_dialogs(2)
        self.send((EV_REL, REL_HWHEEL, 1), (EV_REL, REL_HWHEEL, -1))
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
                             COMMANDER_PROFILES=f"'unit-test {sim.sha(dialog.read_bytes())} 0000:0000:0000:0000 + 01 012'")
            (car.stick / "miatoff-plan.txt").write_bytes(b"aa_touch=install\nwarning=install\n")
            with ThreadPoolExecutor(max_workers=1) as worker:
                run = worker.submit(car.run, "")
                try:
                    _, args = self.wait_dialogs(1, timeout=15)[-1]
                    self.assertIn("--cancel-label=[CANCEL]", args)
                    self.send((EV_REL, REL_HWHEEL, 1))
                    _, args = self.wait_dialogs(2)[-1]
                    self.assertIn("--ok-label=[INSTALL]", args)
                    time.sleep(ARM_AFTER_REDRAW)
                    self.press()
                    self.assertEqual(run.result(timeout=15).returncode, 0)
                finally:
                    (car.stick / "AATOUCH.ID").unlink(missing_ok=True)
            self.assertEqual(car.state("disclaimer:"), "patched")
            self.assertEqual(car.state(), "stock")


if __name__ == "__main__":
    unittest.main()
