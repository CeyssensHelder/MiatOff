#!/usr/bin/env python3
"""Test helper: turn designer projects into the car's js/custom-pages.js.

    python custom_pages_tool.py PROJECTS.json OUT.js SETUPS.json

PROJECTS.json is a list of v3 MetersSetup projects. Every page of every project becomes one validated single-page
setup (the same split the builder library does), and OUT.js is what the stick builder would put on the car for them
(without the eight page cap, so tests can use more). SETUPS.json lists the validated setups in the same order.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "aa-touch-stick"))
import build_stick  # noqa: E402
import meters_library  # noqa: E402


def main(argv):
    projects = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    setups = [setup for project in projects for setup in meters_library.split_pages(project)]
    Path(argv[1]).write_bytes(build_stick.custom_pages_from_setups(setups))
    Path(argv[2]).write_text(json.dumps(setups), encoding="utf-8")
    print(len(setups))


if __name__ == "__main__":
    main(sys.argv[1:])
