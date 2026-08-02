# 📝 Полезные команды GunGad Casino Bot

## 🚀 Запуск

### Режим разработки (с автоперезагрузкой)
```bash
npm run dev
```

### Режим продакшн
```bash
npm start
```

### С помощью PM2 (рекомендуется для продакшн)
```bash
# Установка PM2 (один раз)
npm install -g pm2

# Запуск
pm2 start ecosystem.config.cjs

# Посмотреть статус
pm2 status

# Посмотреть логи
pm2 logs gungad-casino-bot

# Перезапуск
pm2 restart gungad-casino-bot

# Остановка
pm2 stop gungad-casino-bot

# Удаление из PM2
pm2 delete gungad-casino-bot

# Сохранить конфигурацию для автозапуска
pm2 save
pm2 startup
```

## 📦 Установка и обновление

### Установка зависимостей
```bash
npm install
```

### Обновление зависимостей
```bash
npm update
```

### Проверка устаревших пакетов
```bash
npm outdated
```

### Чистая переустановка
```bash
rm -rf node_modules package-lock.json
npm install
```

## 🗄️ База данных

### Миграция (создание таблиц)
```bash
npm run db:migrate
```

### Заполнение тестовыми данными
```bash
npm run db:seed
```

### Подключение к PostgreSQL
```bash
# Windows
psql -U postgres

# Linux/Mac
sudo -u postgres psql
```

### Создание базы данных
```sql
CREATE DATABASE gungad_casino;
\l  -- список баз данных
\c gungad_casino  -- подключение к базе
\dt  -- список таблиц
\q  -- выход
```

### Удаление базы данных (ОСТОРОЖНО!)
```sql
DROP DATABASE gungad_casino;
```

### Бэкап базы данных
```bash
# Создать бэкап
pg_dump -U postgres gungad_casino > backup.sql

# Восстановить из бэкапа
psql -U postgres gungad_casino < backup.sql
```

## 📊 Логи

### Просмотр логов

#### Windows
```cmd
# Все логи
type logs\bot.log

# Только ошибки
type logs\error.log

# Последние N строк
powershell Get-Content logs\bot.log -Tail 50
```

#### Linux/Mac
```bash
# Все логи
cat logs/bot.log

# Только ошибки
cat logs/error.log

# Последние N строк
tail -n 50 logs/bot.log

# В реальном времени
tail -f logs/bot.log

# Поиск по логам
grep "ERROR" logs/bot.log
grep "User" logs/bot.log
```

### Очистка логов
```bash
# Windows
del logs\*.log

# Linux/Mac
rm logs/*.log
```

## 🧪 Тестирование и отладка

### Проверка синтаксиса
```bash
npm run lint
```

### Автоматическое исправление
```bash
npm run lint -- --fix
```

### Форматирование кода
```bash
npm run format
```

### Проверка типов (если добавите TypeScript)
```bash
npm run type-check
```

## 🔍 Мониторинг

### Проверка процессов Node.js
```bash
# Windows
tasklist | findstr node

# Linux/Mac
ps aux | grep node
```

### Проверка использования портов
```bash
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000
netstat -tuln | grep 3000
```

### Убить процесс на порту
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti :3000 | xargs kill -9
```

## 🔧 Обслуживание

### Проверка версий
```bash
node --version
npm --version
git --version
```

### Очистка кэша npm
```bash
npm cache clean --force
```

### Проверка состояния
```bash
npm doctor
```

### Аудит безопасности
```bash
npm audit
npm audit fix
```

## 📝 Git команды

### Инициализация репозитория
```bash
git init
git add .
git commit -m "Initial commit"
```

### Добавление remote
```bash
git remote add origin <repository-url>
git push -u origin main
```

### Обновление
```bash
git add .
git commit -m "Update description"
git push
```

### Создание ветки
```bash
git checkout -b feature/new-feature
git push -u origin feature/new-feature
```

### Просмотр изменений
```bash
git status
git diff
git log
```

## 🌐 Веб-сервер

### Проверка работы веб-сервера
```bash
curl http://localhost:3000
curl http://localhost:3000/api/health
```

### Открыть в браузере
```bash
# Windows
start http://localhost:3000

# Linux
xdg-open http://localhost:3000

# Mac
open http://localhost:3000
```

## 🔐 Безопасность

### Генерация JWT секрета
```bash
# Linux/Mac
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Проверка переменных окружения
```bash
# Windows
type .env

# Linux/Mac
cat .env
```

## 🐳 Docker (если используете)

### Сборка образа
```bash
docker build -t gungad-casino-bot .
```

### Запуск контейнера
```bash
docker run -d --name gungad-bot -p 3000:3000 --env-file .env gungad-casino-bot
```

### Просмотр логов
```bash
docker logs -f gungad-bot
```

### Остановка и удаление
```bash
docker stop gungad-bot
docker rm gungad-bot
```

### Docker Compose
```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## 📱 Telegram Bot API

### Проверка токена бота
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe
```

### Получить обновления
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

### Установить вебхук
```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'
```

### Удалить вебхук
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook
```

## 🔄 Обновление проекта

### Получить последнюю версию
```bash
git pull origin main
npm install
npm run db:migrate
npm start
```

### Откат к предыдущей версии
```bash
git log  # найти нужный commit
git checkout <commit-hash>
```

## 📊 Статистика проекта

### Подсчёт строк кода
```bash
# Linux/Mac
find src -name '*.js' | xargs wc -l

# Windows (PowerShell)
(Get-ChildItem -Path src -Filter *.js -Recurse | Get-Content | Measure-Object -Line).Lines
```

### Размер проекта
```bash
# Linux/Mac
du -sh .

# Windows
dir /s
```

## 🎯 Быстрые команды

### Полный рестарт
```bash
# Остановить (Ctrl+C)
rm -rf node_modules package-lock.json
npm install
npm start
```

### Проверка всего
```bash
npm run lint
npm audit
npm outdated
npm test
```

## 💡 Полезные алиасы (опционально)

Добавьте в `package.json` → `scripts`:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "db:migrate": "node src/database/migrate.js",
    "db:seed": "node src/database/seed.js",
    "logs": "tail -f logs/bot.log",
    "logs:error": "tail -f logs/error.log",
    "lint": "eslint src/**/*.js",
    "lint:fix": "eslint src/**/*.js --fix",
    "format": "prettier --write src/**/*.js",
    "clean": "rm -rf node_modules package-lock.json logs/*.log",
    "restart": "npm run clean && npm install && npm start"
  }
}
```

Тогда можно будет использовать:
```bash
npm run logs
npm run logs:error
npm run lint:fix
npm run clean
npm run restart
```

## 🆘 Устранение проблем

### Бот не запускается
```bash
# Проверить Node.js
node --version

# Проверить зависимости
npm install

# Проверить .env
cat .env

# Посмотреть логи
cat logs/error.log
```

### Ошибка базы данных
```bash
# Проверить PostgreSQL
pg_isready

# Проверить подключение
psql -U postgres -c "SELECT 1"

# Пересоздать таблицы
npm run db:migrate
```

### Порт занят
```bash
# Найти процесс
lsof -i :3000

# Убить процесс
kill -9 <PID>
```

## 📞 Контакты

При проблемах с командами - обращайтесь! 💬
