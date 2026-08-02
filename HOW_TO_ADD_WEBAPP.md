# 🌐 Как добавить своё веб-приложение

## 📋 Введение

Сейчас в боте есть кнопка "🎰 Открыть GunGad Casino", которая открывает заглушку на `http://localhost:3000`.

Этот гайд поможет интегрировать ваш реальный сайт казино с ботом.

---

## 🎯 Что нужно сделать

### Шаг 1: Подготовить ваш сайт

Ваше веб-приложение должно:

1. **Поддерживать Telegram Web App API**
   ```html
   <script src="https://telegram.org/js/telegram-web-app.js"></script>
   ```

2. **Инициализировать Telegram Web App**
   ```javascript
   const tg = window.Telegram.WebApp;
   tg.ready();
   tg.expand();
   ```

3. **Получать данные пользователя**
   ```javascript
   const user = tg.initDataUnsafe.user;
   console.log(user.id, user.username);
   ```

### Шаг 2: Интеграция с API бота

Ваш сайт будет общаться с ботом через API:

```javascript
// Получить данные пользователя
fetch('/api/user/me', {
  headers: {
    'Authorization': `tma ${tg.initData}`
  }
})
.then(res => res.json())
.then(data => {
  console.log('Balance:', data.data.balance);
});

// Сделать ставку в игре
fetch('/api/games/play', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `tma ${tg.initData}`
  },
  body: JSON.stringify({
    gameType: 'slot_machine',
    betAmount: 100
  })
})
.then(res => res.json())
.then(data => {
  console.log('Win:', data.data.winAmount);
  console.log('New balance:', data.data.balance);
});
```

---

## 📁 Где разместить ваш сайт

### Вариант 1: Статические файлы

Если у вас готовые HTML/CSS/JS файлы:

```
gungad-casino-bot/
├── src/
│   └── web/
│       ├── server.js
│       └── public/           ← Создайте эту папку
│           ├── index.html
│           ├── style.css
│           ├── script.js
│           └── assets/
│               ├── images/
│               └── sounds/
```

Затем в `src/web/server.js` добавьте:

```javascript
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Раздавать статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

### Вариант 2: Отдельный фронтенд проект (React/Vue/Angular)

Если у вас React, Vue или другой фреймворк:

1. Соберите production build:
   ```bash
   npm run build
   ```

2. Скопируйте папку `build` или `dist` в `src/web/public`

3. Настройте `server.js` как в Варианте 1

### Вариант 3: Отдельный сервер

Если ваш сайт на отдельном сервере (например, на другом домене):

1. Обновите `.env`:
   ```env
   WEB_APP_URL=https://your-casino-site.com
   ```

2. Настройте CORS на вашем сайте для API запросов к боту

3. В `src/web/server.js` настройте reverse proxy (опционально)

---

## 🔧 Примеры интеграции

### Пример 1: Простая HTML страница

Создайте `src/web/public/index.html`:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GunGad Casino</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    .balance {
      font-size: 32px;
      font-weight: bold;
      margin: 20px 0;
    }
    button {
      background: #4CAF50;
      border: none;
      color: white;
      padding: 15px 32px;
      font-size: 16px;
      cursor: pointer;
      border-radius: 8px;
      width: 100%;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎰 GunGad Casino</h1>
    <div id="user-info">Загрузка...</div>
    <div class="balance">
      Баланс: <span id="balance">0</span> монет
    </div>
    
    <button onclick="playSlots()">🎰 Играть в слоты (100 монет)</button>
    <button onclick="getDailyBonus()">🎁 Получить бонус</button>
    
    <div id="result"></div>
  </div>

  <script>
    // Инициализация Telegram Web App
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    const user = tg.initDataUnsafe.user;
    
    // Показать информацию о пользователе
    document.getElementById('user-info').innerHTML = 
      `Привет, ${user.first_name}! (ID: ${user.id})`;
    
    // Загрузить баланс
    loadBalance();
    
    async function loadBalance() {
      try {
        const res = await fetch('/api/user/balance', {
          headers: {
            'Authorization': `tma ${tg.initData}`
          }
        });
        const data = await res.json();
        
        if (data.success) {
          document.getElementById('balance').textContent = data.data.balance;
        }
      } catch (error) {
        console.error('Error loading balance:', error);
      }
    }
    
    async function playSlots() {
      const resultDiv = document.getElementById('result');
      resultDiv.innerHTML = '🎰 Крутим...';
      
      try {
        const res = await fetch('/api/games/play', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `tma ${tg.initData}`
          },
          body: JSON.stringify({
            gameType: 'slot_machine',
            betAmount: 100
          })
        });
        const data = await res.json();
        
        if (data.success) {
          const result = data.data;
          
          if (result.result === 'win') {
            resultDiv.innerHTML = `
              ✅ ВЫИГРЫШ!<br>
              Выиграно: ${result.winAmount} монет<br>
              Множитель: x${result.multiplier}
            `;
            tg.HapticFeedback.notificationOccurred('success');
          } else {
            resultDiv.innerHTML = `❌ Не повезло. Попробуйте ещё раз!`;
            tg.HapticFeedback.notificationOccurred('error');
          }
          
          // Обновить баланс
          document.getElementById('balance').textContent = result.balance;
        } else {
          resultDiv.innerHTML = `❌ Ошибка: ${data.error.message}`;
        }
      } catch (error) {
        resultDiv.innerHTML = `❌ Ошибка подключения`;
        console.error('Error:', error);
      }
    }
    
    async function getDailyBonus() {
      const resultDiv = document.getElementById('result');
      
      try {
        const res = await fetch('/api/bonus/daily/claim', {
          method: 'POST',
          headers: {
            'Authorization': `tma ${tg.initData}`
          }
        });
        const data = await res.json();
        
        if (data.success) {
          resultDiv.innerHTML = `
            🎁 Бонус получен!<br>
            +${data.data.amount} монет
          `;
          document.getElementById('balance').textContent = data.data.newBalance;
          tg.HapticFeedback.notificationOccurred('success');
        } else {
          resultDiv.innerHTML = `❌ ${data.error.message}`;
        }
      } catch (error) {
        resultDiv.innerHTML = `❌ Ошибка подключения`;
        console.error('Error:', error);
      }
    }
  </script>
</body>
</html>
```

### Пример 2: React компонент

```javascript
import { useEffect, useState } from 'react';

function Casino() {
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState(null);
  const [result, setResult] = useState('');
  
  useEffect(() => {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    setUser(tg.initDataUnsafe.user);
    loadBalance();
  }, []);
  
  const loadBalance = async () => {
    const tg = window.Telegram.WebApp;
    const res = await fetch('/api/user/balance', {
      headers: {
        'Authorization': `tma ${tg.initData}`
      }
    });
    const data = await res.json();
    setBalance(data.data.balance);
  };
  
  const playGame = async (gameType, bet) => {
    const tg = window.Telegram.WebApp;
    setResult('Загрузка...');
    
    const res = await fetch('/api/games/play', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `tma ${tg.initData}`
      },
      body: JSON.stringify({ gameType, betAmount: bet })
    });
    
    const data = await res.json();
    
    if (data.success) {
      setBalance(data.data.balance);
      
      if (data.data.result === 'win') {
        setResult(`Выигрыш: ${data.data.winAmount} монет!`);
        tg.HapticFeedback.notificationOccurred('success');
      } else {
        setResult('Не повезло!');
        tg.HapticFeedback.notificationOccurred('error');
      }
    }
  };
  
  return (
    <div className="casino">
      <h1>GunGad Casino</h1>
      {user && <p>Привет, {user.first_name}!</p>}
      <div className="balance">Баланс: {balance} монет</div>
      
      <button onClick={() => playGame('slot_machine', 100)}>
        🎰 Слоты (100)
      </button>
      
      <button onClick={() => playGame('roulette', 50)}>
        🎡 Рулетка (50)
      </button>
      
      {result && <div className="result">{result}</div>}
    </div>
  );
}

export default Casino;
```

---

## 🔗 API Endpoints

Документация всех доступных API в [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

### Основные endpoints:

```
GET  /api/user/me              - Информация о пользователе
GET  /api/user/balance         - Баланс пользователя
POST /api/games/play           - Сделать ставку в игре
GET  /api/games/history        - История игр
POST /api/bonus/daily/claim    - Получить ежедневный бонус
GET  /api/referral/info        - Информация о рефералах
```

---

## 🚀 Деплой веб-приложения

### Production настройки:

1. **Обновите URL в .env:**
   ```env
   WEB_APP_URL=https://your-domain.com
   NODE_ENV=production
   ```

2. **Используйте HTTPS:**
   - Telegram Web App требует HTTPS
   - Используйте nginx с SSL сертификатом
   - Или используйте Cloudflare

3. **Настройте домен:**
   ```nginx
   server {
     listen 443 ssl;
     server_name your-domain.com;
     
     ssl_certificate /path/to/cert.pem;
     ssl_certificate_key /path/to/key.pem;
     
     location / {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

---

## 📝 Чеклист интеграции

- [ ] Веб-приложение поддерживает Telegram Web App API
- [ ] Добавлен скрипт `telegram-web-app.js`
- [ ] Инициализация `tg.ready()` и `tg.expand()`
- [ ] API запросы работают с заголовком Authorization
- [ ] Обработка ошибок API
- [ ] Обновление баланса после игры
- [ ] Тестирование на мобильном устройстве
- [ ] HTTPS настроен (для продакшн)
- [ ] URL обновлён в .env

---

## 💡 Полезные советы

### 1. Тестирование локально

Telegram Web App можно тестировать локально через ngrok:

```bash
# Установите ngrok
npm install -g ngrok

# Запустите туннель
ngrok http 3000

# Используйте https URL от ngrok в настройках бота
```

### 2. Отладка

```javascript
// Включите отладку в консоли
window.Telegram.WebApp.isVersionAtLeast('6.0');
console.log('Init data:', window.Telegram.WebApp.initData);
console.log('User:', window.Telegram.WebApp.initDataUnsafe.user);
```

### 3. Тестирование без Telegram

Для разработки можно мокать данные:

```javascript
const tg = window.Telegram?.WebApp || {
  ready: () => {},
  expand: () => {},
  initData: 'mock_data',
  initDataUnsafe: {
    user: {
      id: 123456789,
      first_name: 'Test',
      username: 'testuser'
    }
  }
};
```

---

## 🎁 Готовый шаблон

Я подготовил готовый шаблон в `src/web/server.js` (строка ~40).

Просто замените содержимое функции `app.get('/', ...)` на ваш код!

---

## 📞 Нужна помощь?

Пришлите мне:
1. Ваш сайт (код или ссылку)
2. Какие игры хотите добавить
3. Какие вопросы возникли

Я помогу всё интегрировать! 🚀
