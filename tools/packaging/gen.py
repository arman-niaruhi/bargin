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
# dried herbs: duller, grey/olive greens
DRY_MINT = ["#5f7a45", "#6e8a52", "#7d9660", "#556e3c", "#8aa16b", "#4c6535"]
DRY_DILL = ["#6b7f35", "#7a8d3f", "#88994b", "#5e7230", "#95a457", "#71853a"]
DRY_PARSLEY = ["#3e5f24", "#4a6d2c", "#567934", "#36541f", "#62843d", "#43662a"]
DRY_ZALANG = ["#55703a", "#617d42", "#6d894b", "#4a6332", "#7a9556", "#5a7540"]
DRY_SHAMI = ["#46632a", "#526f31", "#5e7b39", "#3d5824", "#6a8743", "#4f6c2f"]


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
    <stop offset="0" stop-color="#f3dfb8"/><stop offset="1" stop-color="#ead2a4"/>
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
    body = ('M245,140 L555,140 L572,668 Q574,700 542,702 L258,702 Q226,700 228,668 Z')
    zig = "M245,140 " + " ".join(f"L{245 + i*10 + 5},{130 if i % 2 == 0 else 140}" for i in range(31)) + " L555,140"
    win_x0, win_y0, win_x1, win_y1 = 300, 546, 500, 650
    herbs = herb_fill(win_x0, win_y0, win_x1, win_y1, palette, seed)
    return f"""
<ellipse cx="400" cy="716" rx="230" ry="26" fill="#5a3a1c" opacity=".35" filter="url(#soft)"/>
<path d="{body}" fill="url(#kraft)"/>
<path d="{zig} L555,170 L245,170 Z" fill="#b8864f"/>
<path d="{zig}" fill="none" stroke="#8d6034" stroke-width="2"/>
<rect x="245" y="174" width="310" height="4" fill="#8d6034" opacity=".55"/>
<circle cx="400" cy="155" r="8" fill="#ecd3a6" stroke="#8d6034" stroke-width="2"/>
<rect x="250" y="688" width="300" height="3" fill="#8d6034" opacity=".35"/>
<clipPath id="win"><rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" rx="26"/></clipPath>
<g clip-path="url(#win)"><rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" fill="#173a0e"/>{herbs}
<rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" fill="url(#shine)"/></g>
<rect x="{win_x0}" y="{win_y0}" width="{win_x1-win_x0}" height="{win_y1-win_y0}" rx="26" fill="none" stroke="#7b532c" stroke-width="3"/>
<rect x="265" y="184" width="270" height="346" rx="16" fill="url(#paper)" stroke="#4a2c1a" stroke-width="3"/>
<rect x="274" y="193" width="252" height="328" rx="11" fill="none" stroke="#4a2c1a" stroke-width="1.2" opacity=".6"/>
<path d="{body}" fill="url(#shine)"/>
{sprig(190, 700, -28, 1.05, GREENS_FRESH, seed+1)}
{sprig(612, 705, 24, 0.95, GREENS_FRESH, seed+2)}
{sprig(640, 700, 48, 0.7, GREENS_FRESH, seed+3)}
"""


def pouch_labels(name, sub, weight):
    return f"""
<div class="label" style="left:265px;top:196px;width:270px">
  <img src="logo-oval.png" style="width:196px">
  <div class="name" style="font-size:30px;margin-top:0">{name}</div>
  <div class="sub" style="font-size:14px;margin-top:-2px">{sub}</div>
</div>
<div class="label" style="left:0;top:656px;width:800px">
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


def carrot(x, y, angle, length, seed):
    """A carrot lying on the table, root pointing along `angle`."""
    rnd = random.Random(seed)
    w = length * 0.2
    lines = "".join(
        f'<path d="M{length*t:.0f},{-w*(1-t)*0.8:.0f} q4,{w*(1-t)*0.5:.0f} 0,{w*(1-t)*0.9:.0f}" '
        f'stroke="#b84e0c" stroke-width="2" fill="none" opacity=".55"/>'
        for t in (0.2, 0.38, 0.55, 0.7))
    tops = "".join(leaf(-4, rnd.uniform(-6, 6), rnd.uniform(34, 52), -90 + rnd.uniform(-35, 35),
                        rnd.choice(GREENS_FRESH), 0.22) for _ in range(6))
    return (f'<g transform="translate({x},{y}) rotate({angle})">'
            f'<ellipse cx="{length*0.45:.0f}" cy="{w*0.9:.0f}" rx="{length*0.5:.0f}" ry="{w*0.35:.0f}" fill="#5a3a1c" opacity=".3" filter="url(#soft)"/>'
            f'{tops}'
            f'<path d="M0,{-w:.0f} Q{length*0.5:.0f},{-w*0.8:.0f} {length:.0f},0 Q{length*0.5:.0f},{w*0.8:.0f} 0,{w:.0f} Q-8,0 0,{-w:.0f}Z" fill="#e8741c"/>'
            f'<path d="M0,{-w:.0f} Q{length*0.5:.0f},{-w*0.8:.0f} {length:.0f},0 Q{length*0.5:.0f},{-w*0.2:.0f} 0,{-w*0.35:.0f}Z" fill="#f59a46" opacity=".7"/>'
            f'{lines}</g>')


def carrot_slices(seed):
    rnd = random.Random(seed)
    out = []
    for _ in range(9):
        x, y, r = rnd.uniform(590, 700), rnd.uniform(590, 655), rnd.uniform(11, 16)
        out.append(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{r:.0f}" ry="{r*0.7:.0f}" fill="#e8741c" stroke="#c95d10" stroke-width="2"/>'
                   f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{r*0.45:.0f}" ry="{r*0.32:.0f}" fill="#f6a24e"/>')
    return "".join(out)


JAR_POMEGRANATE = ("#3a0709", "#6d1016", "#5a0c12", "#2c0507")
JAR_CARROT = ("#8a3a06", "#d9661a", "#c4560f", "#6e2d04")


def jar(glass=JAR_POMEGRANATE, decor="pomegranate"):
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
    if decor == "carrot":
        decor_svg = carrot(140, 655, -14, 125, 4) + carrot(160, 700, -4, 115, 5) + carrot_slices(6)
    else:
        decor_svg = pomegranate(165, 615, 62, 1) + "<g>" + "".join(seeds) + "</g>"
    return f"""
<defs>
  <linearGradient id="glass" x1="0" x2="1">
    <stop offset="0" stop-color="{glass[0]}"/><stop offset=".2" stop-color="{glass[1]}"/>
    <stop offset=".55" stop-color="{glass[2]}"/><stop offset="1" stop-color="{glass[3]}"/>
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
<ellipse cx="400" cy="722" rx="235" ry="26" fill="#5a3a1c" opacity=".38" filter="url(#soft)"/>
<path d="M270,300 L530,300 Q588,300 588,352 L588,670 Q588,716 542,716 L258,716 Q212,716 212,670 L212,352 Q212,300 270,300Z" fill="url(#glass)"/>
<path d="M232,330 L232,676" stroke="#fff" stroke-opacity=".25" stroke-width="14" stroke-linecap="round"/>
<path d="M288,330 L288,520" stroke="#fff" stroke-opacity=".12" stroke-width="6" stroke-linecap="round"/>
<path d="M568,340 L568,676" stroke="#fff" stroke-opacity=".08" stroke-width="8" stroke-linecap="round"/>
<g clip-path="url(#clothclip)"><rect x="240" y="190" width="320" height="160" fill="url(#cloth)"/>{''.join(checks)}</g>
<path d="M262,300 Q250,250 300,222 Q400,192 500,222 Q550,250 538,300 L548,330 Q520,318 500,334 Q470,318 445,336 Q420,320 400,338 Q378,320 355,336 Q330,318 300,334 Q280,318 252,330 Z" fill="none" stroke="#6b100c" stroke-width="2"/>
<path d="M258,300 Q400,318 542,300" stroke="#d9b47a" stroke-width="7" fill="none"/>
<path d="M258,300 Q400,318 542,300" stroke="#8d6034" stroke-width="1.5" fill="none" stroke-dasharray="5 5"/>
<path d="M300,306 q-14,22 -6,40 M300,306 q6,24 22,34" stroke="#d9b47a" stroke-width="5" fill="none" stroke-linecap="round"/>
<rect x="255" y="344" width="290" height="348" rx="14" fill="url(#paper)" stroke="#4a2c1a" stroke-width="3"/>
<rect x="264" y="353" width="272" height="330" rx="9" fill="none" stroke="#4a2c1a" stroke-width="1.2" opacity=".6"/>
{decor_svg}
{sprig(655, 560, 30, 0.75, GREENS_FRESH, 9)}
{sprig(130, 540, -32, 0.8, GREENS_FRESH, 10)}
"""


def jar_labels(name="رب انار شمالی", name_color="#8a1914", weight="۱ کیلوگرم", name_size=30):
    return f"""
<div class="label" style="left:255px;top:356px;width:290px">
  <img src="logo-oval.png" style="width:188px">
  <div class="name" style="font-size:{name_size}px;margin-top:0;color:{name_color}">{name}</div>
  <span class="weight" style="font-size:14px;padding:1px 14px;margin-top:2px">{weight}</span>
</div>"""


files = {
    "sabzi-ghormeh": page(pouch(11, GREENS_DARK, "#1f5714"),
                          pouch_labels("سبزی قورمه", "سبزی شمالی", "۱ کیلوگرم")),
    "sabzi-morgh-torsh": page(pouch(23, GREENS_FRESH, "#4f7d1f"),
                              pouch_labels("سبزی مرغ ترش", "سبزی معطر شمالی", "۱ کیلوگرم")),
    "nana": page(pouch(31, DRY_MINT, "#4c6535"),
                 pouch_labels("نعنا", "سبزی خشک خانگی", "۱۰۰ گرم")),
    "shevid": page(pouch(37, DRY_DILL, "#5e7230"),
                   pouch_labels("شوید", "سبزی خشک خانگی", "۱۰۰ گرم")),
    "jafari": page(pouch(43, DRY_PARSLEY, "#36541f"),
                   pouch_labels("جعفری", "سبزی خشک خانگی", "۱۰۰ گرم")),
    "zalang": page(pouch(47, DRY_ZALANG, "#4a6332"),
                   pouch_labels("زلنگ", "سبزی خشک خانگی", "۱۰۰ گرم")),
    "sabzi-shami": page(pouch(53, DRY_SHAMI, "#3d5824"),
                        pouch_labels("سبزی شامی", "سبزی خشک خانگی", "۱۰۰ گرم")),
    "rob-anar": page(jar(), jar_labels()),
    "moraba-havij": page(jar(JAR_CARROT, "carrot"),
                         jar_labels("مربای هویج", "#b34a0a", "نیم کیلو")),
}
for name, html in files.items():
    with open(f"{OUT}/{name}.html", "w") as f:
        f.write(html)
print("ok")
