#!/usr/bin/env python3
"""Build the MiatOff AA-touch stick (touch in Android Auto via oem-aa-mod).

Usage:
    python build_stick.py E:\\            write the payload to the root of a FAT32 stick
    python build_stick.py --check E:\\    verify an existing stick
    python build_stick.py --print-launcher

The shim comes from vendor/oem-aa-mod/oem-aa-mod-0.10.0.zip, checked against
the release's SHA256SUMS and against the hash pinned in stick/aa-touch.sh.
The unmodified TouchTune 1.2.1 release (vendor/touchtune/, checked against its
.sha256) goes into touchtune/, so one stick does step 1 (TouchTune) and step 2
(AA touch). Meters goes into miatoff-app/ (the HMI app from meters-app/app, the
page from meters/, the collector, the userscript) with a MANIFEST of sha256s
that aa-touch.sh checks before and after copying.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import re
import sys
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "tools"))
import stickkit  # noqa: E402
from stickkit import long_path, posix_cksum, sha256  # noqa: E402,F401  (re-exported for tests)

STICK = HERE / "stick"
VENDOR = ROOT / "vendor" / "oem-aa-mod"
RELEASE_ZIP = VENDOR / "oem-aa-mod-0.10.0.zip"
SHIM_MEMBER = "oem-aa-mod-0.10.0/libpatch-blmjciaapa.so"
TOUCHTUNE_ZIP = ROOT / "vendor" / "touchtune" / "TouchTune-1.2.1.zip"

# Meters on the unit: <area>/<path> -> source in this repository.
# meters/: only the files the car needs (overview.html is for the PC).
METERS_FILES = {
    "app/js/miatoffApp.js": "meters-app/app/js/miatoffApp.js",
    "app/css/miatoffApp.css": "meters-app/app/css/miatoffApp.css",
    "app/templates/MiatoffMeters/js/MiatoffMetersTmplt.js": "meters-app/app/templates/MiatoffMeters/js/MiatoffMetersTmplt.js",
    "app/templates/MiatoffMeters/css/MiatoffMetersTmplt.css": "meters-app/app/templates/MiatoffMeters/css/MiatoffMetersTmplt.css",
    "app/meters/index.html": "meters/index.html",
    "app/meters/js/gauges.js": "meters/js/gauges.js",
    "app/meters/js/data.js": "meters/js/data.js",
    "app/meters/js/power.js": "meters/js/power.js",
    "app/meters/js/fx.js": "meters/js/fx.js",
    "app/meters/js/cyber.js": "meters/js/cyber.js",
    "app/meters/js/y2077.js": "meters/js/y2077.js",
    "app/meters/js/app.js": "meters/js/app.js",
    "app/meters/fonts/ChakraPetch-Bold.ttf": "meters/fonts/ChakraPetch-Bold.ttf",
    "app/meters/fonts/ShareTechMono-Regular.ttf": "meters/fonts/ShareTechMono-Regular.ttf",
    "app/meters/fonts/OFL-ChakraPetch.txt": "meters/fonts/OFL-ChakraPetch.txt",
    "app/meters/fonts/OFL-ShareTechMono.txt": "meters/fonts/OFL-ShareTechMono.txt",
    "app/collector/miatoff-collector.sh": "collector/miatoff-collector.sh",
    "userjs/miatoff-apps.js": "meters-app/userjs/miatoff-apps.js",
}


def meters_files() -> dict:
    """miatoff-app/ on the stick: the files (LF endings) plus their MANIFEST."""
    page = (ROOT / "meters" / "index.html").read_text(encoding="utf-8")
    loaded = re.findall(r'<script src="([^"]+)"', page) + re.findall(r'url\(([^)]+)\)', page)
    for name in loaded:
        if "app/meters/" + name.strip("'\"") not in METERS_FILES:
            raise SystemExit(f"ERROR: meters/index.html loads {name}, which is not in METERS_FILES")
    files, lines = {}, []
    for rel, src in METERS_FILES.items():
        # Fonts are binary; everything else is text with LF endings.
        data = (ROOT / src).read_bytes() if src.endswith(".ttf") else stickkit.lf_bytes(ROOT / src)
        files["miatoff-app/" + rel] = data
        lines.append(f"{sha256(data)}  {rel}\n")
    files["miatoff-app/MANIFEST"] = "".join(lines).encode("ascii")
    return files


def pinned(name: str) -> str:
    """A sha256 constant from aa-touch.sh, so the builder and the CMU agree."""
    match = re.search(rf"^{name}=([0-9a-f]{{64}})\b", (STICK / "aa-touch.sh").read_text(), re.M)
    if not match:
        raise SystemExit(f"ERROR: {name} not found in aa-touch.sh")
    return match.group(1)


def release_shim() -> bytes:
    data = RELEASE_ZIP.read_bytes()
    sums = (VENDOR / "SHA256SUMS").read_text().split()
    if sha256(data) not in sums:
        raise SystemExit(f"ERROR: {RELEASE_ZIP.name} does not match vendor/oem-aa-mod/SHA256SUMS")
    with zipfile.ZipFile(RELEASE_ZIP) as archive:
        shim = archive.read(SHIM_MEMBER)
    if sha256(shim) != pinned("SHIM_SHA256"):
        raise SystemExit("ERROR: libpatch-blmjciaapa.so does not match SHIM_SHA256 in aa-touch.sh")
    return shim


def touchtune_files() -> dict:
    """Every file of the TouchTune 1.2.1 release, byte-identical, under touchtune/."""
    data = TOUCHTUNE_ZIP.read_bytes()
    expected = TOUCHTUNE_ZIP.with_name(TOUCHTUNE_ZIP.name + ".sha256").read_text().split()[0]
    if sha256(data) != expected:
        raise SystemExit(f"ERROR: {TOUCHTUNE_ZIP.name} does not match its .sha256")
    files = {}
    with zipfile.ZipFile(TOUCHTUNE_ZIP) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            if info.filename.startswith(("/", "..")) or "/../" in info.filename:
                raise SystemExit(f"ERROR: unsafe path in {TOUCHTUNE_ZIP.name}: {info.filename[:60]}")
            files["touchtune/" + info.filename] = archive.read(info)
    if "touchtune/install-patches.sh" not in files:
        raise SystemExit(f"ERROR: {TOUCHTUNE_ZIP.name} has no install-patches.sh at its root")
    return files


def make_kit() -> stickkit.Kit:
    conf = stickkit.lf_bytes(STICK / "libpatch.conf")
    if sha256(conf) != pinned("CONF_SHA256"):
        raise SystemExit("ERROR: stick/libpatch.conf does not match CONF_SHA256 in aa-touch.sh")
    return stickkit.Kit(
        id_name="AATOUCH.ID",
        id_bytes=stickkit.lf_bytes(STICK / "AATOUCH.ID"),
        script="aa-touch.sh",
        script_bytes=stickkit.lf_bytes(STICK / "aa-touch.sh"),
        extra={
            "oem-aa-mod/libpatch-blmjciaapa.so": release_shim(),
            "oem-aa-mod/libpatch.conf": conf,
            "LICENSE": (HERE / "LICENSE").read_bytes(),
            "NOTICE": stickkit.lf_bytes(STICK / "NOTICE"),
            **touchtune_files(),
            **meters_files(),
        },
    )


KIT = make_kit()


def launcher_name() -> str:
    return KIT.launcher_name()


def payload() -> dict:
    return KIT.payload()


def check(target: Path) -> bool:
    return KIT.check(Path(target))


def build(target: Path) -> None:
    KIT.build(Path(target))


def main(argv: list) -> None:
    if argv == ["--print-launcher"]:
        print(launcher_name())
    elif len(argv) == 2 and argv[0] == "--check":
        sys.exit(0 if check(Path(argv[1])) else 1)
    elif len(argv) == 1 and not argv[0].startswith("-"):
        stickkit.require_stick_root(Path(argv[0]))
        build(Path(argv[0]))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
