#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Writes the Meters shift sounds, 22,050 Hz 16-bit mono PCM:

    meters/sounds/tick.wav   the warning tick before the shift point: 1.6 kHz, 50 ms, 4 ms fades
    meters/sounds/shift.wav  the steady tone at the shift point: 2.6 kHz, 1.5 s, 5 ms in, 200 ms fade out
                             (the page stops it earlier, at the upshift)

Our own synthesis (no third-party sound), and deterministic: the same bytes on every machine, so the MANIFEST hashes
only change when this recipe does. Two pitches so the warning and the shift point are easy to tell apart.

    python tools/make_shift_sound.py          # write the files
    python tools/make_shift_sound.py --check  # exit 1 when a committed file differs from the recipe
"""
import math
import struct
import sys
from pathlib import Path

RATE = 22050
FOLDER = Path(__file__).resolve().parent.parent / "meters" / "sounds"
# name: (frequency Hz, length s, fade in s, fade out s, level 0..1)
SOUNDS = {
    "tick": (1600.0, 0.050, 0.004, 0.004, 0.7),
    "shift": (2600.0, 1.500, 0.005, 0.200, 0.7),
}


def samples(freq, length, fade_in, fade_out, level) -> bytes:
    n, a, b = int(RATE * length), int(RATE * fade_in), int(RATE * fade_out)
    out = bytearray()
    for i in range(n):
        gain = min(1.0, i / a, (n - 1 - i) / b)
        # Rounded to whole steps of 16-bit PCM: no platform-dependent float formatting reaches the bytes.
        out += struct.pack("<h", int(round(32767 * level * gain * math.sin(2 * math.pi * freq * i / RATE))))
    return bytes(out)


def wav(name) -> bytes:
    data = samples(*SOUNDS[name])
    fmt = struct.pack("<HHIIHH", 1, 1, RATE, RATE * 2, 2, 16)
    return (b"RIFF" + struct.pack("<I", 4 + 8 + len(fmt) + 8 + len(data)) + b"WAVE" +
            b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(data)) + data)


def main(argv) -> int:
    if "--check" in argv:
        bad = [n for n in SOUNDS if not (FOLDER / f"{n}.wav").is_file() or (FOLDER / f"{n}.wav").read_bytes() != wav(n)]
        for name in bad:
            print(f"{FOLDER / (name + '.wav')} does not match tools/make_shift_sound.py; run it to regenerate.", file=sys.stderr)
        return 1 if bad else 0
    FOLDER.mkdir(parents=True, exist_ok=True)
    for name in SOUNDS:
        data = wav(name)
        (FOLDER / f"{name}.wav").write_bytes(data)
        print(f"wrote {FOLDER / (name + '.wav')} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
