"""Home menu designs: validation, the car files, the stick payload, the library and the designer server.

    python tools/tests/test_home_menu.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
import base64
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import home_menu as hm  # noqa: E402
import kits  # noqa: E402
import meters_library as ml  # noqa: E402
import meters_designer  # noqa: E402


def png(width=8, height=8, rgb=(255, 0, 0)) -> bytes:
    """A small valid PNG, made here (no image library needed)."""
    row = b"\x00" + bytes(rgb) * width
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * height)) + chunk(b"IEND", b""))


def data_url(data: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(data).decode()


def pictured(name="With pictures"):
    """The Track menu with its pictures replaced: a background and an icon pair on its first item only."""
    doc = deepcopy(hm.STARTERS["starter-track"])
    doc["name"] = name
    for item in doc["items"]:
        item["normal"] = item["selected"] = None
    doc["assets"] = {"bg": {"data": data_url(png(16, 10, (0, 64, 0)))},
                     "n": {"data": data_url(png(8, 8, (255, 0, 0)))},
                     "s": {"data": data_url(png(8, 8, (0, 0, 255)))}}
    doc["background"]["image"] = "bg"
    doc["items"][0]["normal"], doc["items"][0]["selected"] = "n", "s"
    return doc


class DesignTests(unittest.TestCase):
    def test_built_in_menus_are_valid_and_inside_the_menu_area(self):
        for key, doc in hm.STARTERS.items():
            hm.validate(doc)
            for item in doc["items"]:
                self.assertTrue(item["y"] >= 64 and item["y"] + item["h"] <= 438, f"{key}: {item['label']} in the menu area")
        self.assertIn("meters", [w["opens"] for w in hm.STARTERS["starter-track"]["items"]])
        self.assertEqual([d["name"] for d in hm.STARTERS.values()], ["2077", "2077 Night", "Cyber", "Track", "Classic"])
        for doc in hm.STARTERS.values():
            for item in doc["items"]:
                self.assertTrue(item["normal"] and item["selected"], "every built-in item has both pictures")

    def test_invalid_designs_are_refused(self):
        def broken(change):
            doc = deepcopy(hm.STARTERS["starter-classic"])
            change(doc)
            return doc
        cases = {
            "label": lambda d: d["items"][0].update(label="x" * 21),
            "non-ASCII label": lambda d: d["items"][0].update(label="Café"),
            "destination": lambda d: d["items"][0].update(opens="javascript:alert(1)"),
            "outside": lambda d: d["items"][0].update(x=790),
            "order": lambda d: d["order"].__setitem__(0, d["order"][1]),
            "missing icon": lambda d: d["items"][0].update(normal="nope"),
            "not PNG": lambda d: (d["assets"].update(a={"data": "data:image/jpeg;base64,AAAA"}), d["items"][0].update(normal="a")),
            "fake PNG": lambda d: (d["assets"].update(a={"data": data_url(b"not a png at all" * 4)}), d["items"][0].update(normal="a")),
            "huge PNG": lambda d: (d["assets"].update(a={"data": data_url(png(801, 2))}), d["items"][0].update(normal="a")),
            "all hidden": lambda d: [w.update(hidden=True) for w in d["items"]],
            "name": lambda d: d.update(name="é"),
            "kind": lambda d: d.update(kind="MetersSetup"),
        }
        for what, change in cases.items():
            with self.assertRaises(ValueError, msg=what):
                hm.validate(broken(change))

    def test_car_files_are_deterministic_and_carry_the_pictures_by_content(self):
        doc = pictured()
        files = hm.car_files(doc)
        self.assertEqual(files, hm.car_files(deepcopy(doc)))
        names = sorted(files)
        self.assertEqual(names[-2:], [hm.DESIGN_REL, hm.RUNTIME_REL])
        pictures = [n for n in names if n.startswith(hm.IMAGE_DIR)]
        self.assertEqual(len(pictures), 3)
        for name in pictures:
            self.assertEqual(name, hm.IMAGE_DIR + hashlib.sha256(files[name]).hexdigest()[:16] + ".png")
        text = files[hm.DESIGN_REL].decode("ascii")
        self.assertTrue(text.startswith("/* MiatOff Home menu") and "window.MiatOffHomeDesign = {" in text)
        design = json.loads(text.split("window.MiatOffHomeDesign = ", 1)[1].rstrip(";\n"))
        self.assertEqual(design["items"][0]["normal"], hm.CAR_IMAGE_URL + pictures[[files[p] for p in pictures].index(
            base64.b64decode(doc["assets"]["n"]["data"].split(",")[1]))][len(hm.IMAGE_DIR):])
        self.assertEqual(design["order"], doc["order"])
        self.assertEqual({w["opens"]: w["route"] for w in design["items"]}["meters"], {"list": "Applications", "appName": "miatoff"})
        self.assertNotIn(b"\r", files[hm.RUNTIME_REL])

    def test_hidden_items_stay_off_the_car(self):
        doc = deepcopy(hm.STARTERS["starter-cyber"])
        doc["items"][1]["hidden"] = True
        design = hm.preview_design(doc)
        self.assertNotIn(doc["items"][1]["id"], [w["id"] for w in design["items"]] + design["order"])
        self.assertEqual(len(design["items"]), len(doc["items"]) - 1)


class PayloadTests(unittest.TestCase):
    def test_the_default_stick_is_unchanged_and_a_menu_adds_to_the_manifest(self):
        plain = kits.install_kit().payload()
        self.assertIs(kits.install_kit(None, None), kits.install_kit())
        self.assertFalse([n for n in plain if "miatoff-home" in n or "/app/home/" in n])
        with_menu = kits.install_kit(None, pictured()).payload()
        manifest = with_menu["miatoff-app/MANIFEST"].decode().splitlines()
        added = [line.split("  ", 1)[1] for line in manifest if "home" in line.split("  ", 1)[1].split("/", 1)[1]]
        self.assertEqual(sorted(added), sorted(hm.car_files(pictured())))
        for line in manifest:
            digest, rel = line.split("  ", 1)
            self.assertEqual(hashlib.sha256(with_menu["miatoff-app/" + rel]).hexdigest(), digest)
        # Everything else in the payload is the same as the default stick.
        for name, data in plain.items():
            if name not in ("miatoff-app/MANIFEST", "PAYLOAD.SHA256"):
                self.assertEqual(with_menu[name], data, name)

    def test_an_invalid_menu_stops_the_build(self):
        doc = deepcopy(hm.STARTERS["starter-classic"])
        doc["items"][0]["opens"] = "nowhere"
        with self.assertRaises(kits.StickError):
            kits.install_kit(None, doc)

    def test_the_runtime_is_in_the_packaged_app(self):
        self.assertIn("meters/js/miatoff-home.js", kits.bundle_sources())


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.library = ml.PageLibrary(Path(self.folder.name) / "library.sqlite3")
        self.menus = ml.HomeMenus(self.library)

    def test_send_list_choose_and_remove(self):
        self.assertEqual([r["builtIn"] for r in self.menus.list()], [True] * len(hm.STARTERS))
        self.assertIsNone(self.menus.selected())
        saved = self.menus.save(pictured("Mine"))
        again = self.menus.save(pictured("  mine "))
        self.assertEqual(saved["id"], again["id"], "the same name replaces the menu")
        self.assertEqual(len(self.menus.list()), len(hm.STARTERS) + 1)
        unnamed = deepcopy(hm.STARTERS["starter-classic"])
        del unnamed["name"]
        self.assertEqual(self.menus.save(unnamed)["name"], ml.HOME_DEFAULT_NAME)
        self.menus.select(saved["id"])
        self.assertEqual(self.menus.chosen()["name"], "mine")
        self.menus.select("starter-cyber")
        self.assertEqual(self.menus.chosen(), hm.STARTERS["starter-cyber"])
        with self.assertRaises(ValueError):
            self.menus.select("menu-unknown")
        with self.assertRaises(ValueError):
            self.menus.remove("starter-cyber")
        self.menus.select(saved["id"])
        self.menus.remove(saved["id"])
        self.assertIsNone(self.menus.selected(), "removing the chosen menu clears the choice")
        self.menus.select(None)
        self.assertIsNone(self.menus.chosen())

    def test_a_damaged_stored_menu_is_refused(self):
        saved = self.menus.save(pictured())
        with self.library.connect() as db:
            db.execute("UPDATE home_menus SET document=? WHERE id=?", (b"{}", saved["id"]))
        with self.assertRaises(ValueError):
            self.menus.get(saved["id"])


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.server = meters_designer.launch(port=0, open_browser=False,
                                             library_path=Path(self.folder.name) / "library.sqlite3")
        self.addCleanup(self.folder.cleanup)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def get(self, path):
        with urlopen(self.base + path) as response:
            return json.load(response)

    def post(self, doc, token=None):
        data = json.dumps(doc).encode()
        headers = {"Content-Type": "application/json", "Origin": self.base,
                   "X-MiatOff-Token": token if token is not None else self.get("/api/builder/session")["token"]}
        with urlopen(Request(self.base + "/api/builder/home", data=data, headers=headers)) as response:
            return json.load(response)

    def test_send_and_read_back(self):
        with self.assertRaises(HTTPError) as refused:
            self.post(pictured(), token="wrong")
        self.assertEqual(refused.exception.code, 403)
        bad = deepcopy(hm.STARTERS["starter-classic"])
        bad["items"][0]["label"] = ""
        with self.assertRaises(HTTPError) as invalid:
            self.post(bad)
        self.assertEqual(invalid.exception.code, 422)
        saved = self.post(pictured("Sent"))
        listing = self.get("/api/builder/home")
        self.assertIn(saved["id"], [m["id"] for m in listing["menus"]])
        self.assertIsNone(listing["selected"])
        self.assertEqual(self.get(f"/api/builder/home/{saved['id']}")["name"], "Sent")
        car = self.get(f"/api/builder/home/{saved['id']}/car")
        self.assertTrue(car["background"]["image"].startswith("data:image/png;base64,"))
        self.assertEqual(self.get("/api/builder/home/starter-track/car")["order"], hm.STARTERS["starter-track"]["order"])
        with self.assertRaises(HTTPError) as missing:
            self.get("/api/builder/home/menu-none")
        self.assertEqual(missing.exception.code, 404)
        with urlopen(self.base + "/js/miatoff-home.js") as response:
            self.assertEqual(response.read(), hm.RUNTIME_SRC.read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=1)
