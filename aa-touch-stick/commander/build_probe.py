#!/usr/bin/env python3
"""Create an inert Commander diagnostic USB ZIP. Pass the output ZIP path."""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
from itertools import permutations
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import kits
import stickkit


def probe_kit(polarity="+", order_two="01", order_three="012", readme=None) -> stickkit.Kit:
    if (polarity not in ("+", "-") or sorted(order_two) != list("01")
            or sorted(order_three) != list("012")):
        raise ValueError("Invalid Commander control mapping")
    body = stickkit.lf_bytes(Path(__file__).with_name("probe.sh"))
    header, _, rest = body.partition(b"\n")
    settings = (f"\nCOMMANDER_SHA256={kits.pinned('COMMANDER_SHA256')}\n"
                f"POLARITY={polarity}\nORDER_TWO={order_two}\nORDER_THREE={order_three}\n")
    script = header + settings.encode("ascii") + rest
    return stickkit.Kit(
        id_name="AATOUCH.ID",
        id_bytes=stickkit.lf_bytes(kits.INSTALL_STICK / "AATOUCH.ID"),
        script="aa-touch.sh",
        script_bytes=script,
        extra={
            "miatoff-commander": kits.commander_helper(),
            "miatoff-commander.COPYRIGHT": (kits.INSTALL_STICK / "miatoff-commander.COPYRIGHT").read_bytes(),
            "LICENSE": (kits.INSTALL_DIR / "LICENSE").read_bytes(),
            **({"README.txt": readme} if readme else {}),
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--polarity", choices=["+", "-"], default="+", help="sign of a clockwise rotary detent")
    parser.add_argument("--order-two", choices=["01", "10"], default="01", help="touch indices from left to right")
    parser.add_argument("--order-three", choices=["".join(p) for p in permutations("012")], default="012",
                        help="touch indices from left to right")
    args = parser.parse_args()
    try:
        payload = probe_kit(args.polarity, args.order_two, args.order_three).payload()
        with ZipFile(args.output, "x", compression=ZIP_DEFLATED) as archive:
            for name, data in payload.items():
                archive.writestr(name, data)
    except (OSError, stickkit.StickError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Wrote {args.output}. Extract it to the root of a separate blank FAT32 USB stick.")


if __name__ == "__main__":
    main()
