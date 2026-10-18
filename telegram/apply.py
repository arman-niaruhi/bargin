#!/usr/bin/env python3
"""Set up the برگین Telegram bot's profile from settings.json.

The bot runs no code of its own: this script only sends the profile settings
(name, descriptions, menu button, command list) to Telegram once.

Usage:
  python3 apply.py show     print what Telegram has now
  python3 apply.py preview  print what would be sent (sends nothing)
  python3 apply.py apply    send settings.json to Telegram
  python3 apply.py photo    upload the profile picture (settings.json "profile_photo")

Needs TELEGRAM_BOT_TOKEN in .env and a connection that can reach
api.telegram.org. Plain Python 3, nothing to install.
"""
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.telegram.org/bot{token}/{method}"

# Telegram's limits
MAX_NAME = 64
MAX_SHORT = 120
MAX_DESC = 512


def load_env():
    env = {}
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def load_shop():
    """Read SHOP from the website's products.js and the categories from
    data/products.csv, so the bot shows the same categories and contacts as the site."""
    with open(os.path.join(HERE, "..", "products.js"), encoding="utf-8") as f:
        js = f.read()
    shop_block = re.search(r"const SHOP = \{(.*?)\n\};", js, re.S).group(1)
    shop = dict(re.findall(r'^\s*(\w+):\s*"([^"]*)"', shop_block, re.M))
    # categories = the category names in data/products.csv, in first-seen order
    with open(os.path.join(HERE, "..", "data", "products.csv"), encoding="utf-8-sig") as f:
        text = f.read()
    first = text.split("\n", 1)[0]
    sep = ";" if ";" in first and "," not in first else ","
    cats = []
    for r in csv.DictReader(text.splitlines(True), delimiter=sep):
        name = (r.get("category") or "").strip()
        if name and (r.get("id") or "").strip() and name not in cats:
            cats.append(name)
    return shop, cats


def options_text(site, shop, cats):
    """The clickable list shown in the bot's description (same labels as the site)."""
    lines = ["🛒 همه محصولات:", site]
    for name in cats:
        lines += ["🌿 %s:" % name, "%s?cat=%s" % (site, urllib.parse.quote(name))]
    contacts = []
    if shop.get("whatsapp"):
        contacts += ["💬 سفارش در واتساپ:", "https://wa.me/" + shop["whatsapp"]]
    if shop.get("phone"):
        contacts += ["📞 تماس: " + shop["phone"]]
    if shop.get("instagram"):
        contacts += ["📷 اینستاگرام:", "https://instagram.com/" + shop["instagram"]]
    if contacts:
        lines += ["", "سؤالی داری یا می‌خوای سفارش بدی؟ بهمون پیام بده:"] + contacts
    return "\n".join(lines)


def load_settings():
    with open(os.path.join(HERE, "settings.json"), encoding="utf-8") as f:
        settings = json.load(f)
    shop, cats = load_shop()
    settings["description"] = settings["description"].replace(
        "{options}", options_text(settings["site_url"], shop, cats))
    return settings


def check(settings):
    problems = []
    for key, limit in (("name", MAX_NAME), ("short_description", MAX_SHORT),
                       ("description", MAX_DESC)):
        if len(settings.get(key, "")) > limit:
            problems.append("%s is %d characters (Telegram allows %d)"
                            % (key, len(settings[key]), limit))
    menu = settings.get("menu_button", {})
    if menu.get("type") not in ("default", "commands", "web_app"):
        problems.append("menu_button.type must be default, commands or web_app")
    return problems


def menu_payload(menu):
    if menu["type"] == "web_app":
        return {"type": "web_app", "text": menu["text"],
                "web_app": {"url": menu["url"]}}
    return {"type": menu["type"]}


def plan(settings):
    """The list of (method, params) calls that apply settings.json."""
    calls = [
        ("setMyName", {"name": settings["name"]}),
        ("setMyShortDescription",
         {"short_description": settings["short_description"]}),
        ("setMyDescription", {"description": settings["description"]}),
        ("setChatMenuButton",
         {"menu_button": menu_payload(settings["menu_button"])}),
    ]
    if settings.get("commands"):
        calls.append(("setMyCommands", {"commands": settings["commands"]}))
    else:
        calls.append(("deleteMyCommands", {}))
    return calls


def call(token, method, params=None):
    data = json.dumps(params or {}).encode("utf-8")
    req = urllib.request.Request(API.format(token=token, method=method),
                                 data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        body = json.load(e)
    except urllib.error.URLError as e:
        sys.exit("Can't reach Telegram (%s). Is the VPN on?" % e.reason)
    if not body.get("ok"):
        raise RuntimeError("%s failed: %s" % (method, body.get("description")))
    return body["result"]


def upload_photo(token, path):
    """setMyProfilePhoto needs the JPG sent as a multipart file upload."""
    boundary = uuid.uuid4().hex
    with open(path, "rb") as f:
        jpg = f.read()
    parts = [
        b"--" + boundary.encode(),
        b'Content-Disposition: form-data; name="photo"',
        b"",
        json.dumps({"type": "static", "photo": "attach://pic"}).encode(),
        b"--" + boundary.encode(),
        b'Content-Disposition: form-data; name="pic"; filename="profile.jpg"',
        b"Content-Type: image/jpeg",
        b"",
        jpg,
        b"--" + boundary.encode() + b"--",
        b"",
    ]
    req = urllib.request.Request(
        API.format(token=token, method="setMyProfilePhoto"),
        data=b"\r\n".join(parts),
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        body = json.load(e)
    except urllib.error.URLError as e:
        sys.exit("Can't reach Telegram (%s). Is the VPN on?" % e.reason)
    if not body.get("ok"):
        sys.exit("setMyProfilePhoto failed: %s" % body.get("description"))
    print("OK    setMyProfilePhoto")


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "preview"
    settings = load_settings()

    if action == "preview":
        problems = check(settings)
        for method, params in plan(settings):
            print("%s\n%s\n" % (method, json.dumps(params, ensure_ascii=False,
                                                   indent=2)))
        print("Description: %d of %d characters" % (len(settings["description"]), MAX_DESC))
        print("\n".join("PROBLEM: " + p for p in problems) or "Settings look OK.")
        return

    token = load_env().get("TELEGRAM_BOT_TOKEN")
    if not token:
        sys.exit("TELEGRAM_BOT_TOKEN is missing in .env (get it from @BotFather).")

    if action == "show":
        me = call(token, "getMe")
        print("Bot: @%s (id %s)" % (me["username"], me["id"]))
        print("Name:", call(token, "getMyName")["name"])
        print("Short description:",
              call(token, "getMyShortDescription")["short_description"])
        print("Description:", call(token, "getMyDescription")["description"])
        print("Menu button:", json.dumps(call(token, "getChatMenuButton"),
                                         ensure_ascii=False))
        print("Commands:", json.dumps(call(token, "getMyCommands"),
                                      ensure_ascii=False))
    elif action == "apply":
        problems = check(settings)
        if problems:
            sys.exit("\n".join("PROBLEM: " + p for p in problems))
        for method, params in plan(settings):
            try:
                call(token, method, params)
                print("OK   ", method)
            except RuntimeError as e:
                # setMyName is rate-limited by Telegram; keep going with the rest
                print("FAIL ", e)
    elif action == "photo":
        upload_photo(token, os.path.join(HERE, settings["profile_photo"]))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
