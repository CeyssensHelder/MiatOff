#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The car setup's card drawings: generated, complete, and to one scale."""
import re
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import make_car_outlines as outlines  # noqa: E402

SVG = ROOT / "meters" / "designer" / "setup-outlines.svg"
INDEX = ROOT / "meters" / "designer" / "index.html"


class CarOutlines(unittest.TestCase):
    def test_file_is_what_the_script_makes(self):
        run = subprocess.run([sys.executable, str(ROOT / "tools" / "make_car_outlines.py"), "--check"],
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)

    def test_file_is_strict_xml(self):
        # The cards load it through <use href>, which needs well-formed XML (no duplicate attributes):
        # a broken file draws nothing in the dialog, while the same markup inline in HTML still renders.
        ET.parse(SVG)

    def test_every_card_has_a_symbol(self):
        svg = SVG.read_text(encoding="utf-8")
        used = set(re.findall(r'setup-outlines\.svg#([a-z0-9]+)', INDEX.read_text(encoding="utf-8")))
        defined = set(re.findall(r'<symbol id="([a-z0-9]+)"', svg))
        self.assertTrue(used, "no cards found in index.html")
        self.assertEqual(used - defined, set())
        self.assertEqual(set(outlines.CARS) | {"eu", "uk", "us", "jp", "au"}, defined)

    def test_cars_fit_the_box_at_one_scale(self):
        for key, car in outlines.CARS.items():
            with self.subTest(key):
                self.assertLessEqual(car["length"] * outlines.SCALE, outlines.VIEW_W - 8)
                self.assertLessEqual(car["height"] * outlines.SCALE, outlines.GROUND - 2)
                self.assertGreater(car["length"], car["wheelbase"] + car["front"])
                diameter, _ = outlines.tyre_mm(car["tyre"])
                self.assertLess(diameter, car["height"] / 2)
                # The points the outline passes through stay inside the car's size.
                xs = [p[0] for p in car["outline"]]
                self.assertTrue(all(0 <= x <= car["length"] for x in xs), "body points beyond the bumpers")
                ys = [p[1] for p in car["outline"]]
                self.assertLessEqual(max(ys), car["height"], "body taller than the published height")


if __name__ == "__main__":
    unittest.main()
