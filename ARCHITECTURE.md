# 🏗️ Архитектура GunGad Casino Bot

## Обзор

GunGad Casino Bot - это комплексное решение, состоящее из:
- Telegram бота для взаимодействия с пользователями
- Веб-приложения для полноценного казино интерфейса
- REST API для связи между компонентами
- База данных для хранения данных пользователей и игр

## Технологический стек

### Backend
- **Node.js** (v18+) - runtime окружение
- **Telegraf** - фреймворк для Telegram ботов
- **Express** - веб-сервер и API
- **Sequelize** - ORM для работы с базой данных
- **PostgreSQL** - реляционная база данных
- **Redis** (опционально) - кэширование и сессии

### Дополнительные библиотеки
- **dotenv** - управление переменными окружения
- **winston** - логирование
- **joi** - валидация данных
- **helmet** - безопасность HTTP
- **cors** - CORS политики

## Структура проекта

```
gungad-casino-bot/
├── src/                          # Исходный код
│   ├── bot/                      # Telegram бот
│   │   ├── handlers/             # Обработчики команд
│   │   │   ├── startHandler.js
│   │   │   ├── balanceHandler.js
│   │   │   ├── profileHandler.js
│   │   │   ├── bonusHandler.js
│   │   │   ├── referralHandler.js
│   │   │   ├── gamesHandler.js
│   │   │   ├── helpHandler.js
│   │   │   └── index.js
│   │   ├── bot.js                # Инициализация бота
│   │   ├── keyboards.js          # Клавиатуры
│   │   └── messages.js           # Шаблоны сообщений
│   │
│   ├── database/                 # База данных
│   │   ├── models/               # Модели данных
│   │   │   ├── User.js
│   │   │   ├── Transaction.js
│   │   │   ├── GameSession.js
│   │   │   └── index.js
│   │   ├── database.js           # Подключение к БД
│   │   ├── migrate.js            # Миграция
│   │   └── seed.js               # Тестовые данные
│   │
│   ├── services/                 # Бизнес-логика
│   │   ├── userService.js        # Работа с пользователями
│   │   ├── gameService.js        # Игровая логика
│   │   └── statsService.js       # Статистика
│   │
│   ├── web/                      # Веб-сервер
│   │   └── server.js             # Express сервер + API
│   │
│   ├── utils/                    # Утилиты
│   │   ├── logger.js             # Логирование
│   │   ├── validators.js         # Валидация
│   │   └── helpers.js            # Вспомогательные функции
│   │
│   ├── config/                   # Конфигурация
│   │   └── config.js             # Настройки приложения
│   │
│   └── index.js                  # Точка входа
│
├── logs/                         # Логи (генерируется)
│   ├── bot.log
│   └── error.log
│
├── .env                          # Переменные окружения
├── .gitignore
├── package.json
├── README.md
├── INSTALL.md
├── QUICK_START.md
├── API_DOCUMENTATION.md
└── ARCHITECTURE.md (этот файл)
```

## Архитектурные слои

### 1. Presentation Layer (Слой представления)

**Telegram Bot Interface**
- Обработка команд пользователей
- Отображение меню и кнопок
- Отправка сообщений и уведомлений

**Web App Interface**
- HTML/CSS/JS интерфейс
- Telegram Web App Integration
- Реальное время обновления UI

### 2. Business Logic Layer (Бизнес-логика)

**Services**
- `userService.js` - управление пользователями
  - Регистрация и аутентификация
  - Управление балансом
  - Реферальная система
  - Ежедневные бонусы

- `gameService.js` - игровая механика
  - Валидация ставок
  - Логика игр
  - Расчёт выигрышей
  - История игр

- `statsService.js` - статистика
  - Общая статистика платформы
  - Статистика игр
  - Топ игроков
  - Аналитика

### 3. Data Access Layer (Слой данных)

**Models**
- `User` - пользователи
- `Transaction` - транзакции
- `GameSession` - игровые сессии

**Database**
- PostgreSQL для хранения данных
- Sequelize ORM для работы с БД
- Миграции для версионирования схемы

### 4. Integration Layer (Слой интеграции)

**APIs**
- REST API для веб-приложения
- Telegram Bot API
- Будущие интеграции (платежи, игры)

## Основные компоненты

### 1. Telegram Bot (`src/bot/`)

```
Пользователь -> Telegram -> Bot -> Handler -> Service -> Database
                                        ↓
                                    Response -> Telegram -> Пользователь
```

**Обязанности:**
- Приём и обработка команд
- Управление состоянием диалога
- Отправка уведомлений
- Интеграция с веб-приложением

### 2. Web Server (`src/web/`)

```
Web App -> HTTP Request -> Express -> Middleware -> Controller -> Service -> Database
                                                                       ↓
                                           HTTP Response <- JSON Response
```

**Обязанности:**
- Обслуживание веб-приложения
- REST API endpoints
- Аутентификация через Telegram Web App
- Безопасность (CORS, Helmet)

### 3. Database (`src/database/`)

```
┌─────────────┐
│    Users    │
├─────────────┤
│ id          │←───┐
│ telegram_id │    │
│ balance     │    │
│ referrer_id │────┘
└─────────────┘
       ↓
┌─────────────────┐
│  Transactions   │
├─────────────────┤
│ id              │
│ user_id         │──→ Users
│ type            │
│ amount          │
└─────────────────┘
       ↓
┌─────────────────┐
│  GameSessions   │
├─────────────────┤
│ id              │
│ user_id         │──→ Users
│ game_type       │
│ bet_amount      │
│ win_amount      │
└─────────────────┘
```

### 4. Services (`src/services/`)

**userService:**
- `getOrCreateUser()` - получить или создать пользователя
- `updateBalance()` - обновить баланс
- `claimDailyBonus()` - получить ежедневный бонус
- `handleReferral()` - обработать реферала

**gameService:**
- `canPlaceBet()` - проверить возможность ставки
- `createGameSession()` - создать игровую сессию
- `getGameHistory()` - получить историю игр

**statsService:**
- `getOverallStats()` - общая статистика
- `getTopPlayers()` - топ игроков
- `getRecentWins()` - последние выигрыши

## Поток данных

### Регистрация пользователя

```
1. Пользователь отправляет /start в Telegram
2. Bot получает сообщение
3. startHandler обрабатывает команду
4. userService.getOrCreateUser() проверяет пользователя в БД
5. Если новый - создаётся запись с начальным балансом
6. Если есть реферальный код - обрабатывается реферал
7. Отправляется приветственное сообщение
```

### Игровая сессия

```
1. Пользователь делает ставку в веб-приложении
2. POST /api/games/play с данными ставки
3. Проверка баланса и валидация ставки
4. gameService.createGameSession()
   - Списание ставки
   - Запуск игровой логики
   - Расчёт выигрыша
   - Начисление выигрыша
   - Обновление статистики
5. Создание записи в GameSession и Transaction
6. Возврат результата игры
7. Обновление UI
```

### Ежедневный бонус

```
1. Пользователь запрашивает бонус (/bonus)
2. userService.checkDailyBonus() проверяет доступность
3. Если доступен:
   - userService.claimDailyBonus()
   - Добавление бонуса к балансу
   - Создание транзакции
   - Обновление last_daily_bonus
4. Отправка сообщения с результатом
```

## Безопасность

### Аутентификация
- Telegram Bot API автоматически аутентифицирует пользователей
- Web App использует Telegram initData для верификации
- JWT токены для API (будущее)

### Валидация
- Joi схемы для валидации входных данных
- Проверка сумм ставок (min/max)
- Проверка баланса перед операциями
- SQL injection защита через Sequelize

### Авторизация
- Проверка блокировки пользователя
- Роли администраторов (ADMIN_IDS в .env)
- Rate limiting для API запросов

## Масштабирование

### Горизонтальное масштабирование
- Multiple bot instances за load balancer
- Redis для shared state между инстансами
- Database connection pooling

### Вертикальное масштабирование
- Увеличение ресурсов сервера
- Оптимизация запросов к БД
- Кэширование часто используемых данных

### Кэширование
```
┌──────────┐      ┌───────┐      ┌──────────┐
│   Bot    │─────→│ Redis │─────→│ Database │
└──────────┘      └───────┘      └──────────┘
                     Cache          Persistent
```

- User profiles в Redis
- Game configurations
- Leaderboards
- Active sessions

## Мониторинг и логирование

### Логи
```
logs/
├── bot.log       # Все события
└── error.log     # Только ошибки
```

### Метрики (будущее)
- Количество активных пользователей
- Количество игр в минуту
- Среднее время ответа API
- Ошибки и исключения

### Alerting (будущее)
- Уведомления при критических ошибках
- Мониторинг состояния сервисов
- Алерты при превышении лимитов

## Deployment

### Development
```bash
npm run dev  # Nodemon для auto-reload
```

### Production
```bash
npm start    # Node.js напрямую
```

### Process Manager (рекомендуется)
```bash
pm2 start src/index.js --name gungad-casino
pm2 save
pm2 startup
```

### Docker (будущее)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "src/index.js"]
```

## Будущие улучшения

### Технические
- [ ] WebSocket для real-time обновлений
- [ ] GraphQL API
- [ ] Микросервисная архитектура
- [ ] Event-driven architecture
- [ ] Message queue (RabbitMQ/Kafka)

### Функциональные
- [ ] Больше игр
- [ ] Платёжная система
- [ ] Турниры и соревнования
- [ ] Система достижений
- [ ] VIP статусы
- [ ] Мультиязычность
- [ ] Мобильное приложение

### DevOps
- [ ] CI/CD pipeline
- [ ] Automated testing
- [ ] Container orchestration (Kubernetes)
- [ ] Infrastructure as Code (Terraform)
- [ ] APM (Application Performance Monitoring)

## Контакты и поддержка

При вопросах по архитектуре или необходимости расширения функционала - обращайтесь!
