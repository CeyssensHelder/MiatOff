"""Mazda Home menu designs: validation and the files the car gets.

A design comes from the Home designer (meters/designer/home/, a HomeMenuDocument version 1). On the car it is
drawn by meters/js/miatoff-home.js, which replaces how Mazda's Home control looks and steps, but keeps
Mazda's own routing for the five factory buttons. The design travels in the MiatOff app payload (miatoff-app/
on the stick, checked by its MANIFEST), so the Meters install action installs, updates and removes it.

Car files, below miatoff-app/:
    userjs/miatoff-home.js          the runtime (static, from this repository)
    userjs/miatoff-home-design.js   window.MiatOffHomeDesign = {...}: the design, reduced to what the car draws
    app/home/<sha256[:16]>.png      each picture the design uses, by content

SPDX-License-Identifier: GPL-3.0-or-later
"""
import base64
import binascii
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

# In the packaged app PyInstaller unpacks the files below sys._MEIPASS, in the same folders as in the repository.
ROOT = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[1]
RUNTIME_REL = "userjs/miatoff-home.js"
DESIGN_REL = "userjs/miatoff-home-design.js"
RUNTIME_SRC = ROOT / "meters" / "js" / "miatoff-home.js"   # also served to the PC preview
IMAGE_DIR = "app/home/"
CAR_IMAGE_URL = "apps/miatoff/home/"   # the same folder, as the HMI page (/jci/gui/index.html) reaches it

MAX_DOCUMENT = 8 * 1024 * 1024
MAX_ITEMS = 12
MAX_ASSETS = 25
MAX_ASSET_CHARS = 2796230               # the designer's limit for one data URL
MAX_CAR_BYTES = 8 * 1024 * 1024         # everything the design adds to the payload
SCREEN_W, SCREEN_H = 800, 480
MIN_W, MIN_H = 48, 64

# Destination -> how the car reaches it. "icon": Mazda's own Home button route. "list": open that list the
# stock way, then select the item that carries one of these MMUI events (or app name), as a tap would.
DESTINATIONS = {
    "applications": {"icon": "app"},
    "entertainment": {"icon": "ent"},
    "communication": {"icon": "com"},
    "navigation": {"icon": "nav"},
    "settings": {"icon": "set"},
    "meters": {"list": "Applications", "appName": "miatoff"},
    "bluetooth": {"list": "Entertainment", "events": ["SelectBTAudio"]},
    "fm": {"list": "Entertainment", "events": ["SelectRadioFM"]},
    "dab": {"list": "Entertainment", "events": ["SelectDAB"]},
    "android-auto": {"list": "Entertainment", "events": ["SelectAndroidAuto"]},
    "carplay": {"list": "Entertainment", "events": ["SelectCarPlay", "SelectCarPlayWifi"]},
}

ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
LABEL = re.compile(r"^[\x20-\x7e]{1,20}$")
NAME = re.compile(r"^[\x20-\x7e]{1,40}$")
PNG_URL = re.compile(r"^data:image/png;base64,([A-Za-z0-9+/]+={0,2})$")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def number(value, low, high):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and low <= value <= high


def png_bytes(url: str) -> bytes:
    """The PNG inside a data URL, checked: signature, IHDR, IEND and a size the screen can show."""
    require(isinstance(url, str) and len(url) <= MAX_ASSET_CHARS, "Artwork is too large")
    match = PNG_URL.match(url)
    require(match, "Use embedded PNG artwork")
    try:
        data = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("Artwork is not valid base64")
    require(len(data) >= 45 and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR", "Artwork is not a PNG")
    require(data[-8:-4] == b"IEND", "Artwork PNG is cut off")
    width, height = struct.unpack(">II", data[16:24])
    require(1 <= width <= SCREEN_W and 1 <= height <= SCREEN_H, "Artwork exceeds 800 by 480")
    return data


def validate(doc):
    """The same rules as the designer's model (meters/designer/home/model.mjs), plus checked PNG contents.
    Returns the document; raises ValueError with a message for the user."""
    require(isinstance(doc, dict) and doc.get("kind") == "HomeMenuDocument" and doc.get("version") == 1,
            "Choose a Home menu design")
    require(len(json.dumps(doc, separators=(",", ":")).encode()) <= MAX_DOCUMENT, "Design exceeds 8 MiB")
    require("name" not in doc or (isinstance(doc["name"], str) and NAME.match(doc["name"]) and doc["name"].strip()),
            "Use a menu name of 1 to 40 English characters")
    items, assets = doc.get("items"), doc.get("assets")
    require(isinstance(items, list) and 1 <= len(items) <= MAX_ITEMS, "Use 1 to 12 items")
    require(isinstance(assets, dict) and len(assets) <= MAX_ASSETS, "Invalid artwork table")
    background = doc.get("background")
    require(isinstance(background, dict) and isinstance(background.get("color"), str) and COLOR.match(background["color"])
            and isinstance(doc.get("accent"), str) and COLOR.match(doc["accent"])
            and background.get("fit") in ("cover", "contain"), "Invalid background")
    for asset in assets.values():
        require(isinstance(asset, dict), "Invalid artwork table")
        png_bytes(asset.get("data"))
    ref = lambda key: key is None or (isinstance(key, str) and key in assets)
    require(ref(background.get("image")), "Missing background artwork")
    ids = set()
    for item in items:
        require(isinstance(item, dict), "Invalid item")
        require(isinstance(item.get("id"), str) and ID.match(item["id"]) and item["id"] not in ids, "Invalid item identity")
        ids.add(item["id"])
        require(isinstance(item.get("label"), str) and LABEL.match(item["label"]) and item["label"].strip(),
                "Use a name of 1 to 20 English characters")
        require(item.get("opens") in DESTINATIONS and ref(item.get("normal")) and ref(item.get("selected")),
                "Invalid destination or icon")
        require(isinstance(item.get("locked"), bool) and isinstance(item.get("hidden"), bool), "Invalid item visibility")
        require(all(number(item.get(k), -1e9, 1e9) for k in ("x", "y", "w", "h")), "Invalid item dimensions")
        require(item["x"] >= 0 and item["y"] >= 0 and item["w"] >= MIN_W and item["h"] >= MIN_H
                and item["x"] + item["w"] <= SCREEN_W and item["y"] + item["h"] <= SCREEN_H,
                "Keep items inside the screen (minimum 48 by 64)")
    order = doc.get("order")
    require(isinstance(order, list) and len(order) == len(ids) and set(order) == ids and len(set(order)) == len(order),
            "Invalid Commander order")
    require(any(not item["hidden"] for item in items), "Show at least one item")
    return doc


def summary(doc) -> dict:
    """What the builder shows about a design."""
    shown = [item for item in doc["items"] if not item["hidden"]]
    return {"items": len(shown), "labels": [item["label"] for item in sorted(shown, key=lambda w: doc["order"].index(w["id"]))]}


def car_design(doc, picture) -> dict:
    """The design as the car runtime reads it. picture(asset key) gives the URL of that picture, or None."""
    shown = [item for item in doc["items"] if not item["hidden"]]
    return {
        "version": 1,
        "background": {"color": doc["background"]["color"], "fit": doc["background"]["fit"],
                       "image": picture(doc["background"]["image"])},
        "accent": doc["accent"],
        # Drawing order (later items on top), as in the designer.
        "items": [{"id": item["id"], "label": item["label"], "opens": item["opens"],
                   "route": DESTINATIONS[item["opens"]],
                   "x": round(item["x"]), "y": round(item["y"]), "w": round(item["w"]), "h": round(item["h"]),
                   "normal": picture(item["normal"]), "selected": picture(item["selected"])} for item in shown],
        # Commander order.
        "order": [key for key in doc["order"] if any(item["id"] == key for item in shown)],
    }


def preview_design(doc) -> dict:
    """The car design for the PC preview: the same, with the pictures as data URLs."""
    validate(doc)
    return car_design(doc, lambda key: None if key is None else doc["assets"][key]["data"])


def car_files(doc) -> dict:
    """{payload path: bytes} for a valid design: the runtime, the design and its pictures. Same design, same bytes."""
    validate(doc)
    files, paths = {}, {}

    def picture(key):
        if key is None:
            return None
        if key not in paths:
            data = png_bytes(doc["assets"][key]["data"])
            name = hashlib.sha256(data).hexdigest()[:16] + ".png"
            files[IMAGE_DIR + name] = data
            paths[key] = CAR_IMAGE_URL + name
        return paths[key]

    design = car_design(doc, picture)
    text = ("/* MiatOff Home menu: your design from the Home designer, generated by the stick builder. */\n"
            "window.MiatOffHomeDesign = "
            + json.dumps(design, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False) + ";\n")
    files[DESIGN_REL] = text.encode("ascii")
    files[RUNTIME_REL] = RUNTIME_SRC.read_bytes().replace(b"\r\n", b"\n")
    total = sum(len(data) for data in files.values())
    require(total <= MAX_CAR_BYTES, f"The Home menu needs {total / 1048576:.1f} MiB on the car; the limit is 8 MiB. "
                                    "Use smaller pictures.")
    return dict(sorted(files.items()))


# ---------------------------------------------------------------- built-in menus
def _menu(name, rows, background="#101722", accent="#4fd1b5"):
    """A design without pictures: rows of (label, destination), each row centred between the status bar and the
    bottom strip. Without pictures the car shows Mazda's own coins for the factory destinations."""
    items, gap = [], 24
    top, bottom = 72, 430
    w = 128 if max(len(row) for row in rows) <= 4 else 120
    h = min(150, (bottom - top - gap * (len(rows) - 1)) // len(rows))
    y = top + (bottom - top - len(rows) * h - (len(rows) - 1) * gap) // 2
    for row in rows:
        x = (SCREEN_W - len(row) * w - (len(row) - 1) * gap) // 2
        for label, opens in row:
            items.append({"id": "item-" + opens, "label": label, "opens": opens, "normal": None, "selected": None,
                          "locked": False, "hidden": False, "x": x, "y": y, "w": w, "h": h})
            x += w + gap
        y += h + gap
    return validate({"kind": "HomeMenuDocument", "version": 1, "name": name,
                     "background": {"color": background, "image": None, "fit": "cover"}, "accent": accent,
                     "items": items, "order": [item["id"] for item in items], "assets": {}})


STARTERS = {
    "starter-classic": _menu("Classic five", [[("Applications", "applications"), ("Entertainment", "entertainment"),
                                               ("Communication", "communication"), ("Navigation", "navigation"),
                                               ("Settings", "settings")]]),
    "starter-driver": _menu("Driver", [[("Navigation", "navigation"), ("Meters", "meters"), ("Android Auto", "android-auto")],
                                       [("Entertainment", "entertainment"), ("Communication", "communication"),
                                        ("Settings", "settings")]], accent="#f2a93b"),
    "starter-audio": _menu("Radio and media", [[("FM radio", "fm"), ("DAB radio", "dab"), ("Bluetooth", "bluetooth"),
                                                ("Entertainment", "entertainment")],
                                               [("Android Auto", "android-auto"), ("CarPlay", "carplay"),
                                                ("Settings", "settings")]], background="#14101c", accent="#c27cf0"),
}
