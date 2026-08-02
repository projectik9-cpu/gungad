# GunGad Bot → Railway (1 раз)

## Деплой (если ещё не подключено)

1. Открой https://railway.app → **New Project** → **Deploy from GitHub repo**
2. Выбери `projectik9-cpu/gungad`
3. Root Directory: `/` (корень репо)
4. После деплоя: **Settings → Networking → Generate Domain**
5. Скопируй URL вида `https://gungad-production-xxxx.up.railway.app`

## Variables (Railway → Variables)

Вставь (значения из своего `.env`):

```
BOT_TOKEN=...
SUPABASE_URL=https://nndebjrieyxqjnwkslhn.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
WEB_APP_URL=https://webapp-rosy-psi-26.vercel.app
NODE_ENV=production
JWT_SECRET=любой_длинный_секрет
ENCRYPTION_KEY=любой_ключ_минимум_32_символа
LOG_LEVEL=info
```

`PORT` Railway выставит сам — не трогай.

## Проверка

Открой в браузере: `https://ТВОЙ-RAILWAY-URL/api/health`  
Должно вернуть `{"status":"ok",...}`

## WebApp (Vercel)

```
VITE_API_URL=https://ТВОЙ-RAILWAY-URL
```

Потом redeploy webapp.
