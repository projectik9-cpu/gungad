import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  // Telegram Bot
  telegram: {
    botToken: process.env.BOT_TOKEN,
    webhookDomain: process.env.WEBHOOK_DOMAIN || '',
    useWebhook: process.env.USE_WEBHOOK === 'true',
  },

  // Database (legacy Sequelize — keep until fully migrated)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'gungad_casino',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  },

  // Supabase (primary for GunGad gg_* tables)
  supabase: {
    url: process.env.SUPABASE_URL || 'https://nndebjrieyxqjnwkslhn.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: 0,
  },

  // Web Server
  web: {
    port: parseInt(process.env.PORT) || 3000,
    webAppUrl: process.env.WEB_APP_URL || 'http://localhost:3000',
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'change_this_secret_in_production',
    encryptionKey: process.env.ENCRYPTION_KEY || 'change_this_key_32_chars_minimum',
    jwtExpiration: '7d',
  },

  // Admin
  admin: {
    ids: (process.env.ADMIN_IDS || '').split(',').filter(id => id).map(id => parseInt(id)),
  },

  // Payment
  payment: {
    providerToken: process.env.PAYMENT_PROVIDER_TOKEN || '',
    merchantId: process.env.PAYMENT_MERCHANT_ID || '',
  },

  // Application
  app: {
    name: 'GunGad Casino',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    logFilePath: process.env.LOG_FILE_PATH || './logs/bot.log',
  },

  // Game Settings
  game: {
    startingBalance: 1000,
    dailyBonusAmount: 100,
    dailyBonusInterval: 24 * 60 * 60 * 1000, // 24 часа в миллисекундах
    referralBonus: 500,
    referralReward: 250,
    minBet: 10,
    maxBet: 10000,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 минут
    maxRequests: 100,
  },
};

// Валидация критических настроек
if (!config.telegram.botToken) {
  throw new Error('BOT_TOKEN is required in .env file');
}

export default config;
