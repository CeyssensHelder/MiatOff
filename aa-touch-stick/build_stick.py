#!/usr/bin/env python3
"""Build the MiatOff AA-touch stick (touch in Android Auto via oem-aa-mod).

Usage:
    python build_stick.py E:\\            write the payload to the root of a FAT32 stick
    python build_stick.py --check E:\\    verify an existing stick
    python build_stick.py --print-launcher
    python build_stick.py --custom-pages FILE E:\\   also put the designer pages of FILE (a selection exported
                                                from the builder's Meters Designer tab) in the Meters payload;
                                                use the same flag with --check

The kit itself (what goes on the stick and how each file is checked) is defined
in tools/kits.py.

SPDX-License-Identifier: GPL-3.0-or-later
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import kits  # noqa: E402
from kits import (CUSTOM_PAGES_LIMIT, INSTALL_STICK as STICK, custom_pages_from_setups, custom_pages_js,  # noqa: E402,F401
                  pinned)  # (re-exported for tests)
import stickkit  # noqa: E402,F401
from stickkit import StickError, long_path, posix_cksum, sha256  # noqa: E402,F401  (re-exported for tests)


def __getattr__(name):
    if name == "KIT":  # on demand: a problem with a payload must not stop the import
        return kits.install_kit()
    raise AttributeError(name)


def launcher_name() -> str:
    return kits.install_kit().launcher_name()


def kit_for(custom=None, home=None) -> stickkit.Kit:
    return kits.install_kit(custom, home)


def payload(custom=None, home=None) -> dict:
    return kit_for(custom, home).payload()


def check(target: Path, custom=None) -> bool:
    return kit_for(custom).check(Path(target))


def build(target: Path, custom=None, home=None) -> None:
    kit_for(custom, home).build(Path(target))


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
    kits.run_builder(lambda: kits.install_kit(custom), __doc__, argv)


if __name__ == "__main__":
    main(sys.argv[1:])
