# 📡 API Документация GunGad Casino

## Базовый URL

```
http://localhost:3000/api
```

## Аутентификация

Все API запросы от веб-приложения должны включать Telegram Web App initData для аутентификации.

```javascript
// Пример получения initData в веб-приложении
const initData = window.Telegram.WebApp.initData;

// Отправка запроса с аутентификацией
fetch('/api/user/me', {
  headers: {
    'Authorization': `tma ${initData}`
  }
});
```

## Endpoints

### 🏥 Health Check

Проверка работоспособности API.

```http
GET /api/health
```

**Ответ:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 12345.67
}
```

---

### 👤 Пользователь

#### Получить информацию о текущем пользователе

```http
GET /api/user/me
```

**Headers:**
- `Authorization: tma {initData}`

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "telegram_id": 123456789,
    "username": "username",
    "first_name": "John",
    "balance": 1000.00,
    "level": 5,
    "experience": 5000,
    "total_games_played": 100,
    "total_wins": 60,
    "total_losses": 40,
    "created_at": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Получить баланс

```http
GET /api/user/balance
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "balance": 1000.00,
    "currency": "coins"
  }
}
```

#### Получить статистику

```http
GET /api/user/stats
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": 1,
      "telegram_id": 123456789,
      "username": "username",
      "balance": 1000.00,
      "level": 5,
      "experience": 5000
    },
    "stats": {
      "winRate": "60.00",
      "totalGamesPlayed": 100,
      "totalWins": 60,
      "totalLosses": 40,
      "totalBetAmount": 10000.00,
      "totalWinAmount": 12000.00,
      "referralCount": 5,
      "referralEarnings": 1250.00
    }
  }
}
```

---

### 🎮 Игры

#### Получить список доступных игр

```http
GET /api/games
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": "slot_machine",
      "name": "Слоты",
      "icon": "🎰",
      "minBet": 10,
      "maxBet": 10000,
      "available": true
    },
    {
      "id": "roulette",
      "name": "Рулетка",
      "icon": "🎡",
      "minBet": 10,
      "maxBet": 10000,
      "available": true
    }
  ]
}
```

#### Сделать ставку

```http
POST /api/games/play
```

**Body:**
```json
{
  "gameType": "slot_machine",
  "betAmount": 100
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "result": "win",
    "winAmount": 250.00,
    "multiplier": 2.5,
    "balance": 1150.00,
    "gameData": {
      "symbols": ["🍒", "🍒", "🍒"]
    }
  }
}
```

#### Получить историю игр

```http
GET /api/games/history?limit=20&offset=0
```

**Параметры:**
- `limit` (optional) - количество записей (по умолчанию: 20)
- `offset` (optional) - смещение (по умолчанию: 0)

**Ответ:**
```json
{
  "success": true,
  "data": {
    "games": [
      {
        "id": 1,
        "game_type": "slot_machine",
        "bet_amount": 100.00,
        "win_amount": 250.00,
        "multiplier": 2.5,
        "result": "win",
        "created_at": "2024-01-01T12:00:00.000Z"
      }
    ],
    "total": 100,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 💰 Транзакции

#### Получить историю транзакций

```http
GET /api/transactions?limit=20&offset=0
```

**Параметры:**
- `limit` (optional) - количество записей (по умолчанию: 20)
- `offset` (optional) - смещение (по умолчанию: 0)
- `type` (optional) - фильтр по типу транзакции

**Ответ:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": 1,
        "type": "win",
        "amount": 250.00,
        "balance_before": 900.00,
        "balance_after": 1150.00,
        "description": "Выигрыш в игре slot_machine",
        "created_at": "2024-01-01T12:00:00.000Z"
      }
    ],
    "total": 50,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 🎁 Бонусы

#### Проверить доступность ежедневного бонуса

```http
GET /api/bonus/daily/check
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "canClaim": true,
    "amount": 100,
    "nextAvailableAt": null
  }
}
```

или

```json
{
  "success": true,
  "data": {
    "canClaim": false,
    "amount": 100,
    "nextAvailableAt": "2024-01-02T12:00:00.000Z",
    "timeLeft": 43200000
  }
}
```

#### Получить ежедневный бонус

```http
POST /api/bonus/daily/claim
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "amount": 100,
    "newBalance": 1100.00,
    "nextAvailableAt": "2024-01-02T12:00:00.000Z"
  }
}
```

---

### 👥 Рефералы

#### Получить реферальную информацию

```http
GET /api/referral/info
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "referralLink": "https://t.me/your_bot?start=ref123",
    "referralCount": 5,
    "referralEarnings": 1250.00,
    "bonusForNew": 500,
    "rewardForReferrer": 250
  }
}
```

#### Получить список рефералов

```http
GET /api/referral/list
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "referrals": [
      {
        "id": 2,
        "telegram_id": 987654321,
        "username": "friend1",
        "created_at": "2024-01-01T12:00:00.000Z"
      }
    ],
    "total": 5
  }
}
```

---

### 📊 Статистика

#### Получить топ игроков

```http
GET /api/stats/top?limit=10&orderBy=balance
```

**Параметры:**
- `limit` (optional) - количество записей (по умолчанию: 10)
- `orderBy` (optional) - сортировка: balance, total_wins, level (по умолчанию: balance)

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "telegram_id": 123456789,
      "username": "player1",
      "first_name": "John",
      "balance": 50000.00,
      "level": 10,
      "total_games_played": 500,
      "total_wins": 300
    }
  ]
}
```

#### Получить последние выигрыши

```http
GET /api/stats/recent-wins?limit=10&minAmount=100
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "game_type": "slot_machine",
      "bet_amount": 100.00,
      "win_amount": 500.00,
      "multiplier": 5.0,
      "user": {
        "telegram_id": 123456789,
        "username": "player1",
        "first_name": "John"
      },
      "created_at": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

---

## Коды ошибок

### HTTP статусы

- `200` - Успешно
- `400` - Неверный запрос
- `401` - Не авторизован
- `403` - Доступ запрещён
- `404` - Не найдено
- `500` - Внутренняя ошибка сервера

### Формат ошибки

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Недостаточно средств на балансе",
    "details": {
      "required": 100,
      "available": 50
    }
  }
}
```

### Коды ошибок

- `INVALID_REQUEST` - Неверный запрос
- `UNAUTHORIZED` - Не авторизован
- `USER_NOT_FOUND` - Пользователь не найден
- `INSUFFICIENT_BALANCE` - Недостаточно средств
- `INVALID_BET_AMOUNT` - Неверная сумма ставки
- `GAME_NOT_AVAILABLE` - Игра недоступна
- `BONUS_ALREADY_CLAIMED` - Бонус уже получен
- `USER_BLOCKED` - Пользователь заблокирован
- `INTERNAL_ERROR` - Внутренняя ошибка

---

## Примеры использования

### JavaScript (Fetch API)

```javascript
// Получение данных пользователя
async function getUserData() {
  const initData = window.Telegram.WebApp.initData;
  
  try {
    const response = await fetch('/api/user/me', {
      headers: {
        'Authorization': `tma ${initData}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('User:', data.data);
    } else {
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

// Сделать ставку
async function placeBet(gameType, betAmount) {
  const initData = window.Telegram.WebApp.initData;
  
  try {
    const response = await fetch('/api/games/play', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `tma ${initData}`
      },
      body: JSON.stringify({
        gameType,
        betAmount
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Game result:', data.data);
      return data.data;
    } else {
      console.error('Error:', data.error);
      throw new Error(data.error.message);
    }
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}
```

### Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Authorization': `tma ${window.Telegram.WebApp.initData}`
  }
});

// Получить баланс
const getBalance = async () => {
  const { data } = await api.get('/user/balance');
  return data.data.balance;
};

// Сделать ставку
const placeBet = async (gameType, betAmount) => {
  const { data } = await api.post('/games/play', {
    gameType,
    betAmount
  });
  return data.data;
};
```

---

## WebSocket (будущее)

Для real-time обновлений планируется добавить WebSocket поддержку:

```javascript
const socket = new WebSocket('ws://localhost:3000/ws');

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'balance_update':
      updateBalance(data.balance);
      break;
    case 'game_result':
      showGameResult(data.result);
      break;
  }
};
```

---

## Примечания

- Все суммы указаны в монетах (coins)
- Все даты в формате ISO 8601
- API поддерживает JSON
- Для production рекомендуется использовать HTTPS
