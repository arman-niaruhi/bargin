"""Cut the full Bargin logo (images/logo.jpg) out along its oval frame -> logo-oval.png.

The logo's frame is an oval on top with the slogan scrolls below it, so the mask is the
union of two ellipses (top + bottom), with a soft edge so it blends into the label.
Run from anywhere: python3 tools/packaging/make_logo.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, "..", "..", "images", "logo.jpg")).convert("RGB")
W, H = src.size  # 767 x 1280

S = 4  # draw the mask big, then shrink, for a smooth edge
mask = Image.new("L", (W * S, H * S), 0)
d = ImageDraw.Draw(mask)
cx = 377
for cy, rx, ry in ((555, 370, 420), (760, 378, 400)):
    d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=255)
mask = mask.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(6))

out = src.copy()
out.putalpha(mask)
out = out.crop(out.getbbox())
out.save(os.path.join(HERE, "logo-oval.png"))
print("logo-oval.png", out.size)
