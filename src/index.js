import bot from './bot/bot.js';
import { registerHandlers } from './bot/handlers/index.js';
import { startWebServer, setStarsBot, setWithdrawBot, setSupportBot } from './web/server.js';
import { startTonMonitor } from './services/tonMonitor.js';
import { startCryptoBotReconcile } from './services/cryptoBotReconcile.js';
import { setLogBot } from './services/telegramLog.js';
import { maybeAnnounceCommandsOnline } from './bot/handlers/logAdminHandler.js';
import { testConnection, syncDatabase } from './database/database.js';
import logger from './utils/logger.js';
import config from './config/config.js';

/**
 * Инициализация и запуск приложения
 */
async function startApplication() {
  try {
    logger.info('🚀 Запуск GunGad Casino Bot...');

    // 1. Проверка подключения к БД
    logger.info('📊 Подключение к базе данных...');
    const dbConnected = await testConnection();

    if (dbConnected) {
      // 2. Синхронизация моделей БД
      logger.info('🔄 Синхронизация базы данных...');
      await syncDatabase(false); // false = не удалять существующие таблицы
      logger.info('✅ База данных готова');
    } else {
      logger.warn('⚠️  База данных недоступна, бот будет работать без БД (некоторые функции могут быть недоступны)');
    }

    // 3. Регистрация обработчиков команд бота
    logger.info('🤖 Регистрация обработчиков команд...');
    registerHandlers(bot);

    // 4. Запуск веб-сервера
    logger.info('🌐 Запуск веб-сервера...');
    await startWebServer();

    // 5. Инжектируем бота в API (Stars, выводы, поддержка)
    setStarsBot(bot);
    setWithdrawBot(bot);
    setSupportBot(bot);
    setLogBot(bot);

    // 5.1 TON-монитор депозитов (memo scheme)
    startTonMonitor();
    // 5.2 Crypto Bot — поллинг оплаченных инвойсов (вебхук может быть выключен)
    startCryptoBotReconcile();

    // 5. Запуск Telegram бота
    logger.info('🤖 Запуск Telegram бота...');

    // Меню: кнопка WebApp «Казино» (даёт initData в Mini App)
    await bot.telegram.deleteMyCommands();
    try {
      await bot.telegram.setMyCommands(
        [
          { command: 'help', description: 'Список admin-команд' },
          { command: 'user', description: 'Досье игрока' },
          { command: 'stats', description: 'Сводка казино' },
          { command: 'online', description: 'Онлайн сейчас' },
          { command: 'search', description: 'Поиск игрока' },
          { command: 'top', description: 'Топы' },
          { command: 'bigwins', description: 'Крупные выигрыши' },
          { command: 'start', description: 'Открыть казино' },
        ],
        { scope: { type: 'all_private_chats' } },
      );
    } catch (e) {
      logger.warn(`[bot] setMyCommands failed: ${e?.message || e}`);
    }

    await bot.telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: 'Казино',
        web_app: { url: config.web.webAppUrl },
      },
    });

    // Запускаем бота
    await bot.launch({
      dropPendingUpdates: true, // Игнорируем старые обновления
    });

    logger.logBotStart();
    void maybeAnnounceCommandsOnline();

    // Обработка завершения приложения
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('uncaughtException', (error) => {
      logger.error('❌ Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    process.once('unhandledRejection', (reason, promise) => {
      logger.error('❌ Unhandled Rejection:', reason);
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('❌ Критическая ошибка при запуске приложения:', error);
    process.exit(1);
  }
}

/**
 * Корректное завершение работы приложения
 */
async function gracefulShutdown(signal) {
  logger.info(`⚠️  Получен сигнал ${signal}, завершение работы...`);

  try {
    // Останавливаем бота
    await bot.stop(signal);
    logger.info('🤖 Telegram бот остановлен');

    // Закрываем подключение к БД
    // await sequelize.close();
    logger.info('📊 Подключение к базе данных закрыто');

    logger.info('✅ Приложение успешно завершено');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Ошибка при завершении работы:', error);
    process.exit(1);
  }
}

// Запускаем приложение
startApplication();
