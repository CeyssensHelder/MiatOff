#!/usr/bin/env python3
"""Compare the --selftest reports of a source run and a packaged build.

A packaged app passes when every file it would write to a stick has the same
sha256 as from the source, it knows the same pinned hashes, its Meters Designer
serves the same files, and Tcl loaded.

    python packaging/compare_selftest.py source.json packaged.json

SPDX-License-Identifier: GPL-3.0-or-later
"""
import json
from pathlib import Path
import sys


def differences(source: dict, packaged: dict) -> list:
    if "error" in packaged:
        return [f"the packaged app reported: {packaged['error']}"]
    found = []
    for kit in sorted(set(source["digests"]) | set(packaged.get("digests", {}))):
        ours, theirs = source["digests"].get(kit, {}), packaged.get("digests", {}).get(kit, {})
        found += [f"{kit}: {name[:60]} differs or is missing"
                  for name in sorted(set(ours) | set(theirs)) if ours.get(name) != theirs.get(name)]
    if source.get("pins") != packaged.get("pins"):
        found.append("the pinned hashes differ")
    if source.get("designer") != packaged.get("designer"):
        found.append(f"the Designer answered differently: {packaged.get('designer')}")
    if not packaged.get("tcl"):
        found.append("Tcl did not load")
    return found


def main(argv: list) -> int:
    if len(argv) != 2:
        raise SystemExit(__doc__)
    source, packaged = (json.loads(Path(name).read_text(encoding="utf-8")) for name in argv)
    found = differences(source, packaged)
    for line in found:
        print("DIFF  " + line)
    if not found:
        count = sum(len(files) for files in packaged["digests"].values())
        print(f"Packaged app matches the source: {count} files, Designer OK, Tcl {packaged['tcl']}, version {packaged['version']}.")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
