"""Generate packaging mockup pages (HTML+SVG) for Bargin products.

To add a product: add an entry to `files` at the bottom (pouch for herbs/dry goods,
jar for رب/pastes), then run tools/packaging/render.sh.
"""
import math
import random
import sys

OUT = sys.argv[1]

FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800;900&display=swap">'


def leaf(cx, cy, length, angle, color, width_ratio=0.38):
    w = length * width_ratio
    return (f'<path transform="translate({cx:.1f},{cy:.1f}) rotate({angle:.1f})" '
            f'd="M0,0 C{w:.1f},{-length*0.3:.1f} {w*0.8:.1f},{-length*0.8:.1f} 0,{-length:.1f} '
            f'C{-w*0.8:.1f},{-length*0.8:.1f} {-w:.1f},{-length*0.3:.1f} 0,0Z" fill="{color}"/>'
            f'<path transform="translate({cx:.1f},{cy:.1f}) rotate({angle:.1f})" d="M0,0 L0,{-length*0.92:.1f}" '
            f'stroke="rgba(255,255,255,.18)" stroke-width="1.2"/>')


def herb_fill(x0, y0, x1, y1, palette, seed, n=260, size=(10, 24)):
    rnd = random.Random(seed)
    parts = []
    for _ in range(n):
        parts.append(leaf(rnd.uniform(x0 - 10, x1 + 10), rnd.uniform(y0, y1 + 25),
                          rnd.uniform(*size), rnd.uniform(0, 360), rnd.choice(palette)))
    return "".join(parts)


def sprig(x, y, angle, scale, palette, seed):
    rnd = random.Random(seed)
    s = [f'<g transform="translate({x},{y}) rotate({angle}) scale({scale})">',
         '<path d="M0,0 C4,-40 -4,-90 2,-140" stroke="#3d6b22" stroke-width="3" fill="none" stroke-linecap="round"/>']
    for i in range(7):
        t = 20 + i * 18
        side = 1 if i % 2 else -1
        s.append(leaf(side * 2, -t, 30 - i * 2, side * 55 + rnd.uniform(-8, 8), rnd.choice(palette)))
    s.append(leaf(2, -140, 24, 0, palette[0]))
    s.append('</g>')
    return "".join(s)


GREENS_DARK = ["#1f4d14", "#2a5e1a", "#2f6b1d", "#376f22", "#1b4310", "#41782a"]
GREENS_FRESH = ["#3f8a2a", "#4f9a33", "#5ea83b", "#2f7a1f", "#6db048", "#47862c", "#7cb956"]


def page(svg_body, labels_html):
    return f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">{FONT}
<style>
html,body{{margin:0;width:800px;height:800px;overflow:hidden;background:#ecd1a3}}
.stage{{position:relative;width:800px;height:800px;font-family:Vazirmatn,sans-serif}}
svg{{position:absolute;inset:0}}
.label{{position:absolute;text-align:center;color:#4a2c1a}}
.label img{{display:block;margin:0 auto}}
.name{{font-weight:900;color:#1f5714;line-height:1.15}}
.sub{{font-weight:600;color:#4a2c1a}}
.tag{{font-weight:600;color:#7a5236}}
.weight{{font-weight:800;color:#fff;background:#4a2c1a;border-radius:999px;display:inline-block}}
</style></head><body><div class="stage">
<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="bg" cx="50%" cy="38%" r="75%">
    <stop offset="0" stop-color="#f8ebcf"/><stop offset=".65" stop-color="#ecd3a6"/><stop offset="1" stop-color="#d9b880"/>
  </radialGradient>
  <linearGradient id="kraft" x1="0" x2="1">
    <stop offset="0" stop-color="#a57643"/><stop offset=".18" stop-color="#c99e68"/>
    <stop offset=".5" stop-color="#d6ad78"/><stop offset=".82" stop-color="#c49762"/><stop offset="1" stop-color="#97693a"/>
  </linearGradient>
  <linearGradient id="shine" x1="0" x2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff" stop-opacity=".22"/>
    <stop offset=".32" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbf3e2"/><stop offset="1" stop-color="#f1e2c4"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/>
    <feColorMatrix values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .09 0"/>
    <feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<rect width="800" height="800" fill="#000" filter="url(#grain)" opacity=".6"/>
{svg_body}
</svg>
{labels_html}
</div></body></html>"""


def pouch(seed, palette, band_color):
    # stand-up kraft pouch
    body = ('M245,175 L555,175 L572,640 Q574,672 542,674 L258,674 Q226,672 228,640 Z')
    zig = "M245,175 " + " ".join(f"L{245 + i*10 + 5},{165 if i % 2 == 0 else 175}" for i in range(31)) + " L555,175"
    win_x0, win_y0, win_x1, win_y1 = 300, 462, 500, 618
    herbs = herb_fill(win_x0, win_y0, win_x1, win_y1, palette, seed)
    return f"""
<ellipse cx="400" cy="690" rx="230" ry="26" fill="#5a3a1c" opacity=".35" filter="url(#soft)"/>
<path d="{body}" fill="url(#kraft)"/>
<path d="{zig} L555,205 L245,205 Z" fill="#b8864f"/>
<path d="{zig}" fill="none" stroke="#8d6034" stroke-width="2"/>
<rect x="245" y="212" width="310" height="5" fill="#8d6034" opacity=".55"/>
<circle cx="400" cy="192" r="8" fill="#ecd3a6" stroke="#8d6034" stroke-width="2"/>
<rect x="250" y="650" width="300" height="3" fill="#8d6034" opacity=".35"/>
<clipPath id="win"><rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" rx="26"/></clipPath>
<g clip-path="url(#win)"><rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" fill="#173a0e"/>{herbs}
<rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" fill="url(#shine)"/></g>
<rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" rx="26" fill="none" stroke="#7b532c" stroke-width="3"/>
<rect x="280" y="238" width="240" height="206" rx="16" fill="url(#paper)" stroke="#4a2c1a" stroke-width="3"/>
<rect x="289" y="247" width="222" height="188" rx="11" fill="none" stroke="#4a2c1a" stroke-width="1.2" opacity=".6"/>
<rect x="280" y="404" width="240" height="40" fill="{band_color}"/>
<path d="M280,404 h240 v24 q0,16 -16,16 h-208 q-16,0 -16,-16z" fill="{band_color}"/>
<path d="M245,175 L555,175 L572,640 Q574,672 542,674 L258,674 Q226,672 228,640 Z" fill="url(#shine)"/>
{sprig(190, 700, -28, 1.05, GREENS_FRESH, seed+1)}
{sprig(612, 705, 24, 0.95, GREENS_FRESH, seed+2)}
{sprig(640, 700, 48, 0.7, GREENS_FRESH, seed+3)}
"""


def pouch_labels(name, sub, weight):
    return f"""
<div class="label" style="left:280px;top:250px;width:240px">
  <img src="wordmark.png" style="width:150px">
  <div class="name" style="font-size:31px;margin-top:6px">{name}</div>
  <div class="sub" style="font-size:15px;margin-top:2px">{sub}</div>
</div>
<div class="label" style="left:280px;top:409px;width:240px">
  <div class="tag" style="color:#fff;font-size:14px">از طبیعت تا خانه شما</div>
</div>
<div class="label" style="left:0;top:628px;width:800px">
  <span class="weight" style="font-size:15px;padding:2px 16px">{weight}</span>
</div>"""


def pomegranate(cx, cy, r, seed):
    return f"""
<g transform="translate({cx},{cy})">
  <ellipse cx="6" cy="{r*0.95}" rx="{r*0.95}" ry="{r*0.18}" fill="#5a3a1c" opacity=".35" filter="url(#soft)"/>
  <circle r="{r}" fill="#a3161b"/>
  <circle r="{r}" fill="url(#pomshade)"/>
  <path d="M{-r*0.22},{-r*0.92} l{r*0.06},{-r*0.3} l{r*0.1},{r*0.14} l{r*0.06},{-r*0.2} l{r*0.06},{r*0.2} l{r*0.1},{-r*0.14} l{r*0.06},{r*0.3}z" fill="#7d1015"/>
  <ellipse cx="{-r*0.35}" cy="{-r*0.35}" rx="{r*0.22}" ry="{r*0.12}" fill="#fff" opacity=".28" transform="rotate(-35 {-r*0.35} {-r*0.35})"/>
</g>"""


def jar():
    rnd = random.Random(7)
    # check pattern for the cloth lid cover
    checks = []
    for i in range(-12, 14):
        for j in range(0, 6):
            if (i + j) % 2 == 0:
                checks.append(f'<rect x="{400 + i*20}" y="{212 + j*20}" width="20" height="20" fill="#fff" opacity=".22"/>')
    seeds = []
    for _ in range(30):
        x, y = rnd.uniform(585, 700), rnd.uniform(585, 650)
        seeds.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="6" ry="8" transform="rotate({rnd.uniform(0,180):.0f} {x:.0f} {y:.0f})" fill="{rnd.choice(["#b3121c","#c8202a","#8f0d15"])}"/>')
    return f"""
<defs>
  <linearGradient id="glass" x1="0" x2="1">
    <stop offset="0" stop-color="#3a0709"/><stop offset=".2" stop-color="#6d1016"/>
    <stop offset=".55" stop-color="#5a0c12"/><stop offset="1" stop-color="#2c0507"/>
  </linearGradient>
  <radialGradient id="pomshade" cx="35%" cy="30%" r="80%">
    <stop offset="0" stop-color="#e2453f" stop-opacity=".9"/><stop offset=".6" stop-color="#a3161b" stop-opacity="0"/>
    <stop offset="1" stop-color="#4d070a" stop-opacity=".8"/>
  </radialGradient>
  <linearGradient id="cloth" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#b8261f"/><stop offset="1" stop-color="#8a1914"/>
  </linearGradient>
  <clipPath id="clothclip"><path d="M262,300 Q250,250 300,222 Q400,192 500,222 Q550,250 538,300 L548,330 Q520,318 500,334 Q470,318 445,336 Q420,320 400,338 Q378,320 355,336 Q330,318 300,334 Q280,318 252,330 Z"/></clipPath>
</defs>
<ellipse cx="400" cy="682" rx="210" ry="26" fill="#5a3a1c" opacity=".38" filter="url(#soft)"/>
<path d="M270,300 L530,300 Q560,300 560,340 L560,630 Q560,676 516,676 L284,676 Q240,676 240,630 L240,340 Q240,300 270,300Z" fill="url(#glass)"/>
<path d="M262,318 L262,640" stroke="#fff" stroke-opacity=".25" stroke-width="14" stroke-linecap="round"/>
<path d="M288,330 L288,520" stroke="#fff" stroke-opacity=".12" stroke-width="6" stroke-linecap="round"/>
<path d="M538,330 L538,640" stroke="#fff" stroke-opacity=".08" stroke-width="8" stroke-linecap="round"/>
<g clip-path="url(#clothclip)"><rect x="240" y="190" width="320" height="160" fill="url(#cloth)"/>{''.join(checks)}</g>
<path d="M262,300 Q250,250 300,222 Q400,192 500,222 Q550,250 538,300 L548,330 Q520,318 500,334 Q470,318 445,336 Q420,320 400,338 Q378,320 355,336 Q330,318 300,334 Q280,318 252,330 Z" fill="none" stroke="#6b100c" stroke-width="2"/>
<path d="M258,300 Q400,318 542,300" stroke="#d9b47a" stroke-width="7" fill="none"/>
<path d="M258,300 Q400,318 542,300" stroke="#8d6034" stroke-width="1.5" fill="none" stroke-dasharray="5 5"/>
<path d="M300,306 q-14,22 -6,40 M300,306 q6,24 22,34" stroke="#d9b47a" stroke-width="5" fill="none" stroke-linecap="round"/>
<rect x="262" y="392" width="276" height="216" rx="14" fill="url(#paper)" stroke="#4a2c1a" stroke-width="3"/>
<rect x="271" y="401" width="258" height="198" rx="9" fill="none" stroke="#4a2c1a" stroke-width="1.2" opacity=".6"/>
<path d="M262,566 h276 v28 q0,14 -14,14 h-248 q-14,0 -14,-14z" fill="#1f5714"/>
{pomegranate(165, 615, 62, 1)}
<g>{''.join(seeds)}</g>
{sprig(655, 560, 30, 0.75, GREENS_FRESH, 9)}
{sprig(130, 540, -32, 0.8, GREENS_FRESH, 10)}
"""


def jar_labels():
    return """
<div class="label" style="left:262px;top:404px;width:276px">
  <img src="wordmark.png" style="width:150px">
  <div class="name" style="font-size:33px;margin-top:6px;color:#8a1914">رب انار شمالی</div>
  <span class="weight" style="font-size:14px;padding:1px 14px;margin-top:6px">۱ کیلوگرم</span>
</div>
<div class="label" style="left:262px;top:570px;width:276px">
  <div class="tag" style="color:#fff;font-size:14px">از طبیعت تا خانه شما</div>
</div>"""


files = {
    "sabzi-ghormeh": page(pouch(11, GREENS_DARK, "#1f5714"),
                          pouch_labels("سبزی قورمه", "سبزی شمالی", "۱ کیلوگرم")),
    "sabzi-morgh-torsh": page(pouch(23, GREENS_FRESH, "#4f7d1f"),
                              pouch_labels("سبزی مرغ ترش", "سبزی معطر شمالی", "۱ کیلوگرم")),
    "rob-anar": page(jar(), jar_labels()),
}
for name, html in files.items():
    with open(f"{OUT}/{name}.html", "w") as f:
        f.write(html)
print("ok")
