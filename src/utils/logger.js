import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаём директорию для логов если её нет
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Формат логов
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

// Цветной формат для консоли
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Создаём логгер
const logger = winston.createLogger({
  level: config.app.logLevel,
  format: logFormat,
  transports: [
    // Запись в файл для всех логов
    new winston.transports.File({
      filename: path.join(logsDir, 'bot.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // Отдельный файл для ошибок
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

// В режиме разработки выводим в консоль
if (config.app.environment === 'development') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Вспомогательные методы
logger.logBotStart = () => {
  logger.info('='.repeat(50));
  logger.info(`🎰 GunGad Casino Bot запущен`);
  logger.info(`🌍 Окружение: ${config.app.environment}`);
  logger.info(`🤖 Telegram Bot активен`);
  logger.info(`🌐 Web сервер: ${config.web.webAppUrl}`);
  logger.info('='.repeat(50));
};

logger.logUserAction = (userId, username, action) => {
  logger.info(`👤 Пользователь ${userId} (@${username || 'unknown'}) -> ${action}`);
};

logger.logError = (error, context = '') => {
  logger.error(`❌ Ошибка${context ? ` [${context}]` : ''}: ${error.message}`, {
    stack: error.stack,
  });
};

logger.logGameAction = (userId, game, bet, result) => {
  logger.info(`🎮 Игра: ${game} | Пользователь: ${userId} | Ставка: ${bet} | Результат: ${result}`);
};

logger.logTransaction = (userId, type, amount) => {
  logger.info(`💰 Транзакция: ${type} | Пользователь: ${userId} | Сумма: ${amount}`);
};

export default logger;
