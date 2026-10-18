"""Build images/og.jpg (1200x630 link preview): oval Bargin logo on the site's parchment."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
# run from anywhere: python3 tools/packaging/make_og.py
root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
W, H = 1200, 630
y, x = np.mgrid[0:H, 0:W].astype(np.float32)
bg = np.zeros((H, W, 3), np.float32) + np.array([0xec, 0xd1, 0xa3], np.float32)
# soft light from the top (like the site's first radial gradient)
d1 = np.sqrt(((x - W/2) / (1.2*W/2))**2 + (y / (.7*H))**2)
a1 = np.clip(1 - d1/.6, 0, 1) * .55
bg = bg*(1-a1[...,None]) + np.array([255, 246, 225])*a1[...,None]
# warm vignette from the bottom and edges
d2 = np.sqrt(((x - W/2) / (1.4*W/2))**2 + ((y - H) / H)**2)
a2 = np.clip(1 - d2/.7, 0, 1) * .18
bg = bg*(1-a2[...,None]) + np.array([181, 138, 82])*a2[...,None]
edge = np.sqrt(((x - W/2)/(W/2))**2 + ((y - H/2)/(H/2))**2)
a3 = np.clip((edge - .75)/.7, 0, 1) * .22
bg = bg*(1-a3[...,None]) + np.array([150, 105, 60])*a3[...,None]
img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
logo = Image.open(os.path.join(root, "tools/packaging/logo-oval.png")).convert("RGBA")
lh = 590; lw = round(logo.width * lh / logo.height)
logo = logo.resize((lw, lh), Image.LANCZOS)
lx, ly = (W - lw)//2, (H - lh)//2
# soft shadow under the oval
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
alpha = logo.split()[3].point(lambda v: int(v*.28))
shadow = Image.new("RGBA", logo.size, (74, 44, 26, 255)); shadow.putalpha(alpha)
sh.paste(shadow, (lx, ly + 8), shadow)
sh = sh.filter(ImageFilter.GaussianBlur(14))
img = Image.alpha_composite(img.convert("RGBA"), sh)
img.alpha_composite(logo, (lx, ly))
out = os.path.join(root, "images/og.jpg")
img.convert("RGB").save(out, quality=82, optimize=True, progressive=True)
print(out, os.path.getsize(out))
