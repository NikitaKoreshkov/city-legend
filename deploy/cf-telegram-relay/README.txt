Релей Telegram API через Cloudflare (бесплатный workers.dev), когда с VPS в РФ до api.telegram.org таймаут.

1. Установить wrangler: npm i -g wrangler и залогиниться: wrangler login

2. В каталоге deploy/cf-telegram-relay:
   npx wrangler deploy

3. Секреты (токен совпадает с TELEGRAM_BOT_TOKEN на VPS):
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put RELAY_SECRET

4. На VPS в /var/www/citylegend/.env:
   TELEGRAM_API_RELAY_URL="https://<имя после deploy>.workers.dev"
   TELEGRAM_API_RELAY_SECRET="<тот же RELAY_SECRET>"

   pm2 reload ecosystem.config.js --update-env

TELEGRAM_HTTPS_PROXY при работающем релее не обязателен.
