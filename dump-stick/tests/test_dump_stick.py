#!/usr/bin/env python3
"""Host tests for the MiatOff dump stick (no car needed).

Builds a fake CMU root with the stick at tmp/mnt/sda1, runs the launcher
command the way the update scanner would, and checks the dump output and that
nothing outside the stick changed.

Run: python tests/test_dump_stick.py   (needs a POSIX `sh` on PATH, e.g. Git Bash)
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("build_stick", HERE.parent / "build_stick.py")
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

FAILURES = []


def check(cond, message):
    print(("PASS  " if cond else "FAIL  ") + message)
    if not cond:
        FAILURES.append(message)


def write(root: Path, rel: str, data, mode="w"):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        path.write_bytes(data)
    else:
        path.write_bytes(data.encode("utf-8"))
    return path


def make_fixture(root: Path):
    write(root, "jci/version.ini", 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\nJCI_SW_VER_PATCH="A"\n')
    write(root, "jci/sm/sm.conf",
          '<service name="jciAAPA" type="jci_service">\n  <dependency type="service" value="devices"/>\n</service>\n'
          '<service name="aap_service"/>\n<service name="jciAHA"/>\n')
    write(root, "jci/sm/sm_WCP.conf", '<service name="jciAAPA"/>\n<service name="jciCARPLAY"/>\n')
    write(root, "jci/scripts/stage_gap2.sh", "#!/bin/sh\n[ -f /jci/sm/sm_WCP.conf ] && echo wcp\n")
    write(root, "jci/scripts/set_lvds_speed_restriction_config.sh", "#!/bin/sh\n")
    write(root, "jci/gui/common/js/Common.js", "// not the real Common.js\n")
    write(root, "jci/gui/apps/system/js/systemApp.js", "var disclaimerTime = 3500;\n")
    write(root, "jci/gui/apps/system/images/bg.png", b"\x89PNG fake")
    write(root, "jci/gui/apps/big/huge.js", "x" * (2 * 1024 * 1024 + 1))
    write(root, "etc/aap_system_attributes.xml", "<attributes/>\n")
    write(root, "etc/aap_system_attributes_UCP.xml", "<attributes/>\n")
    write(root, "etc/shadow", "root:$1$secret:0:0\n")
    write(root, "etc/ssh/ssh_host_rsa_key", "PRIVATE\n")
    write(root, "usr/bin/aap_service", b"\x7fELF fake aap")
    write(root, "usr/lib/blmjciaapa.so", b"\x7fELF fake blm")
    # /proc and /sys stand-ins
    write(root, "proc/uptime", "123.45 200.00\n")
    write(root, "proc/mounts", "rootfs / rootfs rw 0 0\n/dev/root / relfs ro,noatime 0 0\n")
    write(root, "proc/meminfo", "MemTotal: 1000 kB\n")
    fields = ["1234", "(sm svc) launcher)", "S", "1"] + ["0"] * 40
    fields[13], fields[14], fields[21], fields[23], fields[38] = "55", "66", "1234", "456", "1"
    write(root, "proc/1234/stat", " ".join(fields) + "\n")
    write(root, "proc/1234/cmdline", b"/jci/sm/sm_svclauncher\x00-n\x00jciAAPA\x00")
    write(root, "proc/1234/status", "Name:\tsm_svclauncher\nCpus_allowed_list:\t0-1\n")
    write(root, "proc/1234/environ", b"PATH=/bin\x00LD_PRELOAD=/data_persist/x.so\x00")
    write(root, "proc/1234/comm", "sm_svclauncher\n")
    write(root, "sys/class/nvram/nv-config/keys/bus_bcm_speed_restriction", "enable\n")
    write(root, "sys/class/nvram/nv-config/keys/lvds_speed_restriction", "enable\n")
    write(root, "sys/bus/usb/devices/1-1/idVendor", "0424\n")
    write(root, "sys/bus/usb/devices/1-1/idProduct", "2514\n")
    write(root, "sys/bus/usb/devices/1-1/product", "USB Hub\n")
    # Vehicle data: two smdb namespaces, a fake smdb-read (EngineSpeed changes
    # on every read) and a fake dbus-send for the GPS position.
    write(root, "jci/smdb/vdm_vdt_current_data.xml",
          '<?xml version="1.0" ?>\n<vdm_vdt_current_data>\n    <!--CVD.VehicleSpeed -->\n'
          '    <VehicleSpeed type="int" value="0" />\n    <EngineSpeed type="int" value="0" />\n'
          '    <Out-CarTemperature type="int" value="0" />\n'
          '    <CrntVehMillege  type="binary" size="3" value="0" />\n</vdm_vdt_current_data>\n')
    write(root, "jci/smdb/vdm.xml", '<vdm>\n    <PID_Drv1Dstnc_curr type="int" value="0" />\n</vdm>\n')
    os.chmod(write(root, "jci/bin/smdb-read",
                   '#!/bin/sh\n[ "$1" = -n ] && [ "$3" = -e ] || { echo usage >&2; exit 1; }\n'
                   'case "$4" in EngineSpeed) echo "$RANDOM" ;; *) echo "42" ;; esac\n'), 0o755)
    os.chmod(write(root, "usr/bin/dbus-send",
                   '#!/bin/sh\necho "method return sender=:1.7"\n'
                   'case "$*" in\n'
                   '  *ListNames*) echo "   array ["; echo "      string \\"com.jci.vbs.navi\\""; '
                   'echo "      string \\"com.jci.lds.data\\""; echo "      string \\"org.freedesktop.DBus\\""; echo "   ]" ;;\n'
                   '  *Introspect*) echo "   string \\"<node><interface name=\\"com.jci.vbs.navi\\"/></node>\\"" ;;\n'
                   '  *) echo "   int32 0"; echo "   double 51.05" ;;\n'
                   'esac\n'), 0o755)
    # dbus-monitor keeps running until the dump stops it.
    os.chmod(write(root, "usr/bin/dbus-monitor",
                   '#!/bin/sh\necho "signal sender=:1.3 -> dest=(null destination) path=/com/jci/vbs/navi; '
                   'interface=com.jci.vbs.navi; member=SpeedChanged"\nexec sleep 30\n'), 0o755)
    os.chmod(write(root, "usr/bin/ipcs", '#!/bin/sh\necho "------ Semaphore Arrays --------"\n'), 0o755)
    write(root, "jci/lib/libjcismdb.so", b"\x7fELF fake smdb lib")
    write(root, "jci/vbs/modules/libjcimod_vdt.so", b"\x7fELF fake vdt module")
    write(root, "tmp/shm_key_gen.txt", "0x1234\n")
    (root / "sys/class/net/eth0").mkdir(parents=True)
    (root / "tmp/mnt/data").mkdir(parents=True)
    (root / "data_persist").mkdir(parents=True)
    (root / "tmp/mnt/sda1").mkdir(parents=True)


def tree_digest(root: Path, skip: Path) -> str:
    h = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(root):
        d = Path(dirpath)
        if d == skip or skip in d.parents:
            continue
        for name in sorted(filenames):
            p = d / name
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


# Optional: run under real BusyBox ash in Docker, e.g. MO_DOCKER_IMAGE=busybox:1.25.
# MO_DOCKER_STRIP lists applets to delete first, to mimic the CMU's slimmer build.
# MO_DOCKER_DEGRADED=1 removes the hash tools and stat, and makes find reject -xdev.
DOCKER_IMAGE = os.environ.get("MO_DOCKER_IMAGE", "")
DOCKER_STRIP = os.environ.get("MO_DOCKER_STRIP", "").split()
DEGRADED = os.environ.get("MO_DOCKER_DEGRADED") == "1"
DEGRADE_SCRIPT = (
    "rm -f /bin/md5sum /bin/sha256sum /bin/stat /bin/top /bin/logread /bin/find; "
    "printf '#!/bin/sh\\nfor a; do [ \"$a\" = -xdev ] && { echo \"find: unrecognized: -xdev\" >&2; exit 1; }; done\\n"
    "exec busybox find \"$@\"\\n' > /bin/find; chmod +x /bin/find; "
)


PROBE_ENV = {"MO_PROBE_ROUNDS": "2", "MO_PROBE_GAP_S": "0", "MO_PROBE_FAST_S": "1", "MO_DBUS_MONITOR_S": "1", "MO_CAL_S": "2"}


def run_launcher(root: Path, action: str, guard: Path):
    command = bs.launcher_name()[2:-4]  # strip "$(" and ").up"
    if not DOCKER_IMAGE:
        env = dict(os.environ, MO_ROOT=root.as_posix(), HOME="/root", MO_TEST="1",
                   MO_ACTION=action, MO_GUARD=guard.as_posix(), **PROBE_ENV)
        return subprocess.run(["sh", "-c", command], env=env, capture_output=True, text=True, timeout=300)
    # Mount the fixture's parent at /w; root and guard are its children.
    work = root.parent
    strip = "".join(f"rm -f /bin/{a} /usr/bin/{a}; " for a in DOCKER_STRIP)
    if DEGRADED:
        strip += DEGRADE_SCRIPT
    return subprocess.run(
        ["docker", "run", "--rm", "-v", f"{work}:/w",
         "-e", "MO_ROOT=/w/" + root.name, "-e", "HOME=/root", "-e", "MO_TEST=1",
         "-e", f"MO_ACTION={action}", "-e", "MO_GUARD=/w/" + guard.name,
         *[a for k, v in PROBE_ENV.items() for a in ("-e", f"{k}={v}")],
         DOCKER_IMAGE, "sh", "-c", strip + command],
        capture_output=True, text=True, timeout=300)


def dumps(stick: Path):
    base = stick / "miatoff-dumps"
    return sorted(p.name for p in base.iterdir()) if base.is_dir() else []


def main():
    check(bs.posix_cksum(b"touchtune-oss-v2\n") == 745427070, "cksum matches TouchTune's known value")
    check(len(bs.launcher_name().encode()) <= 255, "launcher name fits FAT32 (<=255 bytes)")
    check(b"\r" not in bs.payload()["dump.sh"], "dump.sh is written with LF endings")

    tmp = Path(tempfile.mkdtemp(prefix="mo-"))
    try:
        root = tmp / "root"
        make_fixture(root)
        stick = root / "tmp/mnt/sda1"
        guard = tmp / "guard"
        bs.build(stick)
        check(bs.check(stick), "built stick verifies")

        before = tree_digest(root, stick)

        result = run_launcher(root, "full", guard)
        check(result.returncode == 0, f"full dump exits 0 ({result.returncode} {result.stderr[-300:]})")
        names = dumps(stick)
        check(len(names) == 1 and names[0].startswith("001-full-up123s"), f"full dump folder created: {names}")
        out = stick / "miatoff-dumps" / names[0] if names else stick
        summary = (out / "SUMMARY.txt").read_text() if (out / "SUMMARY.txt").exists() else ""
        check("firmware:         74.00.324A" in summary, "firmware parsed as 74.00.324A")
        check("firmware check:   OK" in summary, "firmware gate reports OK")
        if DEGRADED:
            check("md5=none sha256=none" in summary, "missing hash tools are reported")
            check("no sha256 tool" in summary, "Common.js without hash tool is not called missing")
        else:
            check("UNKNOWN" in summary, "unknown Common.js is flagged")
        integrity_before = (out / "integrity-before.txt").read_text()
        crc = bs.posix_cksum((root / "jci/sm/sm.conf").read_bytes())
        check(f"{crc}:{(root / 'jci/sm/sm.conf').stat().st_size} /jci/sm/sm.conf" in integrity_before,
              "integrity uses cksum (always available)")
        check("root mount:       ro" in summary, "root mount reported read-only")
        check("UNCHANGED" in summary, "integrity check reports unchanged")
        check("jciAAPA-lines=1" in summary, "jciAAPA lines counted per SM config")
        files = out / "static/files"
        check((files / "jci/sm/sm.conf").exists(), "sm.conf copied")
        check((files / "jci/scripts/stage_gap2.sh").exists(), "stage scripts copied")
        check((files / "jci/gui/apps/system/js/systemApp.js").exists(), "HMI JS copied")
        check(not (files / "jci/gui/apps/system/images/bg.png").exists(), "images skipped in text mode")
        check(not (files / "jci/gui/apps/big/huge.js").exists(), "oversized file skipped")
        check("huge.js" in (out / "static/skipped-large.txt").read_text(), "oversized file listed")
        check((files / "etc/aap_system_attributes.xml").exists(), "AAP attribute XML copied")
        check(not (files / "etc/shadow").exists(), "shadow never copied")
        check(not (files / "etc/ssh/ssh_host_rsa_key").exists(), "private keys never copied")
        keys = (out / "inventory/key-files.tsv").read_text()
        check("/usr/lib/blmjciaapa.so" in keys and "/usr/bin/aap_service" in keys, "AA binaries hashed")
        if not DEGRADED:
            md5_blm = hashlib.md5((root / "usr/lib/blmjciaapa.so").read_bytes()).hexdigest()
            check(md5_blm in keys, "blmjciaapa.so md5 is correct")
        crc_blm = bs.posix_cksum((root / "usr/lib/blmjciaapa.so").read_bytes())
        check(f"\t{crc_blm}:13\t" in keys, "blmjciaapa.so cksum is correct")
        check("sm_WCP" in (out / "inventory/sm-config-references.txt").read_text(), "sm_WCP references found")
        procs = (out / "runtime/processes.tsv").read_text().splitlines()
        row = [l for l in procs if l.startswith("1234\t")]
        check(bool(row), "fake process listed")
        if row:
            cols = row[0].split("\t")
            check(cols[1:9] == ["1", "12.34", "55", "66", "456", "1", "0-1", "sm svc) launcher"],
                  f"process fields parsed: {cols}")
            check(cols[9].startswith("/jci/sm/sm_svclauncher -n jciAAPA"), "cmdline NULs converted")
        check("LD_PRELOAD=/data_persist/x.so" in (out / "runtime/ld_preload.tsv").read_text(), "LD_PRELOAD detected")
        check("0424:2514" in (out / "runtime/usb-devices.tsv").read_text(), "USB devices listed")
        check((out / "runtime/nvram/lvds_speed_restriction").read_text().strip() == "enable", "NVRAM keys read")
        vd = out / "vehicle-data"
        fields = (vd / "fields-vdm_vdt_current_data.txt").read_text().split() if vd.is_dir() else []
        check(fields == ["VehicleSpeed", "EngineSpeed", "Out-CarTemperature", "CrntVehMillege"],
              f"smdb fields parsed from the schema: {fields}")
        sweep = (vd / "sweep.tsv").read_text().splitlines()[1:] if (vd / "sweep.tsv").exists() else []
        check(len(sweep) == 2 * 5 and all(len(l.split("\t")) == 5 for l in sweep),
              f"two sweeps over all fields of both namespaces ({len(sweep)} rows)")
        check(any(l.endswith("\tvdm\tPID_Drv1Dstnc_curr\t42") for l in sweep), "smdb value recorded per field")
        fast = (vd / "fast.tsv").read_text().splitlines() if (vd / "fast.tsv").exists() else []
        check(fast[:1] and fast[0].startswith("uptime\tVehicleSpeed\tEngineSpeed") and 1 <= len(fast) - 1 <= 50,
              f"fast sample is bounded even with a frozen clock ({len(fast) - 1} samples)")
        gps = (vd / "gps.txt").read_text() if (vd / "gps.txt").exists() else ""
        check(gps.count("double 51.05") == 3, "GPS position read three times")
        check("vehicle data:     5 fields" in summary, "summary reports the vehicle data")
        check("1 changed" in summary, "summary counts the field that changed between sweeps")
        rs = out / "research"
        check((rs / "bin/jci_lib_libjcismdb.so").read_bytes() == b"\x7fELF fake smdb lib" if rs.is_dir() else False,
              "research: smdb library copied for analysis")
        check("/jci/bin/smdb-write" in (rs / "bin/absent.txt").read_text() if (rs / "bin/absent.txt").exists() else False,
              "research: missing binaries are listed")
        check((rs / "smdb-read-help.txt").exists(), "research: smdb-read help captured")
        ipc = (rs / "ipc.txt").read_text() if (rs / "ipc.txt").exists() else ""
        check("Semaphore Arrays" in ipc and "/tmp/shm_key_gen.txt: 0x1234" in ipc, "research: IPC objects and shm keys")
        names = (rs / "dbus/service-names.txt").read_text() if (rs / "dbus/service-names.txt").exists() else ""
        check("com.jci.vbs.navi" in names, "research: D-Bus names listed")
        intro = rs / "dbus/service-introspect-com.jci.vbs.navi.txt"
        check(intro.exists() and "/com/jci/vbs/navi" in intro.read_text(), "research: VBS service introspected at its path")
        check(not (rs / "dbus/service-introspect-org.freedesktop.DBus.txt").exists(), "research: only vehicle services introspected")
        sig = (rs / "dbus/hmi-signals.txt").read_text() if (rs / "dbus/hmi-signals.txt").exists() else ""
        check("member=SpeedChanged" in sig, "research: signals recorded on both buses")
        check(not guard.exists(), "guard removed after run")

        result = run_launcher(root, "snapshot", guard)
        names = dumps(stick)
        check(result.returncode == 0 and len(names) == 2 and names[1].startswith("002-snapshot"),
              f"second run makes a snapshot folder: {names}")
        check(not (stick / "miatoff-dumps" / names[-1] / "static").exists(), "snapshot has no static copy")
        check(not (stick / "miatoff-dumps" / names[-1] / "vehicle-data").exists()
              and not (stick / "miatoff-dumps" / names[-1] / "research").exists(),
              "snapshot stays quick: no vehicle data or research")

        run_launcher(root, "cancel", guard)
        check(len(dumps(stick)) == 2, "cancel writes no dump")

        # A guard whose PID is alive blocks; one whose PID is gone is taken over.
        guard.mkdir()
        sleeper = None
        if DOCKER_IMAGE:
            live_pid = "1"   # the container's own sh -c, alive during the run
        else:
            sleeper = subprocess.Popen(["sh", "-c", "sleep 120 & echo $!; wait"],
                                       stdout=subprocess.PIPE, text=True)
            live_pid = sleeper.stdout.readline().strip()
        (guard / "pid").write_text(live_pid + "\n")
        run_launcher(root, "snapshot", guard)
        check(len(dumps(stick)) == 2, "guard with a live PID blocks a concurrent run")
        if sleeper:
            subprocess.run(["sh", "-c", f"kill {live_pid}"])
            sleeper.wait(timeout=30)
        (guard / "pid").write_text("999999\n")
        result = run_launcher(root, "snapshot", guard)
        check(len(dumps(stick)) == 3, "stale guard (dead PID) is taken over")
        check(not guard.exists(), "taken-over guard is cleaned up afterwards")
        shutil.rmtree(stick / "miatoff-dumps" / dumps(stick)[-1])

        shutil.copytree(bs.long_path(stick), bs.long_path(root / "tmp/mnt/sdb1"),
                        ignore=shutil.ignore_patterns("miatoff-dumps"))
        run_launcher(root, "snapshot", guard)
        check(len(dumps(stick)) == 2, "two identical sticks: launcher refuses (ambiguous)")
        shutil.rmtree(bs.long_path(root / "tmp/mnt/sdb1"))

        # CALIBRATION: timestamped D-Bus recording plus YawRate from smdb.
        result = run_launcher(root, "calibrate", guard)
        names = dumps(stick)
        check(result.returncode == 0 and len(names) == 3 and "-calibrate-" in names[-1],
              f"calibration run makes its own folder ({names})")
        cal = stick / "miatoff-dumps" / names[-1] / "calibration"
        sig = (cal / "signals.txt").read_text() if (cal / "signals.txt").exists() else ""
        lines = sig.splitlines()
        check(len(lines) >= 2 and lines[0].startswith("@") and lines[1].startswith("signal "),
              f"every signal is preceded by its uptime ({lines[:2]})")
        yaw = (cal / "yaw.tsv").read_text().splitlines() if (cal / "yaw.tsv").exists() else []
        check(len(yaw) >= 2 and yaw[0] == "uptime\tYawRate" and yaw[1].endswith("\t42"), f"YawRate samples ({yaw[:2]})")
        meta = (cal / "meta.txt").read_text() if (cal / "meta.txt").exists() else ""
        check("start_uptime=" in meta and "end_uptime=" in meta and "duration_s=2" in meta, "calibration meta written")
        check(not (cal / ".stop").exists() and not (cal / ".monitor.pid").exists(), "calibration leaves no helper files")
        check(not guard.exists(), "guard removed after calibration")
        shutil.rmtree(bs.long_path(stick / "miatoff-dumps" / names[-1]))

        (stick / "MIATOFF.ID").write_text("something-else\n")
        run_launcher(root, "snapshot", guard)
        check(len(dumps(stick)) == 2, "foreign ID: launcher does not run")

        check(tree_digest(root, stick) == before, "nothing outside the stick changed")
    finally:
        shutil.rmtree(bs.long_path(tmp), ignore_errors=True)

    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
