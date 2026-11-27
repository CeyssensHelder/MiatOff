#!/usr/bin/env python3
"""Build the touch-free test sticks for a car whose touchscreen is broken (issue #31) as ZIPs.

    python aa-touch-stick/commander/build_touchfree_sticks.py OUTDIR

Each ZIP is extracted to the root of a blank FAT32 stick and holds a README.txt for the person in the car. Nothing
on any of them needs a tap: every prompt closes by itself, and nothing changes the unit. Which one answers what is in
aa-touch-stick/commander/README.md ("Touch-free test sticks").
"""
# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import build_probe
import kits
import stickkit

COMMON = """\
MiatOff test stick {number}: {title}

This stick is READ-ONLY. It changes nothing on the car. It needs NO touchscreen: every message closes by itself.

How to use it
1. Use a blank FAT32 stick. If it has anything from another MiatOff test on it, delete all of it first (two
   different tests on one stick confuse the car).
2. Extract this ZIP to the ROOT of the stick (the files must not sit in a folder).
3. Engine on. Wait until the Mazda home screen has appeared. Insert the stick into the car's USB port.
4. {steps}
5. When the message says it is done, or after the time stated above, take the stick out and put it in the PC.

{report}

Do not post the whole stick anywhere: only the files named above.
"""

TEXTS = {
    "check-no-touch": dict(
        title="check without touching anything",
        steps="""Nothing to press. A message "MiatOff dump running" appears, then "MiatOff dump finished" after 1-2 minutes.
   The messages close by themselves a minute later.""",
        report="""What to send us
- miatoff-dump.log (in the root of the stick)
- miatoff-dumps/001-snapshot-.../runtime/commander-facts.txt
- miatoff-dumps/001-snapshot-.../runtime/input-devices.txt
- miatoff-dumps/001-snapshot-.../SUMMARY.txt
If the stick shows no message at all, send the log if there is one, and tell us what the screen did."""),
    "knob-test": dict(
        title="what does the Commander knob do on this car?",
        steps="""Three test prompts follow, each one after the other (up to 2 minutes each, 6 minutes in all).
   Prompt 1: turn the knob right one click, then left one click, tilt it up/down/left/right, then press it.
   Prompt 2: press the Back button next to the knob.
   Prompt 3: turn the knob to a word and press it.
   Look at the screen while you do it. A prompt that gets no answer in 2 minutes moves on by itself.""",
        report="""Please write down, for each prompt, what you saw:
- Did square brackets [ ] appear around a word, and did they follow the knob? To the right when you turned right?
- Did the Mazda home screen behind the prompt also move?
- The order of the words on the screen from left to right (FIRST / SECOND / THIRD).
- The last message lists how each prompt ended ("Prompt 1: button 0; ...").

What to send us
- miatoff-commander.log (in the root of the stick): it lists every input device and every knob event.
- your notes above."""),
    "knob-test-reversed": dict(
        title="the same knob test with the opposite direction and order",
        steps="""Only use this if the brackets in test 2 moved the WRONG way (left when you turned right) or the order of
   the words did not match. It is the same three prompts as the knob test; do them the same way.""",
        report="""Please write down, for each prompt, what you saw: did the brackets move the right way now, and in what order
are the words on the screen from left to right?

What to send us
- miatoff-commander.log (in the root of the stick)
- your notes above."""),
    "check-knob-forced": dict(
        title="the real check, with the knob switched on for this car",
        steps="""The MiatOff check prompt appears: FULL, SNAPSHOT and MORE. The knob is switched on even if the car was not
   measured yet. Turn the knob until the brackets are around SNAPSHOT (the middle one), then press it.
   Do NOT pick FULL or MORE. If you do nothing, the prompt closes after 2 minutes and nothing is done. That is a
   result too. If the knob cannot be used at all, the stick takes a SNAPSHOT by itself.""",
        report="""Please write down: did the brackets appear, did they follow the knob, did the press choose SNAPSHOT?

What to send us
- miatoff-dump.log (in the root of the stick)
- miatoff-dumps/001-snapshot-.../runtime/commander-facts.txt
- your notes above."""),
}


def readme(number: int, key: str) -> bytes:
    text = TEXTS[key]
    body = COMMON.format(number=number, title=text["title"], steps=text["steps"], report=text["report"])
    return body.replace("\r\n", "\n").encode("ascii")


def all_kits() -> dict:
    """File name -> kit, in the order they are meant to be tried."""
    return {
        "1-check-no-touch": kits.hands_free_check_kit(action="snapshot", readme=readme(1, "check-no-touch")),
        "2-knob-test": build_probe.probe_kit(readme=readme(2, "knob-test")),
        "3-knob-test-reversed": build_probe.probe_kit("-", "10", "210", readme=readme(3, "knob-test-reversed")),
        "4-check-knob-forced": kits.hands_free_check_kit(knob=True, readme=readme(4, "check-knob-forced")),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("outdir", type=Path)
    args = parser.parse_args()
    try:
        args.outdir.mkdir(parents=True, exist_ok=True)
        for name, kit in all_kits().items():
            target = args.outdir / f"miatoff-{name}.zip"
            with ZipFile(target, "x", compression=ZIP_DEFLATED) as archive:
                for member, data in kit.payload().items():
                    archive.writestr(member, data)
            print(f"Wrote {target}")
    except (OSError, stickkit.StickError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
