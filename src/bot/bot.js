import { Telegraf, Markup } from 'telegraf';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Создаём экземпляр бота
const bot = new Telegraf(config.telegram.botToken || '0:missing');

// Middleware для логирования
bot.use(async (ctx, next) => {
  const start = Date.now();
  const user = ctx.from;
  const chatType = ctx.chat?.type || 'unknown';
  const uid = user?.id ?? ctx.channelPost?.sender_chat?.id ?? 'n/a';
  const uname = user?.username || ctx.chat?.username || 'unknown';

  logger.info(
    `📨 Входящее от ${uid} (@${uname}) | Тип чата: ${chatType} | update=${ctx.updateType}`,
  );

  try {
    await next();
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от ${uid}:`, error);
    try {
      if (ctx.chat?.type === 'private') {
        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      }
    } catch {
      /* ignore */
    }
  }

  const duration = Date.now() - start;
  logger.info(`✅ Обработано за ${duration}мс`);
});

// Middleware для проверки блокировки пользователя
bot.use(async (ctx, next) => {
  try {
    // Импортируем здесь чтобы избежать циклических зависимостей
    const userService = (await import('../services/userService.js')).default;
    
    if (ctx.from) {
      const isBlocked = await userService.isUserBlocked(ctx.from.id);
      if (isBlocked) {
        await ctx.reply('🚫 Ваш аккаунт заблокирован. Обратитесь в поддержку.');
        return;
      }
    }
  } catch (error) {
    // Если БД недоступна - просто пропускаем проверку
    logger.warn('База данных недоступна, проверка блокировки пропущена');
  }
  
  await next();
});

export default bot;
