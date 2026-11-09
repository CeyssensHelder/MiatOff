"""Custom designer pages in the Meters payload of the AA-touch stick builder (synthetic, no car, no real library)."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "aa-touch-stick"))
import build_stick as bs  # noqa: E402
import meters_library as ml  # noqa: E402

PAGES = "miatoff-app/app/meters/js/custom-pages.js"
PIXEL = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def starters():
    module = (ROOT / "meters/designer/v3/model.mjs").as_uri()
    source = f'import * as M from {json.dumps(module)}; ' + """
      const out = M.names.map(name => { const s = M.defaults(); s.themes = [M.starter(name)]; s.initialTheme = s.themes[0].id; return s; });
      console.log(JSON.stringify(out));
    """
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=ROOT))


def bundle_of(setups):
    items = [{"id": s["themes"][0]["id"], "sha256": hashlib.sha256(ml.encode(s)).hexdigest(), "setup": s} for s in setups]
    return {"version": 1, "kind": "MetersThemeSelection", "producer": "MiatOff builder", "purpose": "design-archive", "items": items}


class CustomPagesBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.projects = starters()
        cls.pages = [p for project in cls.projects for p in ml.split_pages(project)]  # 12 single-page setups

    def bundle(self, count=3):
        return bundle_of(self.pages[:count])

    def test_default_payload_is_unchanged_without_custom_pages(self):
        default = (ROOT / "meters/js/custom-pages.js").read_bytes().replace(b"\r\n", b"\n")
        self.assertEqual(bs.KIT.payload()[PAGES], default)
        self.assertEqual(bs.payload(), bs.KIT.payload())
        self.assertEqual(bs.payload(None), bs.KIT.payload())
        self.assertEqual(bs.payload({"items": []}), bs.KIT.payload())
        self.assertIn(b"window.MeterCustomPages = [];", default)

    def test_generation_is_deterministic_ascii_and_selection_specific(self):
        first = bs.custom_pages_js(self.bundle())
        self.assertEqual(first, bs.custom_pages_js(deepcopy(self.bundle())))
        first.decode("ascii")
        self.assertNotEqual(first, bs.custom_pages_js(self.bundle(2)))
        text = first.decode("ascii")
        self.assertTrue(text.startswith("/* MiatOff Meters"))
        pages = json.loads(text.split("window.MeterCustomPages = ")[1].split(";\nwindow.MeterCustomImages")[0])
        self.assertEqual([p["name"] for p in pages], ["DRIVE", "TELEMETRY", "DRIVE"])
        self.assertEqual(sorted(pages[0]), ["name", "style", "vehicle", "widgets"] if "background" not in pages[0] else
                         ["background", "name", "style", "vehicle", "widgets"])
        for page in pages:
            self.assertNotIn("id", page["widgets"][0])
            self.assertEqual(sorted(page["vehicle"]), ["rpm", "units"])
            self.assertIn("font", page["style"])

    def test_non_ascii_names_are_escaped(self):
        setups = deepcopy(self.pages[:1])
        setups[0]["themes"][0]["pages"][0]["name"] = "Zürich — Δ"
        setups[0]["themes"][0]["name"] = "Zürich"
        data = bs.custom_pages_js(bundle_of(setups))
        data.decode("ascii")
        self.assertIn(b"Z\\u00fcrich \\u2014 \\u0394", data)

    def test_images_are_deduplicated_by_hash(self):
        setups = []
        for n in range(2):
            s = deepcopy(self.pages[0])
            theme = s["themes"][0]
            theme["id"] = s["initialTheme"] = f"screen-image-{n}"
            theme["pages"][0]["id"] = f"page-image-{n}"
            for i, w in enumerate(theme["pages"][0]["widgets"]):
                w["id"] = f"widget-image-{n}-{i}"
            theme["pages"][0]["background"] = {**theme["background"], "kind": "image", "asset": "pixel"}
            s["assets"] = {"pixel": {"data": PIXEL, "width": 1, "height": 1}}
            setups.append(s)
        text = bs.custom_pages_js(bundle_of(setups)).decode("ascii")
        images = json.loads(text.split("window.MeterCustomImages = ")[1].rstrip().rstrip(";"))
        digest = hashlib.sha256(PIXEL.encode()).hexdigest()
        self.assertEqual(images, {digest: PIXEL})
        pages = json.loads(text.split("window.MeterCustomPages = ")[1].split(";\nwindow.MeterCustomImages")[0])
        self.assertEqual([p["images"] for p in pages], [{"pixel": digest}] * 2)

    def test_size_cap_and_invalid_input_stop_the_build_with_a_clear_message(self):
        with patch.object(bs, "CUSTOM_PAGES_LIMIT", 1000):
            with self.assertRaises(SystemExit) as stop:
                bs.custom_pages_js(self.bundle())
            self.assertIn("limit is", str(stop.exception))
            self.assertIn("fewer pages", str(stop.exception))
        self.assertEqual(bs.CUSTOM_PAGES_LIMIT, 6 * 1024 * 1024)
        tampered = self.bundle()
        tampered["items"][0]["sha256"] = "0" * 64
        with self.assertRaises(SystemExit) as stop:
            bs.custom_pages_js(tampered)
        self.assertIn("not valid", str(stop.exception))
        with self.assertRaises(SystemExit):
            bs.custom_pages_js({"kind": "other", "items": [1]})
        with self.assertRaises(SystemExit):  # nine pages: more than the library selection or the car's group allows
            bs.custom_pages_js(bundle_of(self.pages[:9]))
        two_pages = deepcopy(self.projects[0])
        two = bundle_of([two_pages])
        with self.assertRaises(SystemExit) as stop:
            bs.custom_pages_js(two)
        self.assertIn("single page", str(stop.exception))

    def test_manifest_and_payload_follow_the_selection(self):
        plain = bs.payload()
        custom = bs.payload(self.bundle())
        self.assertNotEqual(plain[PAGES], custom[PAGES])
        self.assertNotEqual(plain["miatoff-app/MANIFEST"], custom["miatoff-app/MANIFEST"])
        digest = hashlib.sha256(custom[PAGES]).hexdigest()
        self.assertIn(f"{digest}  app/meters/js/custom-pages.js\n", custom["miatoff-app/MANIFEST"].decode())
        rest = lambda p: {k: v for k, v in p.items() if k not in (PAGES, "miatoff-app/MANIFEST", "PAYLOAD.SHA256")}
        self.assertEqual(rest(plain), rest(custom))
        for needed in ("js/custom.js", "fonts/Rajdhani-Bold.ttf", "fonts/RussoOne-Regular.ttf", "fonts/OFL-Rajdhani.txt", "fonts/OFL-RussoOne.txt"):
            self.assertIn("miatoff-app/app/meters/" + needed, custom)
        self.assertIn(b"Rajdhani-Bold.ttf", bs.STICK.joinpath("NOTICE").read_bytes())
        self.assertIn(b"RussoOne-Regular.ttf", bs.STICK.joinpath("NOTICE").read_bytes())
        self.assertNotIn(b"not copied to the car", (ROOT / "NOTICE").read_bytes())

    def test_build_and_check_round_trip_with_custom_pages(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            bs.build(target, self.bundle())
            self.assertTrue(bs.check(target, self.bundle()))
            self.assertFalse(bs.check(target))                       # a stick built without pages is a different stick
            self.assertFalse(bs.check(target, self.bundle(2)))       # so is one with another selection
            written = (target / "miatoff-app/app/meters/js/custom-pages.js").read_bytes()
            self.assertEqual(written, bs.custom_pages_js(self.bundle()))

    def test_cli_flag_builds_and_checks(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(bs.stickkit, "require_stick_root"):
            target = Path(folder) / "stick"
            target.mkdir()
            selection = Path(folder) / "selection.json"
            selection.write_bytes(ml.encode(self.bundle(2)))
            bs.main(["--custom-pages", str(selection), str(target)])
            with self.assertRaises(SystemExit) as ok:
                bs.main(["--custom-pages", str(selection), "--check", str(target)])
            self.assertEqual(ok.exception.code, 0)
            with self.assertRaises(SystemExit) as wrong:
                bs.main(["--check", str(target)])
            self.assertEqual(wrong.exception.code, 1)
            with self.assertRaises(SystemExit):
                bs.main(["--custom-pages"])
            with self.assertRaises(SystemExit) as missing:
                bs.main(["--custom-pages", str(Path(folder) / "none.json"), str(target)])
            self.assertIn("cannot read", str(missing.exception))

    def test_index_html_script_check_still_guards_the_file_list(self):
        page = (ROOT / "meters/index.html").read_text(encoding="utf-8")
        self.assertIn("js/custom-pages.js", page)
        self.assertIn("js/custom.js", page)
        self.assertLess(page.index("js/custom-pages.js"), page.index("js/custom.js"))
        self.assertLess(page.index("js/custom.js"), page.index("js/app.js"))
        for font in ("Rajdhani-Bold.ttf", "RussoOne-Regular.ttf"):
            self.assertIn(font, page)
        files = {k: v for k, v in bs.METERS_FILES.items() if k != "app/meters/js/custom.js"}
        with patch.object(bs, "METERS_FILES", files):
            with self.assertRaises(SystemExit) as stop:
                bs.meters_files()
        self.assertIn("custom.js", str(stop.exception))


if __name__ == "__main__":
    unittest.main()
