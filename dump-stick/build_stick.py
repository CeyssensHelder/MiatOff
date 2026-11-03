#!/usr/bin/env python3
"""Build the MiatOff read-only dump stick.

Usage:
    python build_stick.py E:\\            write the payload to the root of a FAT32 stick
    python build_stick.py --check E:\\    verify an existing stick
    python build_stick.py --print-launcher

SPDX-License-Identifier: GPL-3.0-or-later
"""
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
import stickkit  # noqa: E402
from stickkit import long_path, posix_cksum  # noqa: E402,F401  (re-exported for tests)

STICK = HERE / "stick"
KIT = stickkit.Kit(
    id_name="MIATOFF.ID",
    id_bytes=stickkit.lf_bytes(STICK / "MIATOFF.ID"),
    script="dump.sh",
    script_bytes=stickkit.lf_bytes(STICK / "dump.sh"),
)


def launcher_name() -> str:
    return KIT.launcher_name()


def payload() -> dict:
    return KIT.payload()


def check(target: Path) -> bool:
    return KIT.check(Path(target))


def build(target: Path) -> None:
    KIT.build(Path(target))


def main(argv: list) -> None:
    if argv == ["--print-launcher"]:
        print(launcher_name())
    elif len(argv) == 2 and argv[0] == "--check":
        sys.exit(0 if check(Path(argv[1])) else 1)
    elif len(argv) == 1 and not argv[0].startswith("-"):
        stickkit.require_stick_root(Path(argv[0]))
        build(Path(argv[0]))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
