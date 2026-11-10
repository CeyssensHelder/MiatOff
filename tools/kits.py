"""The two MiatOff sticks: what goes on them and where it comes from.

Used by the command-line builders (dump-stick/build_stick.py and
aa-touch-stick/build_stick.py), by the GUI and by the packaged app. Nothing is
read at import time: a kit is put together when it is first asked for, so a
problem with a payload is reported as a StickError instead of stopping the
program while it loads.

The install stick:
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

    python tools/kits.py --digests out.json     sha256 of every file on both sticks

SPDX-License-Identifier: GPL-3.0-or-later
"""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import home_menu  # noqa: E402
import meters_library  # noqa: E402
import stickkit  # noqa: E402
from stickkit import StickError, sha256  # noqa: E402

ROOT = stickkit.ROOT
DUMP_DIR = ROOT / "dump-stick"
DUMP_STICK = DUMP_DIR / "stick"
INSTALL_DIR = ROOT / "aa-touch-stick"
INSTALL_STICK = INSTALL_DIR / "stick"
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
        raise StickError(f"ERROR: the selected custom pages need {len(data) / 1048576:.1f} MiB on the car; the limit is "
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
        raise StickError(f"ERROR: the custom pages selection is not valid: {error}")
    if len(bundle["items"]) > CUSTOM_PAGES_MAX:
        raise StickError(f"ERROR: select at most {CUSTOM_PAGES_MAX} custom pages for the car")
    for item in bundle["items"]:
        if len(item["setup"]["themes"][0]["pages"]) != 1:
            raise StickError("ERROR: each selected custom item must be a single page")
    return custom_pages_from_setups([item["setup"] for item in bundle["items"]])


def meters_files(custom=None, home=None) -> dict:
    """miatoff-app/ on the stick: the files (LF endings) plus their MANIFEST. `custom` is an optional selection
    bundle of designer pages that replaces js/custom-pages.js; `home` an optional Home menu design, which adds
    its runtime, design and pictures (home_menu.car_files)."""
    page = (ROOT / "meters" / "index.html").read_text(encoding="utf-8")
    loaded = re.findall(r'<script src="([^"]+)"', page) + re.findall(r'url\(([^)]+)\)', page)
    for name in loaded:
        if "app/meters/" + name.strip("'\"") not in METERS_FILES:
            raise StickError(f"ERROR: meters/index.html loads {name}, which is not in METERS_FILES")
    files, lines = {}, []
    for rel, src in METERS_FILES.items():
        # Fonts are binary; everything else is text with LF endings.
        if rel == CUSTOM_PAGES_REL:
            data = custom_pages_js(custom)
        else:
            data = (ROOT / src).read_bytes() if src.endswith(".ttf") else stickkit.lf_bytes(ROOT / src)
        files["miatoff-app/" + rel] = data
        lines.append(f"{sha256(data)}  {rel}\n")
    if home is not None:
        try:
            extra = home_menu.car_files(home)
        except (ValueError, KeyError, TypeError) as error:
            raise StickError(f"ERROR: the Home menu is not valid: {error}")
        for rel, data in extra.items():
            files["miatoff-app/" + rel] = data
            lines.append(f"{sha256(data)}  {rel}\n")
    files["miatoff-app/MANIFEST"] = "".join(lines).encode("ascii")
    return files


def pinned(name: str) -> str:
    """A sha256 constant from aa-touch.sh, so the builder and the CMU agree."""
    match = re.search(rf"^{name}=([0-9a-f]{{64}})\b", (INSTALL_STICK / "aa-touch.sh").read_text(), re.M)
    if not match:
        raise StickError(f"ERROR: {name} not found in aa-touch.sh")
    return match.group(1)


def release_shim() -> bytes:
    data = RELEASE_ZIP.read_bytes()
    sums = (VENDOR / "SHA256SUMS").read_text().split()
    if sha256(data) not in sums:
        raise StickError(f"ERROR: {RELEASE_ZIP.name} does not match vendor/oem-aa-mod/SHA256SUMS")
    with zipfile.ZipFile(RELEASE_ZIP) as archive:
        shim = archive.read(SHIM_MEMBER)
    if sha256(shim) != pinned("SHIM_SHA256"):
        raise StickError("ERROR: libpatch-blmjciaapa.so does not match SHIM_SHA256 in aa-touch.sh")
    return shim


def touchtune_files() -> dict:
    """Every file of the TouchTune 1.2.1 release, byte-identical, under touchtune/."""
    data = TOUCHTUNE_ZIP.read_bytes()
    expected = TOUCHTUNE_ZIP.with_name(TOUCHTUNE_ZIP.name + ".sha256").read_text().split()[0]
    if sha256(data) != expected:
        raise StickError(f"ERROR: {TOUCHTUNE_ZIP.name} does not match its .sha256")
    files = {}
    with zipfile.ZipFile(TOUCHTUNE_ZIP) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            if info.filename.startswith(("/", "..")) or "/../" in info.filename:
                raise StickError(f"ERROR: unsafe path in {TOUCHTUNE_ZIP.name}: {info.filename[:60]}")
            files["touchtune/" + info.filename] = archive.read(info)
    if "touchtune/install-patches.sh" not in files:
        raise StickError(f"ERROR: {TOUCHTUNE_ZIP.name} has no install-patches.sh at its root")
    return files


def aio_file(rel: str) -> bytes:
    """A vendored MZD-AIO file, checked against vendor/mzd-aio/SHA256SUMS."""
    data = (AIO / rel).read_bytes()
    sums = dict(reversed(line.split()) for line in (AIO / "SHA256SUMS").read_text().splitlines() if line.strip())
    if sums.get(rel) != sha256(data):
        raise StickError(f"ERROR: vendor/mzd-aio/{rel} does not match its SHA256SUMS")
    return data


def table(name: str) -> list:
    """Rows (name, stock sha256, new sha256) of a three-column table in aa-touch.sh."""
    match = re.search(rf"^{name}='(.*?)'$", (INSTALL_STICK / "aa-touch.sh").read_text(), re.M | re.S)
    if not match:
        raise StickError(f"ERROR: {name} not found in aa-touch.sh")
    return [tuple(line.split()) for line in match.group(1).splitlines()]


def safety_files() -> dict:
    """images/safety/<name>: the blank image, once per SafetyText image of the unit."""
    blank = aio_file(SAFETY_BLANK)
    files = {}
    for name, _stock, new in table("SAFETY_TABLE"):
        if new != sha256(blank):
            raise StickError(f"ERROR: SAFETY_TABLE wants {new[:12]} for {name}, the blank image is {sha256(blank)[:12]}")
        files["images/safety/" + name] = blank
    return files


def sensor_files() -> dict:
    """images/sensors/<folder>/<name>: the MZD-AIO parking sensor images in SENSOR_TABLE."""
    files = {}
    for rel, _stock, new in table("SENSOR_TABLE"):
        data = aio_file("transparent-parking-sensor/" + rel)
        if sha256(data) != new:
            raise StickError(f"ERROR: SENSOR_TABLE wants {new[:12]} for {rel}, vendor/mzd-aio has {sha256(data)[:12]}")
        files["images/sensors/" + rel] = data
    return files


@lru_cache(maxsize=None)
def dump_kit() -> stickkit.Kit:
    """The read-only check stick."""
    return stickkit.Kit(
        id_name="MIATOFF.ID",
        id_bytes=stickkit.lf_bytes(DUMP_STICK / "MIATOFF.ID"),
        script="dump.sh",
        script_bytes=stickkit.lf_bytes(DUMP_STICK / "dump.sh"),
    )


def _make_install_kit(custom=None, home=None) -> stickkit.Kit:
    conf = stickkit.lf_bytes(INSTALL_STICK / "libpatch.conf")
    if sha256(conf) != pinned("CONF_SHA256"):
        raise StickError("ERROR: stick/libpatch.conf does not match CONF_SHA256 in aa-touch.sh")
    return stickkit.Kit(
        id_name="AATOUCH.ID",
        id_bytes=stickkit.lf_bytes(INSTALL_STICK / "AATOUCH.ID"),
        script="aa-touch.sh",
        script_bytes=stickkit.lf_bytes(INSTALL_STICK / "aa-touch.sh"),
        extra={
            "oem-aa-mod/libpatch-blmjciaapa.so": release_shim(),
            "oem-aa-mod/libpatch.conf": conf,
            "LICENSE": (INSTALL_DIR / "LICENSE").read_bytes(),
            "NOTICE": stickkit.lf_bytes(INSTALL_STICK / "NOTICE"),
            **touchtune_files(),
            **meters_files(custom, home),
            **safety_files(),
            **sensor_files(),
        },
    )


@lru_cache(maxsize=None)
def _default_install_kit() -> stickkit.Kit:
    return _make_install_kit()


def install_kit(custom=None, home=None) -> stickkit.Kit:
    """The install stick; custom is an optional selection bundle of designer pages, home an optional Home menu."""
    if (not custom or not custom.get("items")) and home is None:
        return _default_install_kit()
    return _make_install_kit(custom if custom and custom.get("items") else None, home)


def run_builder(kit_factory, doc: str, argv: list) -> None:
    """The command line both build_stick.py scripts share."""
    try:
        if argv == ["--print-launcher"]:
            print(kit_factory().launcher_name())
        elif len(argv) == 2 and argv[0] == "--check":
            sys.exit(0 if kit_factory().check(Path(argv[1])) else 1)
        elif len(argv) == 1 and not argv[0].startswith("-"):
            stickkit.require_stick_root(Path(argv[0]))
            kit_factory().build(Path(argv[0]))
        else:
            raise SystemExit(doc)
    except StickError as error:
        raise SystemExit(str(error))


def designer_sources() -> list:
    """The web files of the Meters Designer, which the app serves to the browser on this PC."""
    files = [p for p in (ROOT / "meters" / "designer").rglob("*") if p.is_file() and p.suffix in (".html", ".css", ".js", ".mjs")]
    return sorted(p.relative_to(ROOT).as_posix() for p in files) + ["meters/js/designer-runtime.js"]


def bundle_sources() -> list:
    """Repository-relative path of every file the packaged app needs. The only files that go in the package."""
    fixed = [
        "LICENSE", "NOTICE", "packaging/miatoff.png", "packaging/miatoff-small.png",
        "launcher/main_instructions.ini", "launcher/versions.ini",
        "dump-stick/LICENSE", "dump-stick/stick/MIATOFF.ID", "dump-stick/stick/dump.sh",
        "aa-touch-stick/LICENSE", "aa-touch-stick/stick/AATOUCH.ID", "aa-touch-stick/stick/aa-touch.sh",
        "aa-touch-stick/stick/libpatch.conf", "aa-touch-stick/stick/NOTICE",
        "vendor/oem-aa-mod/oem-aa-mod-0.10.0.zip", "vendor/oem-aa-mod/SHA256SUMS",
        "vendor/touchtune/TouchTune-1.2.1.zip", "vendor/touchtune/TouchTune-1.2.1.zip.sha256",
        "vendor/mzd-aio/LICENSE", "vendor/mzd-aio/README.md", "vendor/mzd-aio/SHA256SUMS",
        "vendor/mzd-aio/" + SAFETY_BLANK,
    ]
    sensors = ["vendor/mzd-aio/transparent-parking-sensor/" + row[0] for row in table("SENSOR_TABLE")]
    home = [home_menu.RUNTIME_SRC.relative_to(ROOT).as_posix()]
    return sorted(set(fixed) | set(METERS_FILES.values()) | set(sensors) | set(designer_sources()) | set(home))


def payload_digests() -> dict:
    """kit -> {file: sha256}, and the Designer's web files: to compare a packaged app with the source it came from."""
    digests = {name: {path: sha256(data) for path, data in factory().payload().items()}
               for name, factory in (("dump", dump_kit), ("install", install_kit))}
    digests["designer"] = {rel: sha256((ROOT / rel).read_bytes()) for rel in designer_sources()}
    return digests


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--digests":
        Path(sys.argv[2]).write_text(json.dumps(payload_digests(), indent=1, sort_keys=True) + "\n", encoding="utf-8")
    else:
        raise SystemExit(__doc__)
