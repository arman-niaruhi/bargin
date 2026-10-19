#!/usr/bin/env python3
"""Makes the Instagram cards (1080x1350) for Bargin as HTML -> headless Chrome PNG.
Texts come from data/products.csv. Output: tools/instagram/out/ (git-ignored, not deployed)."""
import csv, html, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
PHONE = '۰۹۱۱۷۱۳۹۱۰۸'
SITE = 'arman-niaruhi.github.io/bargin'

rows = {r['id']: r for r in csv.DictReader(open(os.path.join(ROOT, 'data/products.csv'), encoding='utf-8-sig'))}
e = html.escape

CSS = """
@font-face{font-family:V;font-weight:400;src:url(file://%(h)s/fonts/Vazirmatn-400.ttf)}
@font-face{font-family:V;font-weight:700;src:url(file://%(h)s/fonts/Vazirmatn-700.ttf)}
@font-face{font-family:V;font-weight:800;src:url(file://%(h)s/fonts/Vazirmatn-800.ttf)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px}
body{font-family:V,'Noto Sans Arabic',sans-serif;direction:rtl;color:#4a2c1a;text-align:center;
 background:radial-gradient(ellipse at 50%% 40%%,#f1dbb0 0%%,#ecd1a3 55%%,#dcb982 100%%);
 position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center}
.frame{position:absolute;inset:28px;border:3px solid #4a2c1a;border-radius:30px;opacity:.55;pointer-events:none}
.frame2{position:absolute;inset:40px;border:1.5px solid #4a2c1a;border-radius:22px;opacity:.3;pointer-events:none}
.brand{font-weight:800;color:#2f7a1f}
.rule{display:flex;align-items:center;justify-content:center;gap:18px;color:#2f7a1f;font-size:34px}
.rule i{display:block;height:3px;width:150px;background:#4a2c1a;opacity:.6;border-radius:2px}
.foot{position:absolute;bottom:62px;left:0;right:0;font-size:32px;font-weight:700;color:#4a2c1a}
.foot b{color:#1f5714;font-weight:800}
.card{background:#f8ecd5;border-radius:28px;box-shadow:0 10px 30px rgba(74,44,26,.22)}
""" % {'h': HERE}

def page(name, body):
    p = os.path.join(OUT, name + '.html')
    open(p, 'w', encoding='utf-8').write(
        '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><style>%s</style><body>'
        '<div class="frame"></div><div class="frame2"></div>%s</body></html>' % (CSS, body))
    png = os.path.join(OUT, name + '.png')
    subprocess.run(['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--window-size=1080,1350', '--virtual-time-budget=4000',
                    '--screenshot=' + png, 'file://' + p], check=True, stderr=subprocess.DEVNULL)
    os.remove(p)
    print(png)

FOOT = '<div class="foot">سفارش در واتساپ <b>%s</b> · %s</div>' % (PHONE, SITE)

# ---- Post 1: intro
LOGO = 'file://' + os.path.join(ROOT, 'tools/packaging/logo-oval.png')
page('post1-intro', """
<style>
.logo{margin-top:70px;height:640px;filter:drop-shadow(0 10px 18px rgba(74,44,26,.25))}
h1{font-size:76px;font-weight:800;color:#2f7a1f;margin-top:26px;line-height:1.3}
.intro{width:880px;margin-top:26px;padding:34px 40px;font-size:40px;line-height:1.85;font-weight:700}
</style>
<img class="logo" src="%s">
<h1>محصولات خانگی برگین</h1>
<div class="card intro">ما انواع سبزی‌ها، رب‌ها، مرباها، ترشیجات و کلی چیز دیگه رو توی خونه‌ی خودمون تولید می‌کنیم؛ از خونه‌ی ما، برای خونه‌ی تو 🌿</div>
%s""" % (LOGO, FOOT))

# ---- product slide + recipe slide
def product_slides(pid, tag):
    r = rows[pid]
    img = 'file://' + os.path.join(ROOT, r['images'].split('|')[0])
    short = r['short'].rsplit(' ',1)[0] if r['short'][-1] not in '.!' and ord(r['short'][-1])>0x2000 else r['short']
    page(tag + '-1-product', """
<style>
.pic{margin-top:78px;width:900px;height:900px;border-radius:30px;border:8px solid #f8ecd5;box-shadow:0 14px 34px rgba(74,44,26,.3)}
h1{font-size:84px;font-weight:800;color:#2f7a1f;margin-top:34px;line-height:1.2}
.s{width:900px;font-size:38px;line-height:1.7;font-weight:700;margin-top:12px}
.foot{bottom:56px}
</style>
<img class="pic" src="%s"><h1>%s</h1><div class="s">%s</div>%s""" % (img, e(r['name']), e(short), FOOT))

    lines = [l.strip() for l in r['recipe'].split('\n') if l.strip()]
    title = lines[0]
    ings = [l[2:] for l in lines if l.startswith('- ')]
    steps = [l for l in lines if l[:1] in '۱۲۳۴۵۶۷۸۹']
    tip = lines[-1] if not lines[-1].startswith('- ') and lines[-1] not in steps else ''
    pills = ''.join('<span>%s</span>' % e(x) for x in ings)
    st = ''.join('<li><b>%s</b><p>%s</p></li>' % (e(s.split('.')[0]), e(s.split('.', 1)[1].strip())) for s in steps)
    page(tag + '-2-recipe', """
<style>
.t{margin-top:80px;font-size:30px;font-weight:700;color:#4a2c1a}
h1{font-size:68px;font-weight:800;color:#2f7a1f;line-height:1.25;margin-top:4px}
.pills{width:940px;margin-top:20px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.pills span{background:#f8ecd5;border:2px solid rgba(74,44,26,.35);border-radius:40px;padding:6px 22px;font-size:32px;font-weight:700}
ol{list-style:none;width:900px;margin-top:26px;text-align:right}
li{display:flex;gap:18px;align-items:flex-start;margin-bottom:20px}
li b{flex:none;width:58px;height:58px;border-radius:50%%;background:#2f7a1f;color:#fff;font-size:34px;line-height:58px;text-align:center;font-weight:800;margin-top:8px}
li p{font-size:38px;line-height:1.6;font-weight:400}
.tip{position:absolute;bottom:130px;left:0;right:0;font-size:36px;font-weight:800;color:#1f5714}
</style>
<div class="t">🍲 دستور پخت</div><h1>%s</h1><div class="rule"><i></i>🌿<i></i></div>
<div class="pills">%s</div><ol>%s</ol><div class="tip">%s</div>%s""" % (e(title), pills, st, e(tip), FOOT))

product_slides('sabzi-ghormeh', 'post2-ghormeh')
product_slides('rob-anar', 'post3-rob-anar')

# ---- Post 4: dalal
dalal_img = 'file://' + os.path.join(ROOT, 'images/dalal-mast.jpg')
page('post4-dalal', """
<style>
.pic{margin-top:78px;width:900px;height:900px;border-radius:30px;border:8px solid #f8ecd5;box-shadow:0 14px 34px rgba(74,44,26,.3)}
h1{font-size:84px;font-weight:800;color:#2f7a1f;margin-top:34px;line-height:1.2}
.s{width:900px;font-size:38px;line-height:1.7;font-weight:700;margin-top:12px}
.foot{bottom:56px}
</style>
<img class="pic" src="%s"><h1>دلال ماست</h1><div class="s">سبزی‌های معطر شمالی برای ماست چکیده‌ی خانگی 🌿</div>%s""" % (dalal_img, FOOT))

# ---- Post 5: dried herbs
page('post5-dried-herbs', """
<style>
h1{font-size:72px;font-weight:800;color:#2f7a1f;margin-top:180px;line-height:1.3}
.subtitle{font-size:42px;font-weight:700;color:#4a2c1a;margin-top:22px}
.desc{width:920px;margin-top:50px;padding:30px;background:#f8ecd5;border-radius:28px;font-size:40px;line-height:1.8;font-weight:700;box-shadow:0 10px 30px rgba(74,44,26,.22)}
.foot{bottom:62px}
</style>
<h1>سبزی‌های خشک</h1>
<div class="subtitle">نعنا، شوید، جعفری، زلنگ، سبزی شامی</div>
<div class="rule"><i></i>🌿<i></i></div>
<div class="desc">هر یک ۳۳۰,۰۰۰ تومان / ۱۰۰ گرم<br><br>چاشنی خانه‌ی شما؛ خشک‌شده با عشق 💚</div>
%s""" % FOOT)

# ---- Post 6: how to order
page('post6-how-to-order', """
<style>
h1{font-size:68px;font-weight:800;color:#2f7a1f;margin-top:100px;line-height:1.2}
.steps{width:920px;margin-top:60px}
.step{display:flex;gap:30px;align-items:flex-start;margin-bottom:50px;font-size:38px;font-weight:700;line-height:1.6}
.step .num{flex:none;width:70px;height:70px;border-radius:50pc;background:#2f7a1f;color:#f8ecd5;font-size:40px;line-height:70px;text-align:center;font-weight:800}
.step .text{flex:1;text-align:right;color:#4a2c1a}
.cta{width:920px;margin-top:60px;padding:40px;background:#2f7a1f;border-radius:28px;color:#f8ecd5;font-size:42px;font-weight:800;text-align:center;box-shadow:0 10px 30px rgba(47,122,31,.25)}
.foot{bottom:56px}
</style>
<h1>چطوری سفارش بدم؟</h1>
<div class="steps">
<div class="step"><div class="num">۱</div><div class="text">سبزی‌ها و محصولاتت رو انتخاب کن</div></div>
<div class="step"><div class="num">۲</div><div class="text">از سایت یا واتساپ سفارش بده</div></div>
<div class="step"><div class="num">۳</div><div class="text">منتظر تحویل توی خونه‌ت بشین 🚚</div></div>
</div>
<div class="cta">واتساپ: ۰۹۱۱۷۱۳۹۱۰۸</div>
%s""" % FOOT)
