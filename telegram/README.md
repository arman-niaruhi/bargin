# برگین Telegram bot

Lives in `telegram/` inside the website repo. Not deployed: the Pages workflow copies
only the site files.

A storefront bot for برگین. It runs **no code**: it is a Telegram profile that shows the
shop's name, description and website link. Products, prices and ordering stay on the
website (<https://arman-niaruhi.github.io/bargin/>), so there is only one place to edit.

The bot can't answer messages or `/start` — customers open the website link from its
description to see products and order.

## Files
- `settings.json` — everything Telegram shows (Persian texts, menu button). Edit this.
  `{options}` in `description` is filled in by `apply.py` from the website's
  the categories in `../data/products.csv` and `SHOP` in `products.js`: a link for all products, one per category
  (`?cat=`), and the same contacts as the site (WhatsApp, phone, Instagram). Change those, then
  run `apply.py apply` again.
- `apply.py` — sends `settings.json` to Telegram. Plain Python 3, nothing to install.
- `profile.jpg` — the bot's picture: the oval برگین logo on parchment, square.
  Rebuild it with `python3 make_profile.py` (uses `../tools/packaging/logo-oval.png`).
- `.env` — the bot token. **Never commit or share it.** (`.env.example` shows the format.)

## One-time setup in Telegram
1. Open **@BotFather** (blue tick) → `/newbot`.
2. Name: `برگین`. Username: must end in `bot`, e.g. `bargin_shop_bot`.
3. Copy the token BotFather gives you into `.env`:
   `TELEGRAM_BOT_TOKEN=123456789:AA...`

## Apply the settings
Telegram is filtered in Iran: turn the VPN on first.

Run from this folder (`cd telegram`):

```
python3 apply.py preview   # what would be sent (sends nothing)
python3 apply.py apply     # send settings.json to Telegram
python3 apply.py photo     # upload profile.jpg as the bot's picture
python3 apply.py show      # what Telegram has now
```

The bot's link to share with customers: `https://t.me/<username>`.

## Menu button
`menu_button.type` in `settings.json`:
- `default` — Telegram's normal button (current choice; website link is in the texts).
- `web_app` — a «🛒 فروشگاه» button that opens the website inside Telegram.
- `commands` — shows the command list (only useful if `commands` is filled in).
