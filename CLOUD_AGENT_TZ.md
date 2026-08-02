# GunGad Casino — ТЗ для Cloud / следующей модели

## Цель

Довести GunGad Casino до полноценной работы на **Supabase**: реальные игроки, баланс, Stars, ставки, онлайн-счётчик. UI и игры уже есть; нужна серверная логика и замена демо-режима (localStorage).

---

## Контекст проекта

| Часть | Путь | Стек |
|--------|------|------|
| WebApp (казино) | `gungad-casino/` | React + Vite + Tailwind, деплой Vercel `webapp` |
| Telegram-бот | `src/` | Telegraf, Node ESM |
| Supabase | проект `nndebjrieyxqjnwkslhn` | EU (`eu-central-1`), URL `https://nndebjrieyxqjnwkslhn.supabase.co` |
| Production URL | — | `https://webapp-rosy-psi-26.vercel.app` |

Бот в Telegram: только кнопка **«Открыть казино»** (меню команд очищено).

---

## Что УЖЕ сделано (не переделывать без причины)

### База (Supabase) — foundation ПРИМЕНЁН

Миграция: `supabase/migrations/20260802230000_gungad_foundation.sql`

Таблицы `gg_*` (RLS включён, user-policies пока нет — пишет в основном `service_role`):

- `gg_profiles` — профиль Telegram-пользователя  
- `gg_wallets` — баланс в **USD cents** (bigint), `stars_balance`  
- `gg_ledger` — денежный журнал + `idempotency_key`  
- `gg_bets` — ставки/раунды игр  
- `gg_star_payments` / `gg_star_ledger` — Telegram Stars  
- `gg_presence` — онлайн (heartbeat)  
- `gg_casino_stats` — агрегаты  

RPC (только `service_role`):

- `gg_ensure_profile(...)` → uuid профиля + пустой wallet  
- `gg_heartbeat(profile_id, session_id, game_id?)`  

Views:

- `v_online_players_count` — SELECT для `anon`  
- `v_gg_player_public`  

Клиенты / типы:

- `gungad-casino/src/lib/supabase.ts`  
- `gungad-casino/src/types/database.ts`  
- `src/database/supabase.js` + `src/config/config.js` (`supabase.*`)  
- `@supabase/supabase-js` стоит в bot и webapp  

Хэндофф-кратко: `supabase/HANDOFF.txt`, `supabase/FOUNDATION.js`

### UI / продукт (уже в проде на Vercel)

- Игры: Crash, Roulette, Blackjack, CoinFlip, Dice, Mines, Plinko  
- Фикс Blackjack (выплата при bust дилера)  
- Фикс Roulette (стрелка = результат)  
- i18n ru/en/uk/kk + меню ☰ (звук / музыка / громкость)  
- Фоновая музыка + click.mp3  
- Картинки игр из `public/games/*.jpg`  
- Бот: только WebApp-кнопка «Открыть казино»  

### Legacy в том же Supabase (НЕ УДАЛЯТЬ)

Живые таблицы другого/старого бота: `users` (~4k строк), `withdrawals`, `promocodes`, …  
Пустые заготовки: `casino_balances`, `casino_games`, `casino_withdrawals`.  

Для GunGad использовать **`gg_*`**, линковать `gg_profiles.telegram_id` ↔ `users.user_id`.

---

## Что НУЖНО реализовать (порядок работ)

### 1. Auth Telegram Mini App → профиль

- На бэке (бот Express `/api` или Edge Function): проверить `initData` (HMAC по bot token).  
- Вызвать `gg_ensure_profile`.  
- Вернуть клиенту: `profile_id`, wallet (`balance_cents`, `stars_balance`), vip.  
- Опционально: custom JWT с `telegram_id` / `profile_id` для будущих RLS.

### 2. Деньги и ставки (критично)

- Заменить localStorage-баланс в `gungad-casino/src/App.tsx` на данные из `gg_wallets`.  
- RPC `gg_settle_bet` (или эквивалент) **атомарно**:
  - `SELECT … FOR UPDATE` wallet  
  - списание ставки / начисление выплаты  
  - запись `gg_bets` + `gg_ledger`  
  - `idempotency_key` обязателен  
- Деньги только в **центах** (bigint). Никаких float.  
- Все игры дергают один и тот же settle-путь (не доверять клиенту на итоговый баланс).

### 3. Онлайн-игроки

- Heartbeat ~каждые 30с через API → `gg_heartbeat`.  
- В UI читать `v_online_players_count` вместо фейкового `onlineCount`.  
- Чистить stale presence (cron / при heartbeat).

### 4. Telegram Stars

- Инвойс Stars с бота / WebApp.  
- На `successful_payment`: `gg_star_payments` → кредит `gg_wallets` + `gg_ledger` / `gg_star_ledger`.  
- Идемпотентность по `telegram_payment_charge_id`.

### 5. VIP / XP / история

- Уже есть поля `vip_level`, `vip_xp` и счётчики в wallet.  
- Начислять XP от `bet_cents`, обновлять ProfileModal из БД.  
- История ставок из `gg_bets`, не из локального state.

### 6. Безопасность

- **Legacy-таблицы без RLS** — критический риск; либо включить RLS+политики, либо убрать доступ anon.  
- `SERVICE_ROLE` только на сервере.  
- Анон-ключ не должен уметь менять баланс напрямую.

### 7. Деплой

- Env на Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.  
- Env бота: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_TOKEN`, `WEB_APP_URL`.  
- После логики — `vercel deploy --prod` для webapp + рестарт бота (pm2).

---

## Ограничения / не ломать

- Не дропать legacy `users` / withdrawals.  
- Не откатывать UI-фиксы игр без нужды.  
- Не класть service_role в Vite/`VITE_*`.  
- Не писать markdown-спам; код + миграции.  
- Языки: строки UI через `t()` в `gungad-casino/src/translations/index.ts`.

---

## Критерии готовности

1. Пользователь открывает WebApp из бота → профиль создаётся в `gg_profiles`.  
2. Ставка списывает/начисляет баланс в БД; после F5 баланс тот же.  
3. Онлайн считается по `gg_presence`.  
4. Stars (если включены) отражаются в wallet + ledger.  
5. Клиент не может накрутить баланс через DevTools.  

---

## Полезные файлы

```
supabase/migrations/20260802230000_gungad_foundation.sql
supabase/HANDOFF.txt
supabase/FOUNDATION.js
gungad-casino/src/lib/supabase.ts
gungad-casino/src/types/database.ts
gungad-casino/src/App.tsx
gungad-casino/src/components/games/*
src/database/supabase.js
src/bot/handlers/startHandler.js
src/config/config.js
OWNER_SETUP.txt   ← инструкция для владельца
```
