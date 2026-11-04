#!/usr/bin/env python3
"""Tests for the stick checks in tools/stickkit.py that do not need a real drive.

    python tools/tests/test_stickkit.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import stickkit  # noqa: E402

FAILURES = []


def check(ok: bool, name: str):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        FAILURES.append(name)


def main():
    check(stickkit._unescape_mount(r"/media/USB\040STICK\134x") == "/media/USB STICK\\x",
          "mount points are unescaped like the kernel writes them")
    sys_block = Path(tempfile.mkdtemp(prefix="mo-sys-"))
    usb = sys_block / "devices/pci0000:00/usb1/1-1/host6/block/sdb"
    (usb / "sdb1").mkdir(parents=True)
    (usb / "sdb1/partition").write_text("1\n")
    (usb / "removable").write_text("0\n")         # many USB sticks report 0; the USB path decides
    nvme = sys_block / "devices/pci0000:00/nvme/block/nvme0n1"
    (nvme / "nvme0n1p1").mkdir(parents=True)
    (nvme / "nvme0n1p1/partition").write_text("1\n")
    (nvme / "removable").write_text("0\n")
    (sys_block / "class/block").mkdir(parents=True)
    (sys_block / "class/block/sdb1").symlink_to(usb / "sdb1")
    (sys_block / "class/block/nvme0n1p1").symlink_to(nvme / "nvme0n1p1")
    mounts = {"/media/u/MAZDA": ("/dev/sdb1", "vfat"), "/boot/efi": ("/dev/nvme0n1p1", "vfat"),
              "/media/u/NTFS": ("/dev/sdb1", "ntfs3")}
    real_mounts, real_path = stickkit._linux_mounts, stickkit.Path
    stickkit._linux_mounts = lambda: mounts

    def fake_path(*parts):  # /sys/... points into the fake tree
        text = str(real_path(*parts))
        return real_path(str(sys_block) + text[4:]) if text.startswith("/sys/") else real_path(text)
    stickkit.Path = fake_path
    try:
        check(stickkit._linux_stick_problem(Path("/media/u/MAZDA")) is None, "a vfat stick on a USB disk is accepted")
        check("removable USB" in (stickkit._linux_stick_problem(Path("/boot/efi")) or ""),
              "the EFI partition (vfat, internal NVMe) is refused")
        check("ntfs3" in (stickkit._linux_stick_problem(Path("/media/u/NTFS")) or ""), "a non-FAT stick is refused")
        check("not in /proc/mounts" in (stickkit._linux_stick_problem(Path("/media/u/GONE")) or ""),
              "a path that is not a mount is refused")
    finally:
        stickkit._linux_mounts, stickkit.Path = real_mounts, real_path
    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
