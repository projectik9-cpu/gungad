import bot from './bot/bot.js';
import { registerHandlers } from './bot/handlers/index.js';
import { startWebServer, setStarsBot, setWithdrawBot, setSupportBot } from './web/server.js';
import { startTonMonitor } from './services/tonMonitor.js';
import { startCryptoBotReconcile } from './services/cryptoBotReconcile.js';
import { startStarsReconcile } from './services/starsReconcile.js';
import { startDailyBonusNotify } from './services/dailyBonusNotify.js';
import { startPokerTimerWorker } from './poker/timerWorker.js';
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

    // HTTP first — Railway healthcheck (/api/health) must bind before DB/Telegram.
    logger.info('🌐 Запуск веб-сервера...');
    await startWebServer();

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

    // 5. Инжектируем бота в API (Stars, выводы, поддержка)
    setStarsBot(bot);
    setWithdrawBot(bot);
    setSupportBot(bot);
    setLogBot(bot);

    // 5.1 TON-монитор депозитов (memo scheme)
    startTonMonitor();
    // 5.2 Crypto Bot — поллинг оплаченных инвойсов (вебхук может быть выключен)
    startCryptoBotReconcile();
    startStarsReconcile(bot);

    // Telegram bot must not take down the Mini App API if TG is banned/rate-limited.
    await startTelegramBotSafe();

    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('❌ Uncaught Exception:', error);
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('❌ Unhandled Rejection:', reason);
    });

  } catch (error) {
    logger.error('❌ Критическая ошибка при запуске приложения:', error);
    process.exit(1);
  }
}

async function startTelegramBotSafe() {
  logger.info('🤖 Запуск Telegram бота...');
  const token = config.telegram.botToken || '';
  logger.info(`[bot] token_len=${token.length} suffix=${token.slice(-6)}`);

  try {
    const me = await bot.telegram.getMe();
    logger.info(`[bot] getMe ok @${me.username} id=${me.id}`);
  } catch (e) {
    logger.error(
      `[bot] getMe failed — BOT_TOKEN invalid or still revoked. Update Railway BOT_TOKEN from @BotFather. ${e?.message || e}`,
    );
    return;
  }

  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    logger.info('[bot] webhook cleared, using long polling');
  } catch (e) {
    logger.warn(`[bot] deleteWebhook failed: ${e?.message || e}`);
  }

  try {
    await bot.telegram.deleteMyCommands();
  } catch (e) {
    logger.warn(`[bot] deleteMyCommands failed: ${e?.message || e}`);
  }

  try {
    await bot.telegram.setMyCommands(
      [
        { command: 'help', description: 'Admin commands' },
        { command: 'user', description: 'Player lookup' },
        { command: 'stats', description: 'Stats' },
        { command: 'online', description: 'Online now' },
        { command: 'search', description: 'Search player' },
        { command: 'top', description: 'Leaderboards' },
        { command: 'bigwins', description: 'Big wins' },
        { command: 'start', description: 'Open app' },
      ],
      { scope: { type: 'all_private_chats' } },
    );
  } catch (e) {
    logger.warn(`[bot] setMyCommands failed: ${e?.message || e}`);
  }

  try {
    await bot.telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: 'Open',
        web_app: { url: config.web.webAppUrl },
      },
    });
  } catch (e) {
    logger.warn(`[bot] setChatMenuButton failed: ${e?.message || e}`);
  }

  startPokerTimerWorker();

  try {
    await bot.launch({ dropPendingUpdates: true });
    logger.logBotStart();
    void maybeAnnounceCommandsOnline();
    startDailyBonusNotify(bot);
  } catch (e) {
    logger.error(`[bot] launch failed (API stays up): ${e?.message || e}`);
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
