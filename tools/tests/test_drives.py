#!/usr/bin/env python3
"""Tests for drive inspection and the package contents. No real drive is touched.

    python tools/tests/test_drives.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))
import kits  # noqa: E402
import miatoff_gui  # noqa: E402
import stickkit  # noqa: E402
from stickkit import DriveInfo  # noqa: E402

FAILURES = []


def check(ok: bool, name: str):
    print(("PASS  " if ok else "FAIL  ") + name)
    if not ok:
        FAILURES.append(name)


GOOD = dict(root="E:\\", label="MAZDA", total=15_000_000_000, filesystem="FAT32", partition_style="mbr",
            partition_number=1, usb=True)


def problem(**change) -> str:
    return " ".join(DriveInfo(**{**GOOD, **change}).problems())


def test_rules():
    check(DriveInfo(**GOOD).problems() == [], "a FAT32 MBR first partition on USB is accepted")
    check("FAT32" in problem(filesystem="exFAT") and "exFAT" in problem(filesystem="exFAT"), "exFAT is refused by name")
    check("FAT32" in problem(filesystem="FAT16"), "FAT16 is refused")
    check("unknown format" in problem(filesystem=""), "an unknown filesystem is refused")
    check("GPT" in problem(partition_style="gpt"), "GPT is refused")
    check("no partition table" in problem(partition_style="none", partition_number=0), "no partition table is refused")
    check("could not be read" in problem(partition_style="unknown"), "an unreadable partition table is refused")
    check("first partition" in problem(partition_number=2), "a second partition is refused: the launcher only looks at sdX1")
    check("USB" in problem(usb=False), "a drive not on USB is refused")
    check("32 GB" in problem(total=64_000_000_000), "a 64 GB volume is refused")
    check(problem(total=32_000_000_000) == "", "a stick sold as 32 GB is accepted")
    check(DriveInfo(root="E:\\").problems() != [], "a drive nothing is known about is refused")


def descriptor(bus: int) -> bytes:
    return struct.pack("<II4B6I", 40, 40, 0, 0, 1, 0, 0, 0, 0, 0, bus, 0) + b"\0" * 8


def partition(style: int, start: int, number: int) -> bytes:
    return struct.pack("<I4xqqI", style, start, 1000, number) + b"\0" * 120


def test_windows_parsing():
    check(stickkit._windows_bus_is_usb(descriptor(7)), "bus type 7 is USB")
    check(not stickkit._windows_bus_is_usb(descriptor(11)), "bus type 11 (SATA) is not USB")
    check(not stickkit._windows_bus_is_usb(b""), "an empty answer is not USB")
    check(stickkit._windows_partition(partition(0, 1048576, 1)) == ("mbr", 1), "MBR, partition 1")
    check(stickkit._windows_partition(partition(0, 0, 1)) == ("none", 0), "a volume at offset 0 has no partition table")
    check(stickkit._windows_partition(partition(1, 1048576, 2)) == ("gpt", 2), "GPT")
    check(stickkit._windows_partition(partition(2, 0, 0)) == ("unknown", 0), "a RAW disk is unknown")
    check(stickkit._windows_partition(b"") == ("unknown", 0), "an empty answer is unknown")


def test_mac_parsing():
    volume = {"VolumeName": "MAZDA", "Internal": False, "BusProtocol": "USB", "FilesystemName": "MS-DOS FAT32",
              "DeviceIdentifier": "disk4s1"}
    whole = {"Content": "FDisk_partition_scheme"}
    info = stickkit._mac_inspect_from(volume, whole, "/Volumes/MAZDA")
    check((info.usb, info.filesystem, info.partition_style, info.partition_number) == (True, "FAT32", "mbr", 1),
          "macOS: a FAT32 MBR stick")
    check(stickkit._mac_inspect_from(volume, {"Content": "GUID_partition_scheme"}, "/V").partition_style == "gpt", "macOS: GPT")
    bare = stickkit._mac_inspect_from({**volume, "DeviceIdentifier": "disk4"}, {}, "/V")
    check(bare.partition_style == "none", "macOS: a volume on the whole disk has no partition table")
    check(not stickkit._mac_inspect_from({**volume, "Internal": True}, whole, "/V").usb, "macOS: an internal disk is not USB")


def test_linux_parsing():
    fields = stickkit._lsblk_fields('PTTYPE="dos" FSVER="FAT32" LABEL="MY STICK"')
    check(fields == {"PTTYPE": "dos", "FSVER": "FAT32", "LABEL": "MY STICK"}, "lsblk -P output is parsed")
    info = stickkit._linux_inspect_from("/media/u/M", "vfat", fields, 1, True)
    check((info.filesystem, info.partition_style, info.partition_number) == ("FAT32", "mbr", 1), "Linux: a FAT32 MBR stick")
    check(stickkit._linux_inspect_from("/m", "vfat", {"FSVER": "FAT16"}, 1, True).filesystem == "FAT16", "Linux: FAT16 is told apart")
    check(stickkit._linux_inspect_from("/m", "vfat", {}, 1, True).filesystem == "", "Linux: vfat without lsblk is unknown")
    check(stickkit._linux_inspect_from("/m", "vfat", fields, 0, True).partition_style == "none", "Linux: no partition number, no table")
    check(stickkit._linux_inspect_from("/m", "exfat", fields, 1, True).filesystem == "exfat", "Linux: other filesystems keep their name")


def test_kits():
    sources = kits.bundle_sources()
    check(all((ROOT / rel).is_file() for rel in sources), "every file in the package list exists")
    check(not [r for r in sources if r.split("/")[0] in ("dumps", "miatoff-dumps", "miatoff-audio", ".worktrees", ".git")],
          "the package list holds no dumps or local folders")
    digests = kits.payload_digests()
    check(set(digests) == {"dump", "install", "designer"} and all(digests.values()), "both kits and the Designer have digests")
    check("meters/designer/index.html" in sources and "meters/designer/v3/app.mjs" in sources, "the Designer is in the package")
    check(not [r for r in sources if "node_modules" in r or "/tests/" in r], "the package list holds no test files")
    payload = kits.install_kit().payload()
    check(all(b"\r" not in payload[name] for name in ("aa-touch.sh", "AATOUCH.ID", "oem-aa-mod/libpatch.conf")),
          "text payloads have LF endings")
    check(kits.install_kit() is kits.install_kit(), "a kit is only put together once")


def test_import_does_no_work():
    code = ("import sys; sys.path.insert(0, 'tools'); import kits; "
            "sys.exit(kits._default_install_kit.cache_info().currsize + kits.dump_kit.cache_info().currsize)")
    done = subprocess.run([sys.executable, "-c", code], cwd=ROOT)
    check(done.returncode == 0, "importing kits does not build a kit")


def test_gui_text():
    bad = DriveInfo(**{**GOOD, "filesystem": "NTFS"})
    check("(not usable)" in miatoff_gui.drive_line(bad) and "(not usable)" not in miatoff_gui.drive_line(DriveInfo(**GOOD)),
          "the picker marks a stick the car cannot read")
    check("NTFS" in miatoff_gui.drive_status(bad), "the status line says why")
    check(miatoff_gui.drive_status(DriveInfo(**GOOD)).startswith("Ready"), "the status line says when a stick is fine")


def test_stick_error_is_not_system_exit():
    check(issubclass(stickkit.StickError, Exception) and not issubclass(stickkit.StickError, SystemExit),
          "StickError can be caught in a worker thread")


def main():
    test_rules()
    test_windows_parsing()
    test_mac_parsing()
    test_linux_parsing()
    test_kits()
    test_import_does_no_work()
    test_gui_text()
    test_stick_error_is_not_system_exit()
    print()
    print(f"{len(FAILURES)} failure(s)" if FAILURES else "All tests passed.")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
