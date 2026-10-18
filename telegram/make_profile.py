#!/usr/bin/env python3
"""Make profile.jpg, the bot's picture: the oval برگین logo on parchment, square.

Telegram shows it cropped to a circle, so the logo is kept inside that circle.
Needs Pillow. Run from anywhere: python3 telegram/make_profile.py
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "tools", "packaging", "logo-oval.png")
SIZE = 1024
PARCHMENT = (0xec, 0xd1, 0xa3, 255)  # site background

logo = Image.open(LOGO).convert("RGBA")
h = int(SIZE * 0.86)
w = int(logo.width * h / logo.height)
logo = logo.resize((w, h), Image.LANCZOS)

pic = Image.new("RGBA", (SIZE, SIZE), PARCHMENT)
pic.alpha_composite(logo, ((SIZE - w) // 2, (SIZE - h) // 2))
pic.convert("RGB").save(os.path.join(HERE, "profile.jpg"), quality=92)
print("wrote profile.jpg")
