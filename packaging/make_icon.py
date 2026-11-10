#!/usr/bin/env python3
"""Draw the MiatOff icon: a teal gauge in the colours of the Meters Designer. Needs Pillow; the results are checked in.

    python packaging/make_icon.py

SPDX-License-Identifier: GPL-3.0-or-later
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SIZE = 1024
START, END, NEEDLE = 150, 390, 318  # degrees, clockwise from three o'clock


def icon() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((32, 32, SIZE - 32, SIZE - 32), radius=210, fill="#0b1018", outline="#2b3747", width=14)
    centre = SIZE / 2
    radius = 310
    box = (centre - radius, centre - radius + 40, centre + radius, centre + radius + 40)
    draw.arc(box, START, END, fill="#2b3747", width=64)
    draw.arc(box, START, NEEDLE, fill="#67dcc2", width=64)
    angle = math.radians(NEEDLE)
    tip = (centre + 250 * math.cos(angle), centre + 40 + 250 * math.sin(angle))
    draw.line(((centre, centre + 40), tip), fill="#eaf0f6", width=40)
    draw.ellipse((centre - 62, centre - 22, centre + 62, centre + 102), fill="#eaf0f6")
    return image


def main() -> None:
    image = icon()
    image.resize((256, 256), Image.LANCZOS).save(HERE / "miatoff.png")
    image.resize((40, 40), Image.LANCZOS).save(HERE / "miatoff-small.png")
    image.save(HERE / "miatoff.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    image.save(HERE / "miatoff.icns")


if __name__ == "__main__":
    main()
