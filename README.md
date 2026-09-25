# GUBI Community Hub V1
Telegram Mini App frontend prototype.

## Run locally
Serve this folder with any static web server. Telegram Mini Apps require an HTTPS URL when connected to the bot.

## Connect to Telegram
1. Deploy the folder to an HTTPS host (Cloudflare Pages, GitHub Pages, etc.).
2. In BotFather configure the bot's Mini App/Menu Button with the deployed URL.
3. Never put the Telegram bot token in these frontend files.

## Next backend phase
Add server-side Telegram initData validation, persistent users, XP ledger, mission claims, referrals, leaderboard and admin-created raids. Keep BOT_TOKEN in server environment variables only.
