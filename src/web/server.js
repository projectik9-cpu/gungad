import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import authRouter from './api/auth.js';
import betRouter from './api/bet.js';
import heartbeatRouter from './api/heartbeat.js';
import walletRouter from './api/wallet.js';
import starsRouter, { setBot as setStarsBot } from './api/stars.js';
import depositCryptoBotRouter from './api/depositCryptoBot.js';
import depositTonRouter from './api/depositTon.js';
import withdrawRouter, { setWithdrawBot } from './api/withdraw.js';
import supportRouter, { setSupportBot } from './api/support.js';

export { setStarsBot, setWithdrawBot, setSupportBot };

const app = express();

// Middleware для безопасности
app.use(helmet({
  contentSecurityPolicy: false, // Отключаем для веб-приложения Telegram
}));

// CORS настройки
app.use(cors({
  origin: '*', // Для веб-приложения Telegram
  credentials: true,
}));

// Парсинг JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`📥 ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Главная страница (пока пустышка)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>GunGad Casino</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        
        .container {
          text-align: center;
          padding: 20px;
          max-width: 600px;
        }
        
        .logo {
          font-size: 72px;
          margin-bottom: 20px;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        
        h1 {
          font-size: 48px;
          margin-bottom: 20px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        p {
          font-size: 20px;
          margin-bottom: 30px;
          opacity: 0.9;
        }
        
        .features {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 30px;
          margin-top: 40px;
        }
        
        .feature {
          font-size: 24px;
          margin: 15px 0;
        }
        
        .status {
          margin-top: 40px;
          padding: 20px;
          background: rgba(0,0,0,0.2);
          border-radius: 10px;
        }
        
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          background: #4ade80;
          border-radius: 50%;
          margin-right: 10px;
          animation: blink 2s infinite;
        }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">🎰</div>
        <h1>GunGad Casino</h1>
        <p>Веб-приложение готовится к запуску</p>
        
        <div class="features">
          <div class="feature">🎮 Множество игр</div>
          <div class="feature">💰 Честная игра</div>
          <div class="feature">🎁 Щедрые бонусы</div>
          <div class="feature">⚡ Мгновенные выплаты</div>
        </div>
        
        <div class="status">
          <span class="status-indicator"></span>
          <span>Сервер работает</span>
        </div>
        
        <p style="margin-top: 30px; font-size: 16px; opacity: 0.7;">
          Откройте бота в Telegram для доступа ко всем функциям
        </p>
      </div>
      
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
      <script>
        // Инициализация Telegram Web App
        if (window.Telegram && window.Telegram.WebApp) {
          const tg = window.Telegram.WebApp;
          tg.expand();
          tg.ready();
          
          console.log('Telegram Web App initialized');
          console.log('User:', tg.initDataUnsafe.user);
        }
      </script>
    </body>
    </html>
  `);
});

// API Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// GunGad Casino API
app.use('/api/auth',      authRouter);
app.use('/api/bet',       betRouter);
app.use('/api/heartbeat', heartbeatRouter);
app.use('/api/wallet',    walletRouter);
app.use('/api/stars',     starsRouter);
app.use('/api/deposit/cryptobot', depositCryptoBotRouter);
app.use('/api/deposit/ton',       depositTonRouter);
app.use('/api/withdraw',  withdrawRouter);
app.use('/api/support',   supportRouter);

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error('Express Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

/**
 * Запуск веб-сервера
 */
export function startWebServer() {
  return new Promise((resolve, reject) => {
    try {
      // 0.0.0.0 — обязательно для Railway / Docker / VPS
      const server = app.listen(config.web.port, '0.0.0.0', () => {
        logger.info(`🌐 Веб-сервер запущен на 0.0.0.0:${config.web.port}`);
        logger.info(`🔗 URL: ${config.web.webAppUrl}`);
        resolve(server);
      });

      server.on('error', (error) => {
        logger.error('Ошибка запуска веб-сервера:', error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export default app;
