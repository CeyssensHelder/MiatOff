"""Local custom-Meters library and design-only builder exports. GPL-3.0-or-later.

This stores portable v3 editor data. It does not install it on the head unit.
SQLite transactions let the browser server and Tk builder share one library.
"""
from copy import deepcopy
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import struct
import sys
import tempfile

import home_menu

LEGACY_DB = Path(__file__).resolve().parents[1] / ".miatoff" / "custom-meters.sqlite3"
DB_NAME = "custom-meters.sqlite3"
SELECTION_NAME = "miatoff-custom-meters.json"
MAX_DOCUMENT = 8 * 1024 * 1024
# Keep in step with `fonts` in meters/designer/v3/model.mjs.
FONTS = ["Arial", "MO Chakra", "MO Mono", "MO Condensed", "MO Sport"]
VARIANTS = {
    "number": ["plain", "framed", "inset"], "radial": ["arc", "needle", "segmented"],
    "bar": ["continuous", "segmented", "dotted"], "gmeter": ["circle", "octagon", "rounded"],
    "shift": ["led", "rectangles"], "warning": ["icon", "text"], "history": ["line", "area"],
    "power": ["curves"], "lap": ["full", "compact"], "session": ["cards"], "label": ["text"],
    "shape": ["rectangle", "rounded", "octagon", "line"],
}
UNITS = {
    "speed": ["km/h", "mph"], "rpm": ["rpm"], "gear": [""],
    "coolant": ["°C", "°F"], "iat": ["°C", "°F"], "outside": ["°C", "°F"],
    "fuel": ["%"], "trip": ["km", "mi"], "consumption": ["L/100km", "mpg UK", "mpg US"],
    "gLat": ["g"], "gLong": ["g"], "throttle": ["%"], "power": ["PS", "hp", "kW"],
    "torque": ["Nm", "lb-ft"],
}


def user_library_path(env=None, home=None, system=None):
    """Per-user library location, outside any checkout: nothing here touches the disk."""
    env = os.environ if env is None else env
    home = Path.home() if home is None else Path(home)
    system = sys.platform if system is None else system
    if system.startswith("win"):
        base = Path(env.get("APPDATA") or home / "AppData" / "Roaming")
    elif system == "darwin":
        base = home / "Library" / "Application Support"
    else:
        xdg = env.get("XDG_DATA_HOME", "")
        base = Path(xdg) if xdg and Path(xdg).is_absolute() else home / ".local" / "share"
    return base / "MiatOff" / DB_NAME


def copy_database(source, target):
    """Copy a SQLite file with the backup API (consistent even if open elsewhere).

    The source is opened read-only and is never modified. The target appears only when the
    copy is complete and verified, and an existing target is never replaced.
    """
    source, target = Path(source), Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".library-", suffix=".tmp", delete=False) as handle:
            temp = Path(handle.name)
        src = sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True, timeout=5)
        try:
            dst = sqlite3.connect(temp)
            try:
                src.backup(dst)
                require(dst.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "Copied library failed its integrity check")
            finally:
                dst.close()
        finally:
            src.close()
        try:
            os.link(temp, target)  # fails if another process created the target first
        except FileExistsError:
            pass
        except OSError:
            if not target.exists():
                os.replace(temp, target)
    finally:
        if temp and temp.exists():
            temp.unlink()


def resolve_library_path(env=None, home=None, legacy=None, system=None):
    """The library the builder and the designer share.

    MIATOFF_METERS_LIBRARY wins. Otherwise the per-user file; on first use an older checkout-local
    library is copied there (the old file is left untouched). If that copy fails, keep using the
    old file so no data seems to vanish.
    """
    env = os.environ if env is None else env
    if env.get("MIATOFF_METERS_LIBRARY"):
        return Path(env["MIATOFF_METERS_LIBRARY"])
    legacy = LEGACY_DB if legacy is None else Path(legacy)
    target = user_library_path(env, home, system)
    if not target.exists() and legacy.is_file():
        try:
            copy_database(legacy, target)
        except Exception as error:
            print(f"MiatOff: could not copy the old custom meters library ({error}); still using {legacy}", file=sys.stderr)
            return legacy
    return target


def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def number(value, low, high, integer=False):
    return (type(value) in (int, float) and math.isfinite(value) and low <= value <= high
            and (not integer or type(value) is int))


def text(value, limit=80):
    return isinstance(value, str) and len(value) <= limit


def image_size(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16] == b"IHDR" and len(data) >= 33:
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        i = 2
        while i + 4 <= len(data):
            require(data[i] == 255, "Invalid JPEG marker")
            while i < len(data) and data[i] == 255:
                i += 1
            require(i < len(data), "Truncated JPEG")
            marker = data[i]
            i += 1
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                continue
            require(i + 2 <= len(data), "Truncated JPEG")
            size = int.from_bytes(data[i:i + 2], "big")
            require(size >= 2 and i + size <= len(data), "Truncated JPEG segment")
            if marker in (0xC0, 0xC1, 0xC2):
                require(size >= 8, "Invalid JPEG dimensions")
                height, width = struct.unpack(">HH", data[i + 3:i + 7])
                return width, height
            i += size
    raise ValueError("Expected a normalized PNG or JPEG image")


def _positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def car_gearing(vehicle):
    """The gearing the car uses to work out the gear: ratios, final drive and rolling circumference (and the tyre
    they came from), only when all of it is there. Anything missing leaves the car on its built-in ND1 table."""
    ratios = vehicle.get("ratios")
    if not (isinstance(ratios, list) and ratios and all(_positive(r) for r in ratios)
            and _positive(vehicle.get("finalDrive")) and _positive(vehicle.get("circumference"))):
        return {}
    out = {"ratios": list(ratios), "finalDrive": vehicle["finalDrive"], "circumference": vehicle["circumference"]}
    if vehicle.get("tyre") is not None:
        out["tyre"] = vehicle["tyre"]
    return out


CAR_LABEL_MAX = 60
CAR_DEFAULT_LABEL = "My car"


def car_profile(vehicle, label=None):
    """The reduced car profile the Meters on the car use (js/car-profile.js), from the designer's project.vehicle.
    Raises ValueError for an invalid vehicle or label. The gearing keys are present only when it is complete."""
    validate_vehicle(vehicle)
    require(label is None or isinstance(label, str), "Invalid car label")
    label = (label or "").strip() or CAR_DEFAULT_LABEL
    require(len(label) <= CAR_LABEL_MAX, f"The car label is longer than {CAR_LABEL_MAX} characters")
    out = {"label": label}
    for key in ("preset", "generation", "engine", "transmission", "market", "tyre"):
        out[key] = vehicle.get(key)
    out["rpm"] = {key: vehicle["rpm"][key] for key in ("max", "amber", "red", "shift", "limit")}
    for key in ("ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass"):
        out[key] = vehicle.get(key)
    out["units"] = dict(vehicle["units"])
    out.update({k: v for k, v in car_gearing(vehicle).items() if k in ("ratios", "finalDrive", "circumference")})
    return out


def validate_vehicle(v):
    """Check the vehicle profile of a setup (identity, rpm, units, numbers, gearing, preset, tyre). Returns it."""
    require(isinstance(v, dict), "Invalid vehicle identity")
    require(v.get("generation") in ("ND1", "ND2") and v.get("engine") in ("1.5", "2.0") and
            v.get("body") in ("roadster", "RF", "rf") and v.get("transmission") in ("manual", "automatic")
            and number(v.get("year"), 1989, 2100, True) and text(v.get("market"), 40), "Invalid vehicle identity")
    rpm = [v.get("rpm", {}).get(key) for key in ("amber", "red", "shift", "limit", "max")]
    require(all(number(n, 1, 15000, True) for n in rpm) and rpm == sorted(rpm), "Invalid RPM settings")
    for key, choices in {"speed": UNITS["speed"], "distance": UNITS["trip"], "temperature": ["C", "F"],
                         "power": UNITS["power"], "torque": UNITS["torque"], "consumption": UNITS["consumption"]}.items():
        require(v.get("units", {}).get(key) in choices, "Invalid vehicle units")
    for key in ("mass", "cda", "crr", "eff", "finalDrive", "circumference", "ratedPower", "ratedTorque", "powerRpm", "torqueRpm"):
        require(v.get(key) is None or number(v[key], 0, 100000), "Invalid vehicle " + key)
    require(isinstance(v.get("ratios"), list) and len(v["ratios"]) <= 10 and
            all(n is None or number(n, .000001, 20) for n in v["ratios"]), "Invalid gear ratios")
    require(v.get("preset") is None or (isinstance(v["preset"], str) and re.fullmatch(r"[a-z0-9-]{1,40}", v["preset"])),
            "Invalid vehicle preset")
    require(v.get("tyre") is None or (isinstance(v["tyre"], str) and re.fullmatch(r"\d{3}/\d{2}R\d{2}", v["tyre"], re.ASCII)),
            "Invalid tyre size")
    assumed = v.get("assumed")
    require(assumed is None or (isinstance(assumed, list) and len(assumed) <= 30 and
            all(isinstance(n, str) and len(n) <= 40 and re.fullmatch(r"[A-Za-z.]+", n) for n in assumed)),
            "Invalid assumed fields")
    return v


def validate_setup(doc):
    """Validate the single-theme editor snapshot accepted by the local handoff.

    No migration and no executable renderer here. Client and preview additionally
    use the editor's complete validator and browser image decoder.
    """
    require(isinstance(doc, dict) and doc.get("version") == 3 and doc.get("kind") == "MetersSetup",
            "Send a version 3 Meters setup")
    require(len(encode(doc)) <= MAX_DOCUMENT, "Theme exceeds 8 MiB")

    def walk(value, depth=0):
        require(depth <= 30, "Document is too deeply nested")
        if isinstance(value, float):
            require(math.isfinite(value), "Nonfinite value")
        if isinstance(value, dict):
            for key, item in value.items():
                require(key not in ("__proto__", "constructor", "prototype"), "Invalid property")
                walk(item, depth + 1)
        elif isinstance(value, list):
            for item in value:
                walk(item, depth + 1)
    walk(doc)
    require(len(encode({**doc, "assets": {}})) <= 262144, "Definitions exceed 256 KiB")
    themes, assets = doc.get("themes"), doc.get("assets", {})
    require(isinstance(themes, list) and len(themes) == 1, "Send one selected theme at a time")
    require(isinstance(assets, dict) and len(assets) <= 3, "Maximum three images per theme")
    for asset in assets.values():
        require(isinstance(asset, dict), "Invalid asset")
        value = asset.get("data", "")
        match = re.fullmatch(r"data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)", value)
        require(match is not None and len(value) <= 2097152, "Invalid or oversized embedded image")
        data = base64.b64decode(match[2], validate=True)
        require(len(data) <= 1572864, "Image exceeds 1.5 MiB")
        width, height = image_size(data)
        require(0 < width <= 800 and 0 < height <= 480 and (width, height) ==
                (asset.get("width"), asset.get("height")), "Image dimensions must match and fit 800×480")
        require((match[1] == "png") == data.startswith(b"\x89PNG"), "Image type does not match")
        if asset.get("hash"):
            require(hashlib.sha256(value.encode()).hexdigest() == asset["hash"], "Image hash mismatch")

    ids = set()

    def unique(item):
        key = item.get("id")
        require(text(key, 100) and key and key not in ids, "Missing or duplicate ID")
        ids.add(key)

    def style(value):
        require(isinstance(value, dict), "Invalid style")
        for key in ("color", "panelColor", "borderColor", "textColor", "captionColor", "unitColor", "warningColor", "glowColor"):
            if key in value:
                require(isinstance(value[key], str) and re.fullmatch(r"#[\da-fA-F]{6}", value[key]), "Invalid style color")
        for key, choices in {"font": FONTS, "effect": ["flat", "framed", "raised", "inset", "neon"],
                             "align": ["left", "center", "right"], "weight": ["normal", "bold"],
                             "captionAlign": ["left", "center", "right"], "unitAlign": ["left", "center", "right"],
                             "captionWeight": ["normal", "bold"], "unitWeight": ["normal", "bold"]}.items():
            if key in value:
                require(value[key] in choices, "Invalid style " + key)
        for key, low, high in [("intensity", 0, 1), ("captionSize", 8, 60), ("unitSize", 8, 60), ("radius", 0, 50),
                               ("borderWidth", 0, 8), ("bevel", 0, 12), ("shadowBlur", 0, 24), ("shadowX", -12, 12),
                               ("shadowY", -12, 12), ("glow", 0, 24), ("lightAngle", 0, 360)]:
            if key in value:
                require(number(value[key], low, high), "Invalid style " + key)

    references = set()

    def background(value):
        require(isinstance(value, dict) and value.get("kind") in
                ("solid", "linear", "radial", "grid", "carbon", "noise", "image"), "Invalid background")
        for key in ("color", "color2"):
            require(isinstance(value.get(key), str) and re.fullmatch(r"#[\da-fA-F]{6}", value[key]), "Invalid background color")
        for key in ("x", "y", "opacity", "dim", "textureOpacity"):
            require(number(value.get(key), 0, 1), "Invalid background " + key)
        require(value.get("fit") in ("cover", "contain") and number(value.get("angle"), 0, 360)
                and number(value.get("spacing"), 4, 200), "Invalid background settings")
        stops = value.get("stops")
        require(isinstance(stops, list) and 2 <= len(stops) <= 8, "Use 2–8 gradient stops")
        previous = 0
        for stop in stops:
            require(number(stop.get("at"), previous, 1) and isinstance(stop.get("color"), str)
                    and re.fullmatch(r"#[\da-fA-F]{6}", stop["color"]), "Invalid gradient stop")
            previous = stop["at"]
        if value.get("asset"):
            references.add(value["asset"])
        if value["kind"] == "image":
            require(value.get("asset") in assets, "Missing background asset")

    theme = themes[0]
    require(isinstance(theme, dict), "Invalid theme")
    unique(theme)
    require(theme.get("version") == 3 and text(theme.get("name")) and text(theme.get("author", "")), "Invalid theme identity")
    for key in ("style", "dayStyle"):
        style(theme.get(key))
    for key in ("background", "dayBackground"):
        if theme.get(key) is not None:
            background(theme[key])
    pages = theme.get("pages")
    require(isinstance(pages, list) and 1 <= len(pages) <= 8, "Use 1–8 pages")
    for page in pages:
        unique(page)
        widgets = page.get("widgets")
        require(text(page.get("name")) and isinstance(widgets, list) and len(widgets) <= 24, "Invalid page")
        for key in ("style", "dayStyle"):
            if page.get(key) is not None:
                style(page[key])
        for key in ("background", "dayBackground"):
            if page.get(key) is not None:
                background(page[key])
        for w in widgets:
            unique(w)
            require(w.get("variant") in VARIANTS.get(w.get("type"), []), "Invalid instrument variant")
            bound = w["type"] in ("number", "radial", "bar", "history", "warning")
            require(w.get("signal") in UNITS if bound else w.get("signal") is None, "Invalid reading")
            require(text(w.get("label")) and w.get("labelMode") in ("auto", "custom"), "Invalid caption")
            require(all(number(w.get(k), low, high) for k, low, high in
                        [("x", 0, 800), ("y", 0, 480), ("w", 8, 800), ("h", 8, 480), ("size", 8, 280)])
                    and w["x"] + w["w"] <= 800 and w["y"] + w["h"] <= 480, "Instrument is outside the canvas")
            for k in ("locked", "hidden", "abbreviate", "sparkline", "grid", "trail", "peaks", "showSpeed", "showRpm", "showLaps"):
                require(type(w.get(k)) is bool, "Invalid " + k)
            for k, low, high in [("segments", 1, 80), ("ticks", 0, 24), ("decimals", 0, 3)]:
                require(number(w.get(k), low, high, True), "Invalid " + k)
            for k, low, high in [("gap", 0, 30), ("thickness", 1, 50), ("sweep", 30, 360), ("window", 1, 120),
                                 ("gRange", .1, 10), ("powerMax", 1, 2000), ("torqueMax", 1, 3000)]:
                require(number(w.get(k), low, high), "Invalid " + k)
            require(w.get("labelPosition") in ("top", "bottom", "hidden") and w.get("unitPosition") in
                    ("label", "value", "separate", "hidden"), "Invalid label/unit placement")
            require(w.get("orientation") in (["horizontal", "vertical", "diagonal", "custom"] if w["type"] == "shape"
                                            else ["horizontal", "vertical", "diagonal"]), "Invalid orientation")
            require(w.get("role") == "content" or (w.get("role") == "background" and w["type"] == "shape"), "Invalid layout role")
            scale, warning = w.get("scale", {}), w.get("warning", {})
            require(scale.get("mode") in ("auto", "custom"), "Invalid scale")
            if scale["mode"] == "custom":
                require(bound and number(scale.get("min"), -1e300, 1e300) and number(scale.get("max"), -1e300, 1e300)
                        and scale["max"] > scale["min"] and scale.get("unit") in UNITS[w["signal"]], "Invalid custom scale")
            require(warning.get("mode") in ("auto", "custom", "off"), "Invalid warning")
            if warning["mode"] == "custom":
                require(number(warning.get("threshold"), -1e300, 1e300) and warning.get("direction") in ("above", "below"), "Invalid warning trigger")
            for key in ("lineStart", "lineEnd"):
                require(w.get(key) in ("none", "round", "arrow"), "Invalid line marker")
            for key in ("startX", "startY", "endX", "endY"):
                require(number(w.get(key), 0, 1), "Invalid line endpoint")
            # Newer instrument options; older documents may not have them.
            if "valuePosition" in w:
                require(w["valuePosition"] in ("center", "below"), "Invalid value position")
            if "tickLabels" in w:
                require(w["tickLabels"] in ("inside", "outside"), "Invalid scale label position")
            if "tickStep" in w:
                require(number(w["tickStep"], 0, 1e300), "Invalid scale step")
            for key in ("colorRamp", "readout"):
                if key in w:
                    require(type(w[key]) is bool, "Invalid " + key)
            if "shiftLead" in w:
                require(number(w["shiftLead"], 0, 5000, True), "Invalid shift-light lead")
            if "zones" in w:
                zones = w["zones"]
                hex_or_none = lambda c: c is None or (isinstance(c, str) and re.fullmatch(r"#[\da-fA-F]{6}", c))
                steps = zones.get("steps") if isinstance(zones, dict) else None
                require(isinstance(zones, dict) and zones.get("mode") in ("auto", "custom", "off")
                        and hex_or_none(zones.get("base")) and isinstance(steps, list) and len(steps) <= 4
                        and all(isinstance(s, dict) and number(s.get("at"), -1e300, 1e300) and hex_or_none(s.get("color"))
                                for s in steps)
                        and all(steps[i]["at"] > steps[i - 1]["at"] for i in range(1, len(steps))),
                        "Invalid colour zones")
            style(w.get("style"))
        local, grouped = {w["id"] for w in widgets}, set()
        require(isinstance(page.get("groups"), list) and isinstance(page.get("overlaps"), list), "Invalid page groups")
        for group in page["groups"]:
            unique(group)
            members = group.get("widgetIds")
            require(text(group.get("name")) and type(group.get("locked")) is bool and isinstance(members, list)
                    and 0 < len(members) <= 24 and set(members) <= local and not (set(members) & grouped)
                    and len(set(members)) == len(members), "Invalid group")
            grouped.update(members)
        for pair in page["overlaps"]:
            require(pair.get("a") in local and pair.get("b") in local and pair["a"] != pair["b"]
                    and text(pair.get("reason"), 160), "Invalid overlap exemption")
    require(references == set(assets), "Send exactly the images referenced by this theme")
    require(doc.get("library") == [] and doc.get("initialTheme") == theme["id"]
            and number(doc.get("initialPage"), 0, len(pages) - 1, True), "Invalid theme snapshot")
    v = validate_vehicle(doc.get("vehicle", {}))
    for page in pages:
        for widget in page["widgets"]:
            if widget["scale"]["mode"] == "custom":
                signal = widget["signal"]
                category = {"trip": "distance", "coolant": "temperature", "iat": "temperature", "outside": "temperature"}.get(signal, signal)
                expected = v["units"].get(category, UNITS[signal][0])
                if category == "temperature":
                    expected = "°" + expected
                require(widget["scale"]["unit"] == expected, "Custom scale does not match the preview's units")
    return doc


class Library:
    table = "themes"
    def __init__(self, path=None):
        self.path = Path(path) if path else resolve_library_path()

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=2)
        try:
            db.row_factory = sqlite3.Row
            db.execute(f"CREATE TABLE IF NOT EXISTS {self.table} (id TEXT PRIMARY KEY, name TEXT NOT NULL, "
                       "document BLOB NOT NULL, sha256 TEXT NOT NULL, updated TEXT NOT NULL, "
                       "pages INTEGER NOT NULL, widgets INTEGER NOT NULL, selected INTEGER NOT NULL)")
            with db:
                yield db
        finally:
            db.close()

    def list(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute(
                f"SELECT id,name,sha256,updated,pages,widgets,selected FROM {self.table} ORDER BY rowid")]

    def save(self, setup):
        validate_setup(setup)
        data, theme = encode(setup), setup["themes"][0]
        digest = hashlib.sha256(data).hexdigest()
        with self.connect() as db:
            if not db.in_transaction:
                db.execute("BEGIN IMMEDIATE")
            old = db.execute(f"SELECT sha256,selected FROM {self.table} WHERE id=?", (theme["id"],)).fetchone()
            if old and old["sha256"] == digest:
                return {"id": theme["id"], "name": theme["name"], "changed": False}
            count = db.execute(f"SELECT COUNT(*) FROM {self.table}").fetchone()[0]
            require(old or count < 128, "Library is full (128 themes). Export a backup before removing entries.")
            selected = old["selected"] if old else int(db.execute(f"SELECT COUNT(*) FROM {self.table} WHERE selected=1").fetchone()[0] < 8)
            db.execute(f"INSERT INTO {self.table} VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                       "name=excluded.name,document=excluded.document,sha256=excluded.sha256,updated=excluded.updated,"
                       "pages=excluded.pages,widgets=excluded.widgets",
                       (theme["id"], theme["name"], data, digest, datetime.now(timezone.utc).isoformat(), len(theme["pages"]),
                        sum(len(p["widgets"]) for p in theme["pages"]), selected))
        return {"id": theme["id"], "name": theme["name"], "changed": True}

    def get(self, key):
        with self.connect() as db:
            row = db.execute(f"SELECT document,sha256 FROM {self.table} WHERE id=?", (key,)).fetchone()
        if row is None:
            raise KeyError("This custom meter is no longer in the builder library")
        require(hashlib.sha256(row["document"]).hexdigest() == row["sha256"], "Library theme failed its integrity check")
        return validate_setup(json.loads(row["document"]))

    def select(self, keys):
        require(isinstance(keys, list) and len(keys) <= 8 and all(isinstance(k, str) for k in keys)
                and len(set(keys)) == len(keys), "Select at most eight custom meter themes")
        with self.connect() as db:
            if not db.in_transaction:
                db.execute("BEGIN IMMEDIATE")
            known = {r[0] for r in db.execute(f"SELECT id FROM {self.table}")}
            require(set(keys) <= known, "Refresh the library: a selected theme is missing")
            db.execute(f"UPDATE {self.table} SET selected=0")
            db.executemany(f"UPDATE {self.table} SET selected=1 WHERE id=?", [(k,) for k in keys])

    def selection(self):
        with self.connect() as db:
            rows = list(db.execute(f"SELECT id,document,sha256 FROM {self.table} WHERE selected=1 ORDER BY rowid"))
        require(len(rows) <= 8, "Select at most eight custom meter themes")
        bundle = {"version": 1, "kind": "MetersThemeSelection", "producer": "MiatOff builder",
                  "purpose": "design-archive", "items": [
                      {"id": row["id"], "sha256": row["sha256"], "setup": json.loads(row["document"])} for row in rows]}
        return validate_selection(bundle)


def split_pages(project):
    """Flatten all old style containers into independent, portable page snapshots."""
    require(isinstance(project, dict) and project.get("version") == 3 and project.get("kind") == "MetersSetup",
            "Send a version 3 Custom collection")
    require(len(encode(project)) <= MAX_DOCUMENT and len(encode({**project, "assets": {}})) <= 262144,
            "Custom collection exceeds the document limit")
    themes, assets = project.get("themes"), project.get("assets", {})
    require(isinstance(themes, list) and 1 <= len(themes) <= 8 and isinstance(assets, dict) and len(assets) <= 3,
            "Invalid Custom collection")
    require(project.get("library") == [], "Send pages without component-library definitions")
    ids, result = set(), []
    for owner in themes:
        require(isinstance(owner.get("pages"), list) and 1 <= len(owner["pages"]) <= 8, "Invalid page count")
        for item in [owner] + [o for page in owner["pages"] for o in [page] + page.get("widgets", []) + page.get("groups", [])]:
            require(isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"] not in ids, "Duplicate or missing page/instrument ID")
            ids.add(item["id"])
        for page in owner["pages"]:
            theme = deepcopy(owner)
            theme["id"] = "screen-" + hashlib.sha256(page["id"].encode()).hexdigest()[:32]
            theme["name"] = page["name"]
            theme["author"] = page.get("author", owner.get("author", ""))
            theme["style"] = {**owner["style"], **page.get("style", {})}
            theme["dayStyle"] = {**owner["dayStyle"], **page.get("dayStyle", {})}
            theme["pages"] = [deepcopy(page)]
            references = {b["asset"] for b in [theme.get("background"), theme.get("dayBackground"),
                                               page.get("background"), page.get("dayBackground")]
                          if b and b.get("asset")}
            setup = {**deepcopy(project), "themes": [theme], "initialTheme": theme["id"], "initialPage": 0,
                     "assets": {key: deepcopy(assets[key]) for key in references}}
            result.append(validate_setup(setup))
    return result


class RemovalNotConfirmed(Exception):
    """A sync would retire pages the caller has not confirmed. Nothing was written."""

    def __init__(self, removed):
        self.removed = removed
        names = ", ".join(item["name"] for item in removed)
        super().__init__(f"This send would remove {len(removed)} page(s) from the builder list ({names}). "
                         "Review the list and send again.")


def _now():
    return datetime.now(timezone.utc).isoformat()


class PageLibrary(Library):
    """One active Custom collection. Original grouped library records are retained."""
    table = "custom_pages"

    @contextmanager
    def connect(self):
        with super().connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS library_meta (key TEXT PRIMARY KEY, value TEXT)")
            db.execute("CREATE TABLE IF NOT EXISTS retired_pages (id TEXT, sha256 TEXT, document BLOB, selected INTEGER, "
                       "retired TEXT, PRIMARY KEY(id,sha256))")
            db.execute("CREATE TABLE IF NOT EXISTS migration_skipped (id TEXT PRIMARY KEY, reason TEXT NOT NULL, skipped TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS home_menus (id TEXT PRIMARY KEY, name TEXT NOT NULL, document BLOB NOT NULL, "
                       "sha256 TEXT NOT NULL, updated TEXT NOT NULL, items INTEGER NOT NULL)")
            if not db.execute("SELECT 1 FROM library_meta WHERE key='flat-pages-v1'").fetchone():
                if not db.in_transaction:
                    db.execute("BEGIN IMMEDIATE")
                if not db.execute("SELECT 1 FROM library_meta WHERE key='flat-pages-v1'").fetchone():
                    self._migrate_themes(db)
                    db.execute("INSERT INTO library_meta VALUES ('flat-pages-v1','1')")
            yield db

    def _migrate_themes(self, db):
        """Split every old theme record into pages, one record at a time.

        A record that fails its checks is skipped and listed in migration_skipped; its row in
        `themes` stays untouched. A page id seen twice keeps the first page; the later one is
        stored in retired_pages so it can be restored.
        """
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='themes'").fetchone():
            return
        selected = 0
        for row in db.execute("SELECT * FROM themes ORDER BY rowid").fetchall():
            try:
                require(hashlib.sha256(row["document"]).hexdigest() == row["sha256"], "Original builder theme failed its integrity check")
                setups = split_pages(json.loads(row["document"]))
            except Exception as error:
                db.execute("INSERT OR REPLACE INTO migration_skipped VALUES (?,?,?)", (str(row["id"]), str(error) or type(error).__name__, _now()))
                continue
            for setup in setups:
                key = setup["themes"][0]["id"]
                if db.execute("SELECT 1 FROM custom_pages WHERE id=?", (key,)).fetchone():
                    data = encode(setup)
                    db.execute("INSERT OR IGNORE INTO retired_pages VALUES (?,?,?,?,?)",
                               (key, hashlib.sha256(data).hexdigest(), data, 0, _now()))
                    continue
                include = int(bool(row["selected"]) and selected < 8)
                selected += include
                self._put(db, setup, include)

    def skipped_migrations(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT id,reason,skipped FROM migration_skipped ORDER BY skipped,id")]

    def _put(self, db, setup, include):
        theme = setup["themes"][0]
        data = encode(setup)
        db.execute("INSERT INTO custom_pages VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                   "name=excluded.name,document=excluded.document,sha256=excluded.sha256,updated=excluded.updated,"
                   "pages=excluded.pages,widgets=excluded.widgets",
                   (theme["id"], theme["name"], data, hashlib.sha256(data).hexdigest(), _now(),
                    1, len(theme["pages"][0]["widgets"]), include))

    @staticmethod
    def _removed(old, keys):
        return [{"id": key, "name": old[key]["name"]} for key in old if key not in keys]

    def plan_sync(self, project):
        """What sync() would do, without writing: the pages it would move to Removed pages."""
        snapshots = split_pages(project)
        keys = {setup["themes"][0]["id"] for setup in snapshots}
        with self.connect() as db:
            old = {row["id"]: row for row in db.execute("SELECT id,name FROM custom_pages ORDER BY rowid")}
        return {"pages": len(snapshots), "removed": self._removed(old, keys)}

    def sync(self, project, confirm_removal=None):
        """Mirror the editor's pages. Pages missing from `project` move to retired_pages, but only
        if their ids are listed in `confirm_removal`; otherwise RemovalNotConfirmed and no write."""
        snapshots = split_pages(project)  # Validate everything before opening a write transaction.
        keys = {setup["themes"][0]["id"] for setup in snapshots}
        confirmed = set(confirm_removal or [])
        with self.connect() as db:
            if not db.in_transaction:
                db.execute("BEGIN IMMEDIATE")
            old = {row["id"]: dict(row) for row in db.execute("SELECT * FROM custom_pages ORDER BY rowid")}
            removed = self._removed(old, keys)
            if not {item["id"] for item in removed} <= confirmed:
                raise RemovalNotConfirmed(removed)
            for item in removed:
                row = old[item["id"]]
                db.execute("INSERT OR IGNORE INTO retired_pages VALUES (?,?,?,?,?)", (item["id"], row["sha256"], row["document"], row["selected"], _now()))
                db.execute("DELETE FROM custom_pages WHERE id=?", (item["id"],))
            included = sum(row["selected"] for key, row in old.items() if key in keys)
            changed = bool(removed)
            for setup in snapshots:
                key = setup["themes"][0]["id"]
                if key in old and old[key]["sha256"] == hashlib.sha256(encode(setup)).hexdigest():
                    continue
                include = old[key]["selected"] if key in old else int(included < 8)
                if key not in old:
                    included += include
                self._put(db, setup, include)
                changed = True
        return {"group": "Custom", "pages": len(snapshots), "changed": changed, "removed": len(removed)}

    def retired_signature(self):
        """Cheap change marker for polling; does not parse any document."""
        with self.connect() as db:
            return tuple(tuple(row) for row in db.execute(
                "SELECT id,sha256 FROM retired_pages WHERE NOT EXISTS (SELECT 1 FROM custom_pages c WHERE c.id=retired_pages.id AND c.sha256=retired_pages.sha256) ORDER BY rowid"))

    def list_retired(self):
        """Removed pages that can be restored (not those already identical to a page in the list)."""
        with self.connect() as db:
            rows = db.execute("SELECT id,sha256,document,retired FROM retired_pages WHERE NOT EXISTS (SELECT 1 FROM custom_pages c WHERE c.id=retired_pages.id AND c.sha256=retired_pages.sha256)"
                              " ORDER BY retired DESC, rowid DESC").fetchall()
        result = []
        for row in rows:
            name, widgets = "Unreadable page", 0
            try:
                theme = json.loads(row["document"])["themes"][0]
                name, widgets = str(theme["name"]), len(theme["pages"][0]["widgets"])
            except Exception:
                pass
            result.append({"id": row["id"], "sha256": row["sha256"], "name": name, "widgets": widgets, "retired": row["retired"]})
        return result

    def restore_retired(self, key, digest):
        """Put a removed page back into the list, unselected. The archived copy is deleted in the
        same transaction only after the page is back, so nothing is lost."""
        with self.connect() as db:
            if not db.in_transaction:
                db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT document,sha256 FROM retired_pages WHERE id=? AND sha256=?", (key, digest)).fetchone()
            require(row is not None, "This removed page is no longer available. Refresh the list.")
            require(hashlib.sha256(row["document"]).hexdigest() == row["sha256"], "Removed page failed its integrity check")
            setup = validate_setup(json.loads(row["document"]))
            require(setup["themes"][0]["id"] == key, "Removed page does not match its ID")
            current = db.execute("SELECT sha256 FROM custom_pages WHERE id=?", (key,)).fetchone()
            require(current is None or current["sha256"] != digest, "This page is already in the list")
            if current is not None:  # another page owns this ID (older version or duplicate): restore as a copy
                theme = setup["themes"][0]
                page = theme["pages"][0]
                page["id"] = f"{page['id']}-restored-{digest[:8]}"
                theme["id"] = setup["initialTheme"] = "screen-" + hashlib.sha256(page["id"].encode()).hexdigest()[:32]
                validate_setup(setup)
                require(not db.execute("SELECT 1 FROM custom_pages WHERE id=?", (theme["id"],)).fetchone(), "A restored copy of this page is already in the list")
            require(db.execute("SELECT COUNT(*) FROM custom_pages").fetchone()[0] < 128,
                    "Library is full (128 pages). Export a backup before restoring.")
            self._put(db, setup, 0)
            db.execute("DELETE FROM retired_pages WHERE id=? AND sha256=?", (key, digest))
        return {"id": setup["themes"][0]["id"], "name": setup["themes"][0]["name"]}


# ---------------------------------------------------------------- Home menus
# Designs sent from the Home designer, by name (sending a menu with the same name replaces it), plus the
# built-in menus of home_menu.STARTERS. At most one menu is chosen for the stick ("home-selected").
HOME_MAX = 32
HOME_DEFAULT_NAME = "My Home menu"


def _home_key(name):
    return "menu-" + hashlib.sha256(name.strip().lower().encode()).hexdigest()[:12]


class HomeMenus:
    def __init__(self, library):
        self.library = library

    def save(self, doc):
        """Store a design sent from the designer. Returns its row."""
        doc = deepcopy(home_menu.validate(doc))
        doc["name"] = (doc.get("name") or HOME_DEFAULT_NAME).strip()
        key, data = _home_key(doc["name"]), encode(doc)
        shown = home_menu.summary(doc)["items"]
        with self.library.connect() as db:
            if not db.in_transaction:
                db.execute("BEGIN IMMEDIATE")
            exists = db.execute("SELECT 1 FROM home_menus WHERE id=?", (key,)).fetchone()
            count = db.execute("SELECT COUNT(*) FROM home_menus").fetchone()[0]
            require(exists or count < HOME_MAX, f"The library holds {HOME_MAX} Home menus. Remove one first.")
            db.execute("INSERT INTO home_menus VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,"
                       "document=excluded.document,sha256=excluded.sha256,updated=excluded.updated,items=excluded.items",
                       (key, doc["name"], data, hashlib.sha256(data).hexdigest(), _now(), shown))
        return {"id": key, "name": doc["name"], "items": shown}

    def list(self):
        """Built-in menus first, then sent ones (newest first)."""
        rows = [{"id": key, "name": doc["name"], "items": home_menu.summary(doc)["items"], "builtIn": True, "updated": None}
                for key, doc in home_menu.STARTERS.items()]
        with self.library.connect() as db:
            rows += [{"id": row["id"], "name": row["name"], "items": row["items"], "builtIn": False, "updated": row["updated"]}
                     for row in db.execute("SELECT id,name,items,updated FROM home_menus ORDER BY updated DESC, name")]
        return rows

    def get(self, key):
        """The design with this id; KeyError when there is none. A stored row is checked again."""
        if key in home_menu.STARTERS:
            return deepcopy(home_menu.STARTERS[key])
        with self.library.connect() as db:
            row = db.execute("SELECT document,sha256 FROM home_menus WHERE id=?", (key,)).fetchone()
        if not row:
            raise KeyError(key)
        require(hashlib.sha256(row["document"]).hexdigest() == row["sha256"], "A stored Home menu failed its integrity check")
        return home_menu.validate(json.loads(row["document"]))

    def remove(self, key):
        require(key not in home_menu.STARTERS, "Built-in menus cannot be removed")
        with self.library.connect() as db:
            db.execute("DELETE FROM home_menus WHERE id=?", (key,))
            row = db.execute("SELECT value FROM library_meta WHERE key='home-selected'").fetchone()
            if row and row["value"] == key:
                db.execute("DELETE FROM library_meta WHERE key='home-selected'")

    def selected(self):
        """The id of the menu chosen for the stick, or None (also when that menu is gone)."""
        with self.library.connect() as db:
            row = db.execute("SELECT value FROM library_meta WHERE key='home-selected'").fetchone()
            if not row:
                return None
            key = row["value"]
            if key in home_menu.STARTERS or db.execute("SELECT 1 FROM home_menus WHERE id=?", (key,)).fetchone():
                return key
        return None

    def select(self, key):
        """Choose a menu for the stick (None: no Home menu)."""
        with self.library.connect() as db:
            if key is None:
                db.execute("DELETE FROM library_meta WHERE key='home-selected'")
                return
            require(key in home_menu.STARTERS or db.execute("SELECT 1 FROM home_menus WHERE id=?", (key,)).fetchone(),
                    "That Home menu is not in the library")
            db.execute("INSERT OR REPLACE INTO library_meta VALUES ('home-selected', ?)", (key,))

    def chosen(self):
        """The design chosen for the stick, or None."""
        key = self.selected()
        return self.get(key) if key else None

    # The menu the last stick with Meters carried ("" for none): Custom menu "Leave as-is" carries it again.
    def built(self):
        """The design the last Meters stick carried, or None (none, never built, or since removed)."""
        with self.library.connect() as db:
            row = db.execute("SELECT value FROM library_meta WHERE key='home-built'").fetchone()
        try:
            return self.get(row["value"]) if row and row["value"] else None
        except KeyError:
            return None

    def mark_built(self, key):
        with self.library.connect() as db:
            db.execute("INSERT OR REPLACE INTO library_meta VALUES ('home-built', ?)", (key or "",))


# ---------------------------------------------------------------- Car profile
# The car set up in the designer (Project > Car setup), reduced by car_profile(). One profile; the builder puts it
# in the Meters payload (js/car-profile.js). "car-built" is what the last Meters stick carried.
def _car_json(profile):
    return json.dumps(profile, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


class CarProfile:
    def __init__(self, library):
        self.library = library

    def _read(self, key):
        with self.library.connect() as db:
            row = db.execute("SELECT value FROM library_meta WHERE key=?", (key,)).fetchone()
        if not row or not row["value"]:
            return None
        try:
            value = json.loads(row["value"])
        except ValueError:
            return None
        return value if isinstance(value, dict) else None

    def set(self, vehicle, label=None):
        """Validate, reduce and store the profile. Returns it."""
        profile = car_profile(vehicle, label)
        with self.library.connect() as db:
            db.execute("INSERT OR REPLACE INTO library_meta VALUES ('car-profile', ?)", (_car_json(profile),))
        return profile

    def get(self):
        """The stored profile, or None (none set, or the stored text is unusable)."""
        return self._read("car-profile")

    def clear(self):
        with self.library.connect() as db:
            db.execute("DELETE FROM library_meta WHERE key='car-profile'")

    def built(self):
        """The profile the last Meters stick carried, or None (none, or never built)."""
        return self._read("car-built")

    def mark_built(self, profile):
        """Remember what a stick carries (None: the built-in default)."""
        with self.library.connect() as db:
            db.execute("INSERT OR REPLACE INTO library_meta VALUES ('car-built', ?)", (_car_json(profile) if profile else "",))

    def stale(self):
        """True when the stored profile is not what the last stick carried (the car needs a Meters update)."""
        return self.get() != self.built()


def validate_selection(bundle):
    require(isinstance(bundle, dict) and bundle.get("kind") == "MetersThemeSelection" and bundle.get("version") == 1
            and bundle.get("producer") == "MiatOff builder" and bundle.get("purpose") == "design-archive",
            "Unknown custom meters archive; leave it unchanged")
    items = bundle.get("items")
    require(isinstance(items, list) and len(items) <= 8, "Invalid custom meters selection")
    seen = set()
    for item in items:
        setup = validate_setup(item["setup"])
        require(item["id"] == setup["themes"][0]["id"] and item["id"] not in seen
                and hashlib.sha256(encode(setup)).hexdigest() == item["sha256"], "Custom meters archive integrity mismatch")
        seen.add(item["id"])
    return bundle


def write_selection(path, bundle):
    validate_selection(bundle)
    path = Path(path)
    data = encode(bundle) + b"\n"
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".meters-", suffix=".tmp", delete=False) as handle:
            temp = Path(handle.name)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        require(temp.read_bytes() == data, "Custom meters staging verification failed")
        os.replace(temp, path)
        require(path.read_bytes() == data, "Custom meters read-back verification failed")
    finally:
        if temp and temp.exists():
            temp.unlink()
