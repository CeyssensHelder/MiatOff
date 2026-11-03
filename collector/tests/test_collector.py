#!/usr/bin/env python3
"""Host tests for the MiatOff collector (no car needed).

Fake dbus-monitor and smdb-read replay data. When the private dump of
27-10-2026 is present, that is the real D-Bus recording and smdb output from a
drive (dumps/eu-74.00.324/003-full-up88s-2026-10-27/research); otherwise a
small synthetic recording is used.

Run: python collector/tests/test_collector.py   (needs a POSIX `sh`)
Optional: MO_DOCKER_IMAGE=busybox:1.25 to run under real BusyBox ash/awk.
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "miatoff-collector.sh"
RESEARCH = HERE.parent.parent / "dumps/eu-74.00.324/003-full-up88s-2026-10-27/research"
REAL = (RESEARCH / "dbus/service-signals.txt").is_file() and os.environ.get("MO_SYNTHETIC") != "1"
DOCKER_IMAGE = os.environ.get("MO_DOCKER_IMAGE", "")
FAILURES = []

SYNTH_SIGNALS = """signal sender=:1.14 -> dest=(null destination) serial=1 path=/com/jci/vbs/vdt; interface=com.jci.vbs.vdt; member=Veh_V_ActlEng
   uint16 5000
signal sender=:1.14 -> dest=(null destination) serial=2 path=/com/jci/vbs/vdt; interface=com.jci.vbs.vdt; member=EngAout_N_Actl
   uint16 1500
signal sender=:1.30 -> dest=(null destination) serial=3 path=/com/jci/vbs/bcm; interface=com.jci.vbs.bcm; member=WheelSpeedNotification
   struct {
      uint16 7
      uint16 0
      uint16 9001
      uint16 9002
      uint16 9003
      uint16 9004
      uint64 0
   }
signal sender=:1.14 -> dest=(null destination) serial=4 path=/com/jci/vbs/vdt; interface=com.jci.vbs.vdt; member=ABS_Diag_Rx
   uint64 12345
signal sender=:1.22 -> dest=(null destination) serial=5 path=/com/jci/vbs/eem; interface=com.jci.vbs.eem; member=CylinderDeactivation
   struct {
      byte 0
   }
signal sender=:1.9 -> dest=(null destination) serial=6 path=/com/jci/usbms; interface=com.jci.usbms; member=Ping
   int32 1
signal sender=:1.30 -> dest=(null destination) serial=7 path=/com/jci/vbs/bcm; interface=com.jci.vbs.bcm; member=PASCDNotification
   struct {
      array of bytes "$PASCD,1.0,C,D,0,1,0.00,13.9*48"
   }
signal sender=:1.14 -> dest=(null destination) serial=8 path=/com/jci/vbs/vdt; interface=com.jci.vbs.vdt; member=Veh_V_ActlEng
   uint16 5100
signal sender=:1.14 -> dest=(null destination) serial=9 path=/com/jci/vbs/vdt; interface=com.jci.vbs.vdt; member=Lateral_Acceleration
   uint16 4100
signal sender=:1.30 -> dest=(null destination) serial=10 path=/com/jci/vbs/bcm; interface=com.jci.vbs.bcm; member=BrakePedalDepressedStatus
   byte 1
"""
SYNTH_CVD = """LatitudeByGPS (int, 4): 1
VehicleSpeed (int, 4): 5100
SteeringWheel (int, 4): 32766
YawRate (int, 4): 2051
EngClnt_Te_Actl (int, 4): 108
DR_IntakeAirTemp (int, 4): 65
Out-CarTemperature (int, 4): 60
BrakePressure (int, 4): 152
FuelGaugePosition (int, 4): 70
DR_Slope (int, 4): 35
"""
VDM = """PID_Drv1Dstnc_curr (int, 4): 26
Drv1AvlFuelE (int, 4): 37
SvdFuelRate (int, 4): 20625
"""
SIGNAL_NAMES = {"Veh_V_ActlEng": "VehicleSpeed", "EngAout_N_Actl": "EngineSpeed",
                "ApedPos_Pc_ActlArb": "AccelPedalPosition", "VehLong_A_Actl": "LongitudinalAccelerometer",
                "Lateral_Acceleration": "LateralAcceleration", "OdoCount": "Odocount"}


def check(cond, message):
    print(("PASS  " if cond else "FAIL  ") + message)
    if not cond:
        FAILURES.append(message)


def signals_text() -> str:
    return (RESEARCH / "dbus/service-signals.txt").read_text(errors="replace") if REAL else SYNTH_SIGNALS


def cvd_text() -> str:
    if not REAL:
        return SYNTH_CVD
    lines = (RESEARCH / "smdb-read-help.txt").read_text(errors="replace").splitlines()
    start = lines.index("$ smdb-read -v -n vdm_vdt_current_data") + 1
    return "\n".join(lines[start:]) + "\n"


def expected_fast(text: str) -> dict:
    """Last value per field, by an independent parser of the dbus-monitor text."""
    want, member, iface, values = {}, None, None, []

    def done():
        if member is None or iface not in ("com.jci.vbs.vdt", "com.jci.vbs.bcm"):
            return
        if re.search(r"Diag|DTC|PASCD|GlobalRealTime|Total_Distance", member) or not values:
            return
        if member == "WheelSpeedNotification":
            want["WheelSpeedSeq"] = values[0]
            for i, v in enumerate(values[2:6], 1):
                want[f"WheelSpeed{i}"] = v
        else:
            want[SIGNAL_NAMES.get(member, member)] = values[0]

    for line in text.splitlines():
        if line.startswith("signal "):
            done()
            iface = re.search(r"interface=([^;]*)", line).group(1)
            member = line.split("member=")[1]
            values = []
        else:
            m = re.match(r"\s+(byte|boolean|u?int(?:16|32|64)|double) (\S+)$", line)
            if m:
                values.append(m.group(2))
    done()
    return want


def write(path: Path, text: str, mode=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, newline="\n")
    if mode:
        os.chmod(path, mode)


def make_fixture(work: Path):
    write(work / "data/signals.txt", signals_text())
    write(work / "data/cvd.txt", cvd_text())
    write(work / "data/vdm.txt", VDM)
    # dbus-monitor: replay the recording; in loop mode keep sending speed
    # signals like the car does, so it ends on SIGPIPE when the collector stops.
    write(work / "bin/dbus-monitor",
          '#!/bin/sh\ncat "$MO_DATA/signals.txt"\n[ "$MO_ONESHOT" = 1 ] && exit 0\n'
          'v=6000\nwhile :; do v=$((v + 1)); echo "signal sender=:1.14 -> dest=(null destination) serial=0 '
          'path=/com/jci/vbs/vdt; interface=com.jci.vbs.vdt; member=Veh_V_ActlEng"; echo "   uint16 $v"; '
          'sleep 0.2; done\n', 0o755)
    # smdb-read: logs start and end of every call, can be slow.
    write(work / "bin/smdb-read",
          '#!/bin/sh\necho "start $2" >> "$MO_DATA/smdb.log"\n'
          '[ -n "$MO_SMDB_SLEEP" ] && sleep "$MO_SMDB_SLEEP"\n'
          'case "$2" in vdm_vdt_current_data) cat "$MO_DATA/cvd.txt" ;; vdm) cat "$MO_DATA/vdm.txt" ;; esac\n'
          'echo "done $2" >> "$MO_DATA/smdb.log"\n', 0o755)
    shutil.copy(SCRIPT, work / "miatoff-collector.sh")
    (work / "out").mkdir()


def start(work: Path, oneshot: bool, smdb_sleep: str = "", slow_s: str = "10"):
    env = {"MO_OUT_DIR": "W/out", "MO_DBUS_MONITOR": "W/bin/dbus-monitor", "MO_SMDB_READ": "W/bin/smdb-read",
           "MO_DATA": "W/data", "MO_ONESHOT": "1" if oneshot else "0", "MO_SMDB_SLEEP": smdb_sleep,
           "MO_SLOW_S": slow_s}
    if DOCKER_IMAGE:
        env = {k: v.replace("W/", "/w/") for k, v in env.items()}
        args = ["docker", "run", "--rm", "--name", f"mo-collector-{work.name}", "-v", f"{work}:/w"]
        for k, v in env.items():
            args += ["-e", f"{k}={v}"]
        # A separate PID 1: when PID 1 exits Docker kills the whole container,
        # which would hide whether the collector leaves smdb-read alone.
        return subprocess.Popen(args + [DOCKER_IMAGE, "sh", "-c", "sh /w/miatoff-collector.sh; sleep 8"],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    env = {k: v.replace("W/", work.as_posix() + "/") for k, v in env.items()}
    return subprocess.Popen(["sh", (work / "miatoff-collector.sh").as_posix()], env=dict(os.environ, **env),
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def sh(work: Path, command: str):
    if DOCKER_IMAGE:
        return subprocess.run(["docker", "exec", f"mo-collector-{work.name}", "sh", "-c", command.replace("W/", "/w/")],
                              capture_output=True, text=True)
    return subprocess.run(["sh", "-c", command.replace("W/", work.as_posix() + "/")], capture_output=True, text=True)


def read_live(work: Path) -> dict:
    path = work / "out/live.txt"
    if not path.exists():
        return {}
    return dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)


def wait_for(cond, seconds: float) -> bool:
    end = time.time() + seconds
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.2)
    return cond()


def main():
    print(f"mode: {'real recording' if REAL else 'synthetic'}{', docker ' + DOCKER_IMAGE if DOCKER_IMAGE else ''}")
    base = Path(tempfile.mkdtemp(prefix="mo-col-"))
    try:
        # --- one pass over the recording
        work = base / "oneshot"
        make_fixture(work)
        proc = start(work, oneshot=True)
        out = proc.communicate(timeout=300)[0]
        check(proc.returncode == 0, f"oneshot run exits 0 ({proc.returncode} {out[-300:]})")
        live = read_live(work)
        lines = (work / "out/live.txt").read_text().splitlines() if (work / "out/live.txt").exists() else []
        check(bool(lines) and all(re.match(r"^[A-Za-z][\w-]*=[^=\s]+$", l) for l in lines),
              f"live.txt is plain Field=value lines ({len(lines)})")
        fast = expected_fast(signals_text())
        wrong = {k: (live.get(k), v) for k, v in fast.items() if live.get(k) != v}
        check(not wrong, f"every D-Bus field has its last value ({len(fast)} fields; wrong: {list(wrong.items())[:4]})")
        check(all(k in live for k in ("VehicleSpeed", "EngineSpeed", "LateralAcceleration")) or not REAL,
              "fast gauge fields present")
        check("WheelSpeed1" in live and "WheelSpeed4" in live and "WheelSpeedSeq" in live, "four wheel speeds parsed")
        extra = set(live) - set(fast) - {"LiveSeq", "EngClnt_Te_Actl", "DR_IntakeAirTemp", "Out-CarTemperature",
                                         "YawRate", "BrakePressure", "FuelGaugePosition", "DR_Slope",
                                         "PID_Drv1Dstnc_curr", "Drv1AvlFuelE"}
        check(not extra, f"nothing from other interfaces, diagnostics or NMEA ({sorted(extra)[:6]})")
        check(not any("Diag" in k or "DTC" in k or "PASCD" in k for k in live), "no diagnostics in the output")
        cvd = dict((m.group(1), m.group(2)) for m in re.finditer(r"^(\S+) \(\w+, \d+\): (\S+)$", cvd_text(), re.M))
        slow_ok = all(live.get(k) == cvd.get(k) for k in ("EngClnt_Te_Actl", "YawRate", "BrakePressure", "FuelGaugePosition"))
        check(slow_ok, f"slow smdb fields included ({[(k, live.get(k), cvd.get(k)) for k in ('EngClnt_Te_Actl', 'YawRate')]})")
        check(live.get("PID_Drv1Dstnc_curr") == "26" and live.get("Drv1AvlFuelE") == "37", "vdm trip fields included")
        check("SteeringWheel" not in live and "SvdFuelRate" not in live, "only the wanted smdb fields")
        check(int(live.get("LiveSeq", "0")) >= 1, f"LiveSeq counts the writes ({live.get('LiveSeq')})")
        check(not list((work / "out").glob("*.tmp")) and not (work / "out/slow.raw").exists(), "no temporary files left")
        smdb_log = (work / "data/smdb.log").read_text().split("\n")
        check([l for l in smdb_log if l] == ["start vdm_vdt_current_data", "done vdm_vdt_current_data",
                                             "start vdm", "done vdm"], f"one smdb-read per namespace, in turn: {smdb_log}")

        # --- running service: restart of dbus-monitor, single instance, clean stop
        work = base / "loop"
        make_fixture(work)
        (work / "data/smdb.log").unlink(missing_ok=True)
        proc = start(work, oneshot=False, smdb_sleep="3", slow_s="1")
        check(wait_for(lambda: (work / "out/collector.pid").exists() and "VehicleSpeed" in read_live(work), 30),
              "service writes live.txt")
        seq1 = int(read_live(work).get("LiveSeq", "0"))
        check(wait_for(lambda: int(read_live(work).get("LiveSeq", "0")) > seq1, 10), "live.txt keeps being rewritten")
        second = sh(work, "MO_OUT_DIR=W/out MO_DBUS_MONITOR=W/bin/dbus-monitor MO_SMDB_READ=W/bin/smdb-read "
                          "MO_DATA=W/data sh W/miatoff-collector.sh; echo rc=$?")
        check("rc=0" in second.stdout, f"a second instance exits at once ({second.stdout.strip()[-60:]})")
        # Stop while smdb-read is busy (it takes 3 s): it must finish on its own.
        wait_for(lambda: (work / "data/smdb.log").exists()
                 and (work / "data/smdb.log").read_text().count("start") > (work / "data/smdb.log").read_text().count("done"), 15)
        sh(work, "kill -TERM $(cat W/out/collector.pid)")
        try:
            proc.wait(timeout=20)
            stopped = True
        except subprocess.TimeoutExpired:
            proc.kill()
            stopped = False
        check(stopped, "collector stops on TERM")
        time.sleep(4)
        log = (work / "data/smdb.log").read_text() if (work / "data/smdb.log").exists() else ""
        check(log.count("start") == log.count("done") > 0, f"a running smdb-read is never killed ({log.split()})")
        check(not (work / "out/collector.pid").exists(), "pid file removed on stop")
        check("VehicleSpeed" in read_live(work), "last values stay readable after stop")
    finally:
        if DOCKER_IMAGE:
            subprocess.run(["docker", "rm", "-f", "mo-collector-loop", "mo-collector-oneshot"], capture_output=True)
        shutil.rmtree(base, ignore_errors=True)

    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
