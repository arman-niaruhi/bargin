#!/usr/bin/env bash
# Renders the packaging images defined in gen.py and saves them to images/.
# Usage: tools/packaging/render.sh   (run from the repo root; needs python3 + Pillow + google-chrome)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
cp wordmark.png out/
python3 gen.py out
python3 -m http.server 8766 -d out >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
for f in out/*.html; do
  n=$(basename "$f" .html)
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --virtual-time-budget=5000 --window-size=800,800 \
    --screenshot="out/$n.png" "http://localhost:8766/$n.html" >/dev/null 2>&1
  # zoom in so the package fills the product card
  python3 - "out/$n.png" "../../images/$n.jpg" "$n" <<'PY'
import sys
from PIL import Image
jars = ("rob-anar", "moraba-havij")  # glass jars sit lower, so crop them differently
box = (85, 145, 715, 775) if sys.argv[3] in jars else (100, 115, 700, 715)
Image.open(sys.argv[1]).convert("RGB").crop(box).resize((800, 800), Image.LANCZOS) \
    .save(sys.argv[2], quality=88, optimize=True)
PY
  echo "images/$n.jpg"
done
