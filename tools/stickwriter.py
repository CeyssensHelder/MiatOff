"""Write a MiatOff kit to a USB stick so that a stick is never left half active.

The stick is only live once its launcher (the *.up file) exists, so the launcher
goes first when old files are replaced and comes back last:

    inspect     refuse foreign files and the emergency marker; nothing is changed yet
    deactivate  remove old launchers, the old plan and leftovers of an interrupted write
    clear       remove the other kit's files when converting (check <-> install)
    payload     write every file through a temporary name, then the manifest
    plan        write the plan and read it back
    publish     write the trigger, read everything back, rename the launcher into place

An interrupted write leaves no launcher, so the car ignores the stick, and running
this again finishes the job. Results and logs the car left on the stick are kept.

What may be replaced or removed is decided here, never by a file on the stick alone:
a stick counts as MiatOff's only when its ID file is byte-identical to a known one.
PAYLOAD.SHA256 on that stick can then vouch for a file, but only for a path this
module already expects, and only if the file on the stick still has that hash.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from dataclasses import dataclass
import errno
import hashlib
import os
from pathlib import Path
import re
import shutil

import stickkit
from stickkit import MANIFEST, PLAN_NAME, TRIGGER, StickError, long_path


@dataclass(frozen=True)
class KnownKit:
    label: str                # how the user knows this stick
    id_bytes: bytes
    root_files: tuple         # files in the root of the stick that belong to the kit
    folders: tuple            # folders that belong to the kit


# Hard-coded on purpose: this is the list of what may ever be deleted. A test keeps it in step with tools/kits.py.
KNOWN_KITS = {
    "MIATOFF.ID": KnownKit("check", b"miatoff-dump-v1\n", ("dump.sh",), ()),
    "AATOUCH.ID": KnownKit("install", b"miatoff-aa-touch-v1\n", ("aa-touch.sh", "LICENSE", "NOTICE"),
                           ("touchtune", "oem-aa-mod", "miatoff-app", "images")),
}
RESTORE_MARKER = "MIATOFF-RESTORE"
TEMP_SUFFIX = ".mo-tmp"
CLUSTER = 32 * 1024           # the largest cluster FAT32 uses on a stick of 32 GB or less
SPACE_MARGIN = 1024 * 1024
KEEP_WALKING_OUT = {"miatoff-dumps", "System Volume Information", "$RECYCLE.BIN"}
STAGES = (("inspect", "Checking the USB stick…"),
          ("deactivate", "Switching off the old files…"),
          ("clear", "Removing the previous MiatOff files…"),
          ("payload", "Writing the files…"),
          ("plan", "Writing your choices…"),
          ("publish", "Verifying the USB stick…"))
STAGE_LABEL = dict(STAGES)
# The launcher's shape (tools/stickkit.py) with any checksum: older versions of MiatOff are recognised too.
LAUNCHER_PATTERN = re.compile(r"^\$\(S=\$\{HOME%root\};B=\$MO_ROOT;N=0;for D in sda1 sdb1 sdc1 sdd1;do .*"
                              r"M=\$P\$\{S\}(MIATOFF\.ID|AATOUCH\.ID);.*\)\.up$")


def _path(target: Path, name: str) -> str:
    return long_path(Path(target) / name)


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sidecar(name: str) -> bool:
    """macOS stores file attributes on FAT in ._name files: never MiatOff's, and never a reason to refuse a stick."""
    return name.startswith("._")


def _known_ids(target: Path) -> list:
    """The known kits whose ID file is really on this stick."""
    found = []
    for name, kit in KNOWN_KITS.items():
        try:
            with open(_path(target, name), "rb") as handle:
                if handle.read(len(kit.id_bytes) + 1) == kit.id_bytes:
                    found.append(name)
        except OSError:
            pass
    return found


def foreign_entries(target: Path, entries=None) -> list:
    """Launchers, ID files and markers in the root of the stick that are not MiatOff's."""
    entries = os.listdir(long_path(target)) if entries is None else entries
    known_ids = _known_ids(target)
    found = []
    for name in entries:
        if _sidecar(name):
            continue
        if name.lower().endswith(".up") and not LAUNCHER_PATTERN.match(name):
            found.append(name)
        elif name.lower().endswith(".id") and name not in known_ids:
            found.append(name)
        elif name in stickkit.FOREIGN_MARKERS:
            found.append(name)
    return found


def _restore_text(_target=None) -> str:
    return (f"This USB stick has a file named {RESTORE_MARKER}. In the car it undoes the Meters and startup-warning "
            "changes without asking, so MiatOff will not write to this stick. If you no longer need that, delete the "
            "file yourself, or use another stick.")


def _foreign_text(found: list) -> str:
    names = ", ".join(name[:40] for name in found[:5])
    return (f"This USB stick holds files that are not from MiatOff: {names}. Nothing was changed. Use another stick, or "
            "move those files off this one first.")


def stick_issue(root):
    """What would stop MiatOff from writing to this stick, in plain English; None if nothing does."""
    try:
        entries = os.listdir(long_path(root))
        if RESTORE_MARKER.lower() in (name.lower() for name in entries):
            return _restore_text()
        found = foreign_entries(Path(root), entries)
    except OSError:
        return None
    return _foreign_text(found) if found else None


def replaces(target: Path, id_name: str):
    """The label of the other MiatOff kit this stick holds ("check" or "install"), which writing would replace."""
    try:
        others = [name for name in _known_ids(target) if name != id_name]
    except OSError:
        return None
    return KNOWN_KITS[others[0]].label if others else None


def read_manifest(target: Path) -> dict:
    """file -> sha256 from PAYLOAD.SHA256. Only ever advice: see the top of this file."""
    try:
        with open(_path(target, MANIFEST), encoding="utf-8", errors="replace") as handle:
            lines = handle.read().splitlines()
    except OSError:
        return {}
    entries = {}
    for line in lines:
        parts = line.split("  ", 1)
        if len(parts) == 2 and re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            entries[parts[1]] = parts[0]
    return entries


def _safe_relative(name: str) -> bool:
    parts = name.split("/")
    return "\\" not in name and ":" not in name and not name.startswith("/") and ".." not in parts and "" not in parts


def _collisions(target: Path, files: dict, manifest: dict) -> list:
    """Files on the stick that this write would overwrite without being able to tell they are MiatOff's."""
    found = []
    vouched = manifest if _known_ids(target) else {}
    for name, data in files.items():
        path = _path(target, name)
        if os.path.isdir(path):
            found.append(name)
        elif os.path.exists(path):
            actual = _sha256_file(path)
            if actual != stickkit.sha256(data) and vouched.get(name) != actual:
                found.append(name)
    return found


def _space_needed(target: Path, files: dict) -> int:
    """Bytes the files that still have to be written take on FAT32."""
    needed = SPACE_MARGIN
    for name, data in files.items():
        path = _path(target, name)
        if not (os.path.isfile(path) and os.path.getsize(path) == len(data) and _sha256_file(path) == stickkit.sha256(data)):
            needed += (len(data) // CLUSTER + 1) * CLUSTER
    return needed


def _write_file(target: Path, name: str, data: bytes) -> None:
    """A real file name only ever holds a complete file: written and flushed under a temporary name first.

    The temporary name is short: launcher names, TouchTune's among them, are already close to FAT's 255 characters.
    """
    final = _path(target, name)
    partial = os.path.join(os.path.dirname(final), hashlib.sha256(name.encode("utf-8")).hexdigest()[:16] + TEMP_SUFFIX)
    os.makedirs(os.path.dirname(final), exist_ok=True)
    with open(partial, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(partial, final)


def _same(target: Path, name: str, data: bytes) -> bool:
    path = _path(target, name)
    if not os.path.isfile(path):
        return False
    with open(path, "rb") as handle:
        return handle.read() == data


def _remove(target: Path, name: str) -> None:
    try:
        os.remove(_path(target, name))
    except FileNotFoundError:
        pass


def _remove_launchers(target: Path) -> None:
    for name in os.listdir(long_path(target)):
        if LAUNCHER_PATTERN.match(name):
            _remove(target, name)


def _remove_sidecars(target: Path) -> None:
    """macOS may add ._ files next to the launcher. The car's scanner reads every *.up name, so none may stay."""
    for name in os.listdir(long_path(target)):
        if _sidecar(name) and (name.lower().endswith((".up", ".id")) or name == "._" + TRIGGER):
            _remove(target, name)


def _remove_leftovers(target: Path) -> None:
    """Temporary files of a write that was cut off. Results and anything else on the stick are not looked at."""
    for folder, directories, names in os.walk(long_path(target)):
        if os.path.samefile(folder, long_path(target)):
            directories[:] = [d for d in directories if d not in KEEP_WALKING_OUT]
        for name in names:
            if name.endswith(TEMP_SUFFIX):
                os.remove(os.path.join(folder, name))


def _clear_kit(target: Path, id_name: str, keep: set, manifest: dict) -> None:
    """Remove another kit from the stick. Only its own files go: what the car or the user put there stays."""
    kit = KNOWN_KITS[id_name]
    for name, digest in manifest.items():
        if name in keep or not _safe_relative(name):
            continue
        belongs = name in kit.root_files or name.split("/")[0] in kit.folders
        path = _path(target, name)
        if belongs and os.path.isfile(path) and _sha256_file(path) == digest:
            os.remove(path)
    for folder in kit.folders:
        root = _path(target, folder)
        if os.path.isdir(root):
            for current, _directories, _names in os.walk(root, topdown=False):
                if not os.listdir(current):
                    os.rmdir(current)
    if MANIFEST not in keep:
        _remove(target, MANIFEST)
    if id_name not in keep:
        _remove(target, id_name)


def _write(kit, target: Path, plan, step) -> None:
    payload = kit.payload()
    launcher = kit.launcher_name()
    last = (launcher, TRIGGER, MANIFEST)
    body = {name: data for name, data in payload.items() if name not in last}

    step("inspect")
    entries = os.listdir(long_path(target))
    if RESTORE_MARKER.lower() in (name.lower() for name in entries):
        raise StickError(_restore_text())
    found = foreign_entries(target, entries)
    if found:
        raise StickError(_foreign_text(found))
    manifest = read_manifest(target)
    wrong = _collisions(target, body, manifest)
    if wrong:
        raise StickError(_foreign_text(wrong))
    needed, free = _space_needed(target, body), shutil.disk_usage(long_path(target)).free
    if needed > free:
        raise StickError(f"This USB stick is too full: MiatOff needs {needed / 1000 ** 2:.0f} MB and {free / 1000 ** 2:.0f} MB "
                         "is free. Nothing was changed. Free up some space or use another stick.")

    step("deactivate")
    _remove_launchers(target)
    _remove_sidecars(target)
    _remove(target, TRIGGER)
    _remove(target, PLAN_NAME)
    _remove_leftovers(target)

    step("clear")
    keep = set(payload)
    for id_name in _known_ids(target):
        if id_name != kit.id_name:
            _clear_kit(target, id_name, keep, manifest)

    step("payload")
    for name, data in body.items():
        if not _same(target, name, data):
            _write_file(target, name, data)
    _write_file(target, MANIFEST, payload[MANIFEST])

    step("plan")
    if plan is not None:
        text = plan.encode("ascii")
        _write_file(target, PLAN_NAME, text)
        if not _same(target, PLAN_NAME, text):
            raise StickError("ERROR: read-back verification of your choices failed")

    step("publish")
    for name, data in {**body, MANIFEST: payload[MANIFEST]}.items():
        if not _same(target, name, data):
            raise StickError(f"ERROR: read-back verification failed for {name[:60]}. Try again, or use another stick.")
    _write_file(target, TRIGGER, payload[TRIGGER])
    _write_file(target, launcher, payload[launcher])
    _remove_sidecars(target)
    problems = kit.verify(target)
    if problems:
        _remove(target, launcher)
        raise StickError("ERROR: read-back verification failed. Try again, or use another stick.")


def write(kit, target: Path, plan: str = None, progress=None) -> None:
    """Put kit on the stick. plan is the text of miatoff-plan.txt, if any; progress(label) reports each stage."""
    target = Path(target)
    if not target.is_dir():
        raise StickError(f"ERROR: {target} is not a directory (mounted stick root?)")

    reached = []

    def step(stage):
        reached.append(stage)
        if progress:
            progress(STAGE_LABEL[stage], stage)

    try:
        _write(kit, target, plan, step)
    except OSError as error:
        reason = ("the USB stick is full" if error.errno == errno.ENOSPC else
                  "the USB stick stopped responding or was unplugged")
        state = ("Nothing was changed." if reached[-1:] == ["inspect"] else
                 "A half-written stick is switched off, so it does nothing in the car.")
        raise StickError(f"Writing failed: {reason}. {state} Plug it back in and try again. ({error.strerror or error})") from error
