#!/usr/bin/env python3
"""Build the MiatOff read-only dump stick.

Usage:
    python build_stick.py E:\\            write the payload to the root of a FAT32 stick
    python build_stick.py --check E:\\    verify an existing stick
    python build_stick.py --print-launcher

The kit itself is defined in tools/kits.py.

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import kits  # noqa: E402
from stickkit import long_path, posix_cksum  # noqa: E402,F401  (re-exported for tests)


def launcher_name() -> str:
    return kits.dump_kit().launcher_name()


def payload() -> dict:
    return kits.dump_kit().payload()


def check(target: Path) -> bool:
    return kits.dump_kit().check(Path(target))


def build(target: Path) -> None:
    kits.dump_kit().build(Path(target))


if __name__ == "__main__":
    kits.run_builder(kits.dump_kit, __doc__, sys.argv[1:])
