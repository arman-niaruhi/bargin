"""Build the home page story images from the owner's tall originals.

Usage:  python3 tools/packaging/make_story.py <originals folder>

The originals are the owner's tall 3:4 drawings, read in name order (natural sort, so
"x.jpeg" < "x(1).jpeg" < "x(2).jpeg" ...). Slide N = the N-th file. For every slide it writes
images/backgrounds/story-N.jpg and story-N.webp: tall 3:4, 1080x1440, used on every screen
(on computers the page background shows beside it; no wide copies). No colour changes.
"""
import os, re, sys
from PIL import Image

root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
out_dir = os.path.join(root, "images", "backgrounds")
TALL = (1080, 1440)
JPG_Q, WEBP_Q = 80, 78


def natural_key(name):
    # "x.jpeg" has no number -> 0, "x(3).jpeg" -> 3
    m = re.search(r"\((\d+)\)\.[^.]+$", name)
    return (re.sub(r"\(\d+\)(?=\.[^.]+$)", "", name), int(m.group(1)) + 1 if m else 0)


def fit_tall(im):
    # cover-scale to exactly 3:4 1080x1440 (the originals are already 3:4, so nothing is lost)
    w, h = im.size
    s = max(TALL[0] / w, TALL[1] / h)
    im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    x = (im.width - TALL[0]) // 2
    y = (im.height - TALL[1]) // 2
    return im.crop((x, y, x + TALL[0], y + TALL[1]))


def save(im, base):
    im.save(base + ".jpg", "JPEG", quality=JPG_Q, optimize=True, progressive=True)
    im.save(base + ".webp", "WEBP", quality=WEBP_Q, method=6)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    names = sorted((n for n in os.listdir(src) if n.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))),
                   key=natural_key)
    if not names:
        sys.exit("no images in " + src)
    os.makedirs(out_dir, exist_ok=True)
    for i, name in enumerate(names, 1):
        im = Image.open(os.path.join(src, name)).convert("RGB")
        tall = fit_tall(im)
        save(tall, os.path.join(out_dir, "story-%d" % i))
        print("slide %d <- %s" % (i, name))


if __name__ == "__main__":
    main()
