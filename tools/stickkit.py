"""Shared USB-stick builder for MiatOff kits (dump, AA touch, ...).

Every kit uses the launcher from TouchTune (GPL-3.0-or-later): the
Mazda update scanner evaluates the name of the *.up file as shell, which finds
the one stick carrying the kit's ID file (by cksum) and runs the kit script.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from dataclasses import dataclass
import hashlib
import io
import os
from pathlib import Path
import plistlib
import re
import shutil
import struct
import subprocess
import sys
import zipfile


class StickError(Exception):
    """A stick cannot be built or used; the message is meant for the user.

    Not SystemExit: in a worker thread that would end the thread silently.
    The command-line wrappers turn it into an exit status.
    """


# In the packaged app PyInstaller unpacks the files below sys._MEIPASS, in the same folders as in the repository.
ROOT = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
LAUNCHER_SOURCE = ROOT / "launcher"
ZIP_TIME = (2026, 6, 18, 17, 37, 52)
TRIGGER = "jci-autoupdate"
MANIFEST = "PAYLOAD.SHA256"
PLAN_NAME = "miatoff-plan.txt"

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
            raise StickError("ERROR: launcher filename is invalid for FAT32")
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
            if entry.startswith("._"):  # attribute files macOS adds on FAT
                continue
            if entry.lower().endswith(".up") and entry != ours:
                found.append(entry)
            if entry in FOREIGN_MARKERS:
                found.append(entry)
            if entry.endswith(".ID") and entry != self.id_name:
                found.append(entry)
        return found

    def verify(self, target: Path) -> list:
        """What is wrong with this stick, as (MISSING | DIFFERS | CONFLICT, file name) pairs; empty when correct."""
        problems = []
        for name, data in self.payload().items():
            path = long_path(Path(target) / name)
            if not os.path.isfile(path):
                problems.append(("MISSING", name))
            else:
                with open(path, "rb") as handle:
                    if handle.read() != data:
                        problems.append(("DIFFERS", name))
        problems += [("CONFLICT", entry) for entry in self.conflicts(target)]
        return problems

    def check(self, target: Path) -> bool:
        problems = self.verify(target)
        for kind, name in problems:
            print(f"{kind:<8} {name[:60]}" + (" (another kit or launcher on this stick)" if kind == "CONFLICT" else ""))
        print("Stick NOT OK." if problems else "Stick OK.")
        return not problems

    def build(self, target: Path, plan: str = None, progress=None) -> None:
        """Write this kit to the stick: see tools/stickwriter.py for the order and what is replaced."""
        import stickwriter  # imports this module

        stickwriter.write(self, Path(target), plan=plan, progress=progress)
        print(f"Stick written to {target}. Eject it safely before use.")


def require_stick_root(target: Path) -> None:
    """Refuse anything but the root of a USB stick the car can read.

    Guards the command line against a typo such as C:\\ or a project folder, and
    catches exFAT/NTFS, GPT, a stick without a partition table and oversized sticks.
    """
    target = Path(target)
    if os.name == "nt":
        anchor = target.resolve().anchor
        if str(target.resolve()).rstrip("\\") != anchor.rstrip("\\"):
            raise StickError(f"ERROR: give the root of the stick (e.g. E:\\), not {target}")
        system = os.environ.get("SystemDrive", "C:").rstrip("\\").upper()
        if anchor.rstrip("\\").upper() == system:
            raise StickError(f"ERROR: {anchor} is the Windows system drive, not a USB stick")
    else:
        if not os.path.ismount(target):
            raise StickError(f"ERROR: {target} is not a mount point; give the stick's mount root")
        problem = _mac_stick_problem(target) if sys.platform == "darwin" else (
            _linux_stick_problem(target) if sys.platform.startswith("linux") else None)
        if problem:
            raise StickError(f"ERROR: {problem}")
    problems = inspect_drive(target).problems()
    if problems:
        raise StickError(f"ERROR: {target} cannot be used: " + "; ".join(problems))


MAX_STICK_BYTES = 32 * 1024 ** 3


@dataclass
class DriveInfo:
    """What the PC can tell about a mounted drive. Anything it could not find out stays unknown and is refused."""

    root: str
    label: str = ""
    total: int = 0
    free: int = 0
    filesystem: str = ""              # FAT32, exFAT, NTFS, ...; "" when unknown
    partition_style: str = "unknown"  # mbr, gpt, none (no partition table) or unknown
    partition_number: int = 0         # 1 = the first partition; 0 when unknown or none
    usb: bool = False

    def problems(self) -> list:
        """Why the car could not use this stick, in plain English; empty when it can."""
        found = []
        if not self.usb:
            found.append("it is not a USB drive")
        if self.filesystem != "FAT32":
            found.append(f"it is formatted as {self.filesystem or 'an unknown format'} and the car needs FAT32")
        if self.partition_style == "gpt":
            found.append("it uses a GPT partition table and the car needs MBR")
        elif self.partition_style == "none":
            found.append("it has no partition table and the car needs MBR with one partition")
        elif self.partition_style != "mbr":
            found.append("its partition table could not be read")
        elif self.partition_number != 1:
            found.append("the volume is not the first partition on the stick")
        if self.total > MAX_STICK_BYTES:
            found.append("it is larger than 32 GB")
        return found

    def title(self) -> str:
        """One line for the drive picker."""
        label = f"  {self.label}" if self.label else ""
        size = f"  {self.total / 1000 ** 3:.1f} GB" if self.total else ""
        return f"{self.root}{label}{size}"


def _fill_usage(info: DriveInfo) -> DriveInfo:
    try:
        usage = shutil.disk_usage(info.root)
        info.total, info.free = usage.total, usage.free
    except OSError:
        pass
    return info


def _windows_bus_is_usb(descriptor: bytes) -> bool:
    """STORAGE_DEVICE_DESCRIPTOR: BusType is the DWORD at offset 28; 7 is BusTypeUsb."""
    return len(descriptor) >= 32 and struct.unpack_from("<I", descriptor, 28)[0] == 7


def _windows_partition(information: bytes) -> tuple:
    """(style, number) from PARTITION_INFORMATION_EX. A volume starting at offset 0 has no partition table."""
    if len(information) < 28:
        return "unknown", 0
    style = struct.unpack_from("<I", information, 0)[0]
    start = struct.unpack_from("<q", information, 8)[0]
    number = struct.unpack_from("<I", information, 24)[0]
    if style == 1:
        return "gpt", number
    if style == 0:
        return ("none", 0) if start == 0 else ("mbr", number)
    return "unknown", 0


def _windows_ioctl(volume: str, code: int, query: bytes, size: int):
    """A read-only DeviceIoControl on a volume such as E:. Needs no administrator rights. None on failure."""
    import ctypes
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateFileW.restype = wintypes.HANDLE
    kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                     wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel32.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD,
                                         wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    invalid = wintypes.HANDLE(-1).value
    # Access 0: asks about the device without reading or writing it. FILE_SHARE_READ | FILE_SHARE_WRITE, OPEN_EXISTING.
    handle = kernel32.CreateFileW("\\\\.\\" + volume, 0, 3, None, 3, 0, None)
    if handle in (None, invalid):
        return None
    try:
        in_buffer = ctypes.create_string_buffer(query, len(query)) if query else None
        out_buffer = ctypes.create_string_buffer(size)
        returned = wintypes.DWORD(0)
        ok = kernel32.DeviceIoControl(handle, code, in_buffer, len(query), out_buffer, size,
                                      ctypes.byref(returned), None)
        return out_buffer.raw[:returned.value] if ok else None
    finally:
        kernel32.CloseHandle(handle)


def _inspect_windows(root: str) -> DriveInfo:
    import ctypes

    anchor = str(Path(root).resolve().anchor)
    info = _fill_usage(DriveInfo(root=anchor))
    label, fs_name = ctypes.create_unicode_buffer(261), ctypes.create_unicode_buffer(32)
    if ctypes.windll.kernel32.GetVolumeInformationW(ctypes.c_wchar_p(anchor), label, len(label), None, None, None,
                                                    fs_name, len(fs_name)):
        info.label, info.filesystem = label.value, fs_name.value
    volume = anchor.rstrip("\\")
    # IOCTL_STORAGE_QUERY_PROPERTY with StorageDeviceProperty, PropertyStandardQuery.
    descriptor = _windows_ioctl(volume, 0x002D1400, struct.pack("<IIB3x", 0, 0, 0), 1024)
    info.usb = bool(descriptor) and _windows_bus_is_usb(descriptor)
    # IOCTL_DISK_GET_PARTITION_INFO_EX
    partition = _windows_ioctl(volume, 0x00070048, b"", 256)
    if partition:
        info.partition_style, info.partition_number = _windows_partition(partition)
    return info


def _mac_inspect_from(volume: dict, whole: dict, root: str) -> DriveInfo:
    """DriveInfo from `diskutil info -plist` of the volume and of its whole disk."""
    info = DriveInfo(root=root, label=volume.get("VolumeName", "") or "")
    info.usb = not volume.get("Internal", True) and volume.get("BusProtocol") == "USB"
    name = volume.get("FilesystemName", "")
    info.filesystem = "FAT32" if name == "MS-DOS FAT32" else (name or volume.get("FilesystemType", "") or "")
    slice_number = re.search(r"s(\d+)$", volume.get("DeviceIdentifier", "") or "")
    if slice_number is None:
        info.partition_style = "none" if volume.get("DeviceIdentifier") else "unknown"
        return info
    info.partition_number = int(slice_number.group(1))
    info.partition_style = {"FDisk_partition_scheme": "mbr", "GUID_partition_scheme": "gpt"}.get(
        whole.get("Content"), "unknown")
    return info


def _inspect_mac(root: str) -> DriveInfo:
    volume = _mac_info(root)
    return _fill_usage(_mac_inspect_from(volume, _mac_info(volume.get("ParentWholeDisk", "")), root))


def _subprocess_env() -> dict:
    """The environment for system tools: without the packaged app's library path (PyInstaller overrides it on Linux)."""
    env = dict(os.environ)
    if getattr(sys, "frozen", False):
        original = env.pop("LD_LIBRARY_PATH_ORIG", None)
        env.pop("LD_LIBRARY_PATH", None)
        if original is not None:
            env["LD_LIBRARY_PATH"] = original
    return env


def _lsblk_fields(output: str) -> dict:
    """KEY="value" pairs from `lsblk -P`."""
    return dict(re.findall(r'([A-Z_]+)="([^"]*)"', output))


def _linux_inspect_from(root: str, fs: str, fields: dict, partition: int, usb: bool) -> DriveInfo:
    """DriveInfo from the /proc/mounts filesystem, lsblk's fields and the kernel's partition number (0: none)."""
    info = DriveInfo(root=root, label=fields.get("LABEL", ""), usb=usb)
    # /proc/mounts says vfat for FAT12, FAT16 and FAT32 alike; only lsblk tells them apart.
    info.filesystem = fields.get("FSVER", "") if fs == "vfat" else fs
    if partition == 0:
        info.partition_style = "none"
    else:
        info.partition_number = partition
        info.partition_style = {"dos": "mbr", "gpt": "gpt"}.get(fields.get("PTTYPE", ""), "unknown")
    return info


def _inspect_linux(root: str) -> DriveInfo:
    entry = _linux_mounts().get(str(Path(root).resolve()))
    if entry is None:
        return DriveInfo(root=root)
    device, fs = entry
    try:
        output = subprocess.run(["lsblk", "-dnP", "-o", "PTTYPE,FSVER,LABEL", device], capture_output=True, text=True,
                                check=True, timeout=15, env=_subprocess_env()).stdout
    except (OSError, subprocess.SubprocessError):
        output = ""
    try:
        partition = int((Path("/sys/class/block") / Path(device).name / "partition").read_text().strip())
    except (OSError, ValueError):
        partition = 0
    return _fill_usage(_linux_inspect_from(root, fs, _lsblk_fields(output), partition, _linux_removable(device)))


def inspect_drive(root) -> DriveInfo:
    """Everything the PC can find out about the drive mounted at root. Never raises for a drive it cannot read."""
    root = str(root)
    try:
        if os.name == "nt":
            return _inspect_windows(root)
        if sys.platform == "darwin":
            return _inspect_mac(root)
        if sys.platform.startswith("linux"):
            return _inspect_linux(root)
    except (OSError, ValueError, struct.error):
        pass
    return DriveInfo(root=root)


def _mac_info(target: str) -> dict:
    """`diskutil info` for a mount point or disk identifier ({} if unknown)."""
    try:
        out = subprocess.run(["diskutil", "info", "-plist", target],
                             capture_output=True, check=True, timeout=15).stdout
        return plistlib.loads(out)
    except (OSError, subprocess.SubprocessError, plistlib.InvalidFileException, ValueError):
        return {}


def _mac_stick_problem(target: Path):
    """None if target is the root of an external FAT32 volume on an MBR disk, else why not."""
    info = _mac_info(str(target))
    if not info:
        return f"cannot read volume information for {target}"
    if info.get("Internal", True) or info.get("SystemImage"):
        return f"{target} is not an external USB drive"
    if info.get("MountPoint") != str(target.resolve()):
        return f"give the root of the stick (e.g. /Volumes/MAZDA), not {target}"
    if info.get("FilesystemName") != "MS-DOS FAT32":
        name = info.get("FilesystemUserVisibleName") or info.get("FilesystemType") or "unknown"
        return f"{target} is {name}; the car needs FAT32 (MBR)"
    whole = _mac_info(info.get("ParentWholeDisk", ""))
    if whole.get("Content") != "FDisk_partition_scheme":
        return f"{target} is not on an MBR-partitioned disk; the car needs FAT32 (MBR)"
    return None


def _unescape_mount(field: str) -> str:
    """/proc/mounts writes space, tab, newline and backslash as octal escapes (\\040 ...)."""
    return re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), field)


def _linux_mounts() -> dict:
    """mount point -> (device, filesystem type), from /proc/mounts."""
    mounts = {}
    try:
        with open("/proc/mounts", encoding="utf-8") as handle:
            for line in handle:
                parts = line.split()
                if len(parts) >= 3:
                    mounts[_unescape_mount(parts[1])] = (_unescape_mount(parts[0]), parts[2])
    except OSError:
        pass
    return mounts


def _linux_removable(device: str) -> bool:
    """True if the block device (e.g. /dev/sdb1) belongs to a disk the kernel reports as removable or USB."""
    name = Path(device).name
    block = Path("/sys/class/block") / name
    if not block.exists():
        return False
    disk = block.resolve()
    if (disk / "partition").exists():
        disk = disk.parent
    try:
        if (disk / "removable").read_text().strip() == "1":
            return True
    except OSError:
        pass
    return "/usb" in str(disk.resolve())


def _linux_stick_problem(target: Path):
    """None if target is the mount root of a vfat volume on a removable/USB disk, else why not."""
    entry = _linux_mounts().get(str(Path(target).resolve()))
    if entry is None:
        return f"{target} is not in /proc/mounts; give the stick's mount root"
    device, fs = entry
    if fs != "vfat":
        return f"{target} is {fs}; the car needs FAT32 (MBR)"
    if not _linux_removable(device):
        return f"{target} ({device}) is not on a removable USB drive"
    return None


def _mount_roots() -> list:
    """Every mounted volume that could be a USB drive, per platform."""
    if os.name == "nt":
        import ctypes
        import string

        system = os.environ.get("SystemDrive", "C:").rstrip("\\").upper()
        mask = ctypes.windll.kernel32.GetLogicalDrives()
        # DRIVE_REMOVABLE or DRIVE_FIXED: some USB sticks report as fixed disks; the bus type decides.
        return [f"{letter}:\\" for index, letter in enumerate(string.ascii_uppercase)
                if mask & (1 << index) and f"{letter}:" != system
                and ctypes.windll.kernel32.GetDriveTypeW(f"{letter}:\\") in (2, 3)]
    if sys.platform == "darwin":
        volumes = Path("/Volumes")
        return sorted(str(p) for p in volumes.iterdir() if p.is_dir() and os.path.ismount(p)) if volumes.is_dir() else []
    if sys.platform.startswith("linux"):
        return sorted(point for point, (device, _fs) in _linux_mounts().items()
                      if device.startswith("/dev/") and _linux_removable(device))
    return []


def list_drives() -> list:
    """The USB drives that are plugged in, also unsuitable ones: DriveInfo.problems() says why not."""
    return [info for info in map(inspect_drive, _mount_roots()) if info.usb]


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
