#!/usr/bin/env python3
"""Build the MiatOff AA-touch stick (touch in Android Auto via oem-aa-mod).

Usage:
    python build_stick.py E:\\            write the payload to the root of a FAT32 stick
    python build_stick.py --check E:\\    verify an existing stick
    python build_stick.py --print-launcher
    python build_stick.py --custom-pages FILE E:\\   also put the designer pages of FILE (a selection exported
                                                from the builder's Meters Designer tab) in the Meters payload;
                                                use the same flag with --check

The shim comes from vendor/oem-aa-mod/oem-aa-mod-0.10.0.zip, checked against
the release's SHA256SUMS and against the hash pinned in stick/aa-touch.sh.
The unmodified TouchTune 1.2.1 release (vendor/touchtune/, checked against its
.sha256) goes into touchtune/, so one stick does step 1 (TouchTune) and step 2
(AA touch). Meters goes into miatoff-app/ (the HMI app from meters-app/app, the
page from meters/, the collector, the userscript) with a MANIFEST of sha256s
that aa-touch.sh checks before and after copying. Camera text: the blank safety
text image from vendor/mzd-aio/ (checked against its SHA256SUMS) goes into
images/safety/ once per SafetyText image in SAFETY_TABLE of aa-touch.sh; the
parking sensor images in SENSOR_TABLE go into images/sensors/.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import hashlib
import json
import re
import sys
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "tools"))
import meters_library  # noqa: E402
import stickkit  # noqa: E402
from stickkit import long_path, posix_cksum, sha256  # noqa: E402,F401  (re-exported for tests)

STICK = HERE / "stick"
VENDOR = ROOT / "vendor" / "oem-aa-mod"
RELEASE_ZIP = VENDOR / "oem-aa-mod-0.10.0.zip"
SHIM_MEMBER = "oem-aa-mod-0.10.0/libpatch-blmjciaapa.so"
TOUCHTUNE_ZIP = ROOT / "vendor" / "touchtune" / "TouchTune-1.2.1.zip"
AIO = ROOT / "vendor" / "mzd-aio"
SAFETY_BLANK = "safety-warning-reverse-camera/SafetyText_UK_English.png"

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
    "app/meters/js/custom-pages.js": "meters/js/custom-pages.js",
    "app/meters/js/custom.js": "meters/js/custom.js",
    "app/meters/js/app.js": "meters/js/app.js",
    "app/meters/fonts/ChakraPetch-Bold.ttf": "meters/fonts/ChakraPetch-Bold.ttf",
    "app/meters/fonts/ShareTechMono-Regular.ttf": "meters/fonts/ShareTechMono-Regular.ttf",
    "app/meters/fonts/Rajdhani-Bold.ttf": "meters/fonts/Rajdhani-Bold.ttf",
    "app/meters/fonts/RussoOne-Regular.ttf": "meters/fonts/RussoOne-Regular.ttf",
    "app/meters/fonts/OFL-ChakraPetch.txt": "meters/fonts/OFL-ChakraPetch.txt",
    "app/meters/fonts/OFL-ShareTechMono.txt": "meters/fonts/OFL-ShareTechMono.txt",
    "app/meters/fonts/OFL-Rajdhani.txt": "meters/fonts/OFL-Rajdhani.txt",
    "app/meters/fonts/OFL-RussoOne.txt": "meters/fonts/OFL-RussoOne.txt",
    "app/collector/miatoff-collector.sh": "collector/miatoff-collector.sh",
    "userjs/miatoff-apps.js": "meters-app/userjs/miatoff-apps.js",
}


CUSTOM_PAGES_REL = "app/meters/js/custom-pages.js"
CUSTOM_PAGES_LIMIT = 6 * 1024 * 1024  # bytes of generated JavaScript; the car loads it with the page
CUSTOM_PAGES_MAX = 8                  # pages in the car's CUSTOM group
# Widget fields the car does not need (the editor's own bookkeeping).
CUSTOM_DROP = ("id", "locked", "role", "legacyScaleSource")


def car_page(setup: dict, images: dict) -> dict:
    """One validated single-page setup, reduced to what the car draws: night look, page, vehicle settings."""
    theme = setup["themes"][0]
    page = theme["pages"][0]
    out = {
        "name": page["name"],
        "style": {**theme["style"], **page.get("style", {})},
        "widgets": [{k: v for k, v in w.items() if k not in CUSTOM_DROP} for w in page["widgets"]],
        "vehicle": {"rpm": setup["vehicle"]["rpm"], "units": setup["vehicle"]["units"]},
    }
    background = page.get("background") or theme.get("background")
    if background:
        out["background"] = background
        asset = background.get("asset")
        if asset and background.get("kind") == "image":
            data = setup["assets"][asset]["data"]
            digest = hashlib.sha256(data.encode("ascii")).hexdigest()
            images[digest] = data
            out["images"] = {asset: digest}
    return out


def custom_pages_from_setups(setups: list) -> bytes:
    """js/custom-pages.js for already validated single-page setups: ASCII, fixed key order, so the same pages
    always give the same bytes."""
    images = {}
    pages = [car_page(setup, images) for setup in setups]
    dump = lambda value: json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)
    text = ("/* MiatOff Meters - custom pages from the Meters Designer, generated by the stick builder. */\n"
            f"window.MeterCustomPages = {dump(pages)};\n"
            f"window.MeterCustomImages = {dump(images)};\n")
    data = text.encode("ascii")
    if len(data) > CUSTOM_PAGES_LIMIT:
        raise SystemExit(f"ERROR: the selected custom pages need {len(data) / 1048576:.1f} MiB on the car; the limit is "
                         f"{CUSTOM_PAGES_LIMIT // 1048576} MiB. Select fewer pages or use smaller background images.")
    return data


def custom_pages_js(custom=None) -> bytes:
    """js/custom-pages.js for a selection bundle (as PageLibrary.selection() or a tab 3 export gives it).
    No bundle, or one without pages, gives the repository's default file (no CUSTOM group)."""
    if custom is None or not custom.get("items"):
        return stickkit.lf_bytes(ROOT / "meters" / "js" / "custom-pages.js")
    try:
        bundle = meters_library.validate_selection(custom)
    except (ValueError, KeyError, TypeError) as error:
        raise SystemExit(f"ERROR: the custom pages selection is not valid: {error}")
    if len(bundle["items"]) > CUSTOM_PAGES_MAX:
        raise SystemExit(f"ERROR: select at most {CUSTOM_PAGES_MAX} custom pages for the car")
    for item in bundle["items"]:
        if len(item["setup"]["themes"][0]["pages"]) != 1:
            raise SystemExit("ERROR: each selected custom item must be a single page")
    return custom_pages_from_setups([item["setup"] for item in bundle["items"]])


def meters_files(custom=None) -> dict:
    """miatoff-app/ on the stick: the files (LF endings) plus their MANIFEST. `custom` is an optional selection
    bundle of designer pages that replaces js/custom-pages.js."""
    page = (ROOT / "meters" / "index.html").read_text(encoding="utf-8")
    loaded = re.findall(r'<script src="([^"]+)"', page) + re.findall(r'url\(([^)]+)\)', page)
    for name in loaded:
        if "app/meters/" + name.strip("'\"") not in METERS_FILES:
            raise SystemExit(f"ERROR: meters/index.html loads {name}, which is not in METERS_FILES")
    files, lines = {}, []
    for rel, src in METERS_FILES.items():
        # Fonts are binary; everything else is text with LF endings.
        if rel == CUSTOM_PAGES_REL:
            data = custom_pages_js(custom)
        else:
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


def aio_file(rel: str) -> bytes:
    """A vendored MZD-AIO file, checked against vendor/mzd-aio/SHA256SUMS."""
    data = (AIO / rel).read_bytes()
    sums = dict(reversed(line.split()) for line in (AIO / "SHA256SUMS").read_text().splitlines() if line.strip())
    if sums.get(rel) != sha256(data):
        raise SystemExit(f"ERROR: vendor/mzd-aio/{rel} does not match its SHA256SUMS")
    return data


def table(name: str) -> list:
    """Rows (name, stock sha256, new sha256) of a three-column table in aa-touch.sh."""
    match = re.search(rf"^{name}='(.*?)'$", (STICK / "aa-touch.sh").read_text(), re.M | re.S)
    if not match:
        raise SystemExit(f"ERROR: {name} not found in aa-touch.sh")
    return [tuple(line.split()) for line in match.group(1).splitlines()]


def safety_files() -> dict:
    """images/safety/<name>: the blank image, once per SafetyText image of the unit."""
    blank = aio_file(SAFETY_BLANK)
    files = {}
    for name, _stock, new in table("SAFETY_TABLE"):
        if new != sha256(blank):
            raise SystemExit(f"ERROR: SAFETY_TABLE wants {new[:12]} for {name}, the blank image is {sha256(blank)[:12]}")
        files["images/safety/" + name] = blank
    return files


def sensor_files() -> dict:
    """images/sensors/<folder>/<name>: the MZD-AIO parking sensor images in SENSOR_TABLE."""
    files = {}
    for rel, _stock, new in table("SENSOR_TABLE"):
        data = aio_file("transparent-parking-sensor/" + rel)
        if sha256(data) != new:
            raise SystemExit(f"ERROR: SENSOR_TABLE wants {new[:12]} for {rel}, vendor/mzd-aio has {sha256(data)[:12]}")
        files["images/sensors/" + rel] = data
    return files


def make_kit(custom=None) -> stickkit.Kit:
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
            **meters_files(custom),
            **safety_files(),
            **sensor_files(),
        },
    )


KIT = make_kit()


def launcher_name() -> str:
    return KIT.launcher_name()


def kit_for(custom=None) -> stickkit.Kit:
    return KIT if not custom or not custom.get("items") else make_kit(custom)


def payload(custom=None) -> dict:
    return kit_for(custom).payload()


def check(target: Path, custom=None) -> bool:
    return kit_for(custom).check(Path(target))


def build(target: Path, custom=None) -> None:
    kit_for(custom).build(Path(target))


def load_selection(path: str) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SystemExit(f"ERROR: cannot read the custom pages file {path}: {error}")


def main(argv: list) -> None:
    custom = None
    if "--custom-pages" in argv:
        at = argv.index("--custom-pages")
        if at + 1 >= len(argv):
            raise SystemExit(__doc__)
        custom = load_selection(argv[at + 1])
        argv = argv[:at] + argv[at + 2:]
    if argv == ["--print-launcher"]:
        print(launcher_name())
    elif len(argv) == 2 and argv[0] == "--check":
        sys.exit(0 if check(Path(argv[1]), custom) else 1)
    elif len(argv) == 1 and not argv[0].startswith("-"):
        stickkit.require_stick_root(Path(argv[0]))
        build(Path(argv[0]), custom)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
