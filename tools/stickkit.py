"""Shared USB-stick builder for MiatOff kits (dump, AA touch, ...).

Every kit uses the launcher from TouchTune (GPL-3.0-or-later): the
Mazda update scanner evaluates the name of the *.up file as shell, which finds
the one stick carrying the kit's ID file (by cksum) and runs the kit script.

SPDX-License-Identifier: GPL-3.0-or-later
"""
import hashlib
import io
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LAUNCHER_SOURCE = ROOT / "launcher"
ZIP_TIME = (2026, 6, 18, 17, 37, 52)
TRIGGER = "jci-autoupdate"
MANIFEST = "PAYLOAD.SHA256"

# Same shape as TouchTune's launcher. FAT forbids '/', so ${HOME%root} ("/" on
# the CMU, where HOME=/root) stands in for it. B is a host-test root hook.
LAUNCHER_TEMPLATE = (
    "$(S=${{HOME%root}};B=$MO_ROOT;N=0;for D in sda1 sdb1 sdc1 sdd1;do "
    "P=$B${{S}}tmp${{S}}mnt${{S}}$D;M=$P${{S}}{id};"
    "[ -f $M ]&&set -- $(cksum $M)&&[ $1 = {crc} ]&&[ $2 = {size} ]&&"
    "{{ N=$((N+1));I=$P${{S}}{script};}};done;"
    "[ $N = 1 ]&&[ -f $I ]&&sh $I).up"
)

# Files of other kits that must not share a stick with this one.
FOREIGN_MARKERS = ("TOUCHTUNE.ID", "install-patches.sh")


def posix_cksum(data: bytes) -> int:
    """CRC of POSIX cksum(1): CRC-32/CKSUM over the data, then its length."""
    crc = 0
    for byte in data:
        crc ^= byte << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) if crc & 0x80000000 else (crc << 1)
            crc &= 0xFFFFFFFF
    length = len(data)
    while length:
        crc ^= (length & 0xFF) << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) if crc & 0x80000000 else (crc << 1)
            crc &= 0xFFFFFFFF
        length >>= 8
    return (~crc) & 0xFFFFFFFF


def lf_bytes(path: Path) -> bytes:
    """Read a text payload with LF endings; BusyBox ash breaks on CRLF."""
    return path.read_bytes().replace(b"\r\n", b"\n")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def long_path(path: Path) -> str:
    """Windows needs the \\\\?\\ prefix once the launcher name pushes past 260 chars."""
    text = str(Path(path).resolve())
    if os.name == "nt" and not text.startswith("\\\\?\\"):
        text = "\\\\?\\" + text
    return text


class Kit:
    """One stick layout: an ID file, a script to run, and extra payload files."""

    def __init__(self, id_name: str, id_bytes: bytes, script: str, script_bytes: bytes, extra=None):
        self.id_name = id_name
        self.id_bytes = id_bytes
        self.script = script
        self.script_bytes = script_bytes
        self.extra = dict(extra or {})

    def launcher_name(self) -> str:
        name = LAUNCHER_TEMPLATE.format(
            id=self.id_name, script=self.script,
            crc=posix_cksum(self.id_bytes), size=len(self.id_bytes),
        )
        unsafe = any(ord(c) < 32 or c in '<>:"/\\|?*' for c in name)
        if unsafe or len(name.encode("utf-8")) > 255 or not name.endswith(").up"):
            raise SystemExit("ERROR: launcher filename is invalid for FAT32")
        return name

    def payload(self) -> dict:
        files = {
            self.id_name: self.id_bytes,
            self.script: self.script_bytes,
            TRIGGER: b"",
            self.launcher_name(): launcher_bytes(),
            **self.extra,
        }
        ours = self.launcher_name()
        lines = "".join(f"{sha256(data)}  {'@launcher' if name == ours else name}\n"
                        for name, data in files.items())
        files[MANIFEST] = lines.encode("utf-8")
        return files

    def conflicts(self, target: Path) -> list:
        found = []
        ours = self.launcher_name()
        for entry in os.listdir(long_path(target)):
            if entry.lower().endswith(".up") and entry != ours:
                found.append(entry)
            if entry in FOREIGN_MARKERS:
                found.append(entry)
            if entry.endswith(".ID") and entry != self.id_name:
                found.append(entry)
        return found

    def check(self, target: Path) -> bool:
        ok = True
        for name, data in self.payload().items():
            path = long_path(Path(target) / name)
            if not os.path.isfile(path):
                print(f"MISSING  {name[:60]}")
                ok = False
            elif open(path, "rb").read() != data:
                print(f"DIFFERS  {name[:60]}")
                ok = False
        for entry in self.conflicts(target):
            print(f"CONFLICT {entry[:60]} (another kit or launcher on this stick)")
            ok = False
        print("Stick OK." if ok else "Stick NOT OK.")
        return ok

    def build(self, target: Path) -> None:
        target = Path(target)
        if not target.is_dir():
            raise SystemExit(f"ERROR: {target} is not a directory (mounted stick root?)")
        found = self.conflicts(target)
        if found:
            raise SystemExit(
                "ERROR: this stick already holds another kit or launcher: "
                + ", ".join(f[:40] for f in found)
                + "\nUse a dedicated, empty FAT32 (MBR) stick per kit."
            )
        for name, data in self.payload().items():
            dest = target / name
            os.makedirs(long_path(dest.parent), exist_ok=True)
            with open(long_path(dest), "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
        if not self.check(target):
            raise SystemExit("ERROR: read-back verification failed")
        print(f"Stick written to {target}. Eject it safely before use.")


def require_stick_root(target: Path) -> None:
    """Refuse anything but the root of a FAT32 volume that is not the system drive.

    Guards the command line against a typo such as C:\\ or a project folder.
    The car only reads FAT32 (MBR) sticks, so this also catches exFAT/NTFS.
    """
    target = Path(target)
    if os.name != "nt":
        if not os.path.ismount(target):
            raise SystemExit(f"ERROR: {target} is not a mount point; give the stick's mount root")
        return
    import ctypes

    text = str(target.resolve())
    anchor = target.resolve().anchor
    if text.rstrip("\\") != anchor.rstrip("\\"):
        raise SystemExit(f"ERROR: give the root of the stick (e.g. E:\\), not {target}")
    system = os.environ.get("SystemDrive", "C:").rstrip("\\").upper()
    if anchor.rstrip("\\").upper() == system:
        raise SystemExit(f"ERROR: {anchor} is the Windows system drive, not a USB stick")
    fs_name = ctypes.create_unicode_buffer(32)
    ok = ctypes.windll.kernel32.GetVolumeInformationW(
        ctypes.c_wchar_p(anchor), None, 0, None, None, None, fs_name, len(fs_name))
    if not ok:
        raise SystemExit(f"ERROR: cannot read volume information for {anchor}")
    if fs_name.value.upper() != "FAT32":
        raise SystemExit(f"ERROR: {anchor} is {fs_name.value}; the car needs FAT32 (MBR)")


def launcher_bytes() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name in ("main_instructions.ini", "versions.ini"):
            info = zipfile.ZipInfo(name, ZIP_TIME)
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.create_version = 20
            info.extract_version = 20
            info.external_attr = 0o600 << 16
            archive.writestr(info, (LAUNCHER_SOURCE / name).read_bytes())
    return output.getvalue()
