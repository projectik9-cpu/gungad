import { Telegraf, Markup } from 'telegraf';
import config from '../config/config.js';
import logger from '../utils/logger.js';

// Создаём экземпляр бота
const bot = new Telegraf(config.telegram.botToken);

// Middleware для логирования
bot.use(async (ctx, next) => {
  const start = Date.now();
  const user = ctx.from;
  const chatType = ctx.chat?.type || 'unknown';
  
  logger.info(
    `📨 Входящее сообщение от ${user.id} (@${user.username || 'unknown'}) | Тип чата: ${chatType}`
  );

  try {
    await next();
  } catch (error) {
    logger.error(`Ошибка при обработке сообщения от ${user.id}:`, error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
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
