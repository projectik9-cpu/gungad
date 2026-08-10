import { startHandler } from './startHandler.js';
import { preCheckoutHandler, successfulPaymentHandler } from './starsHandler.js';
import { registerAdminHandlers, handleAdminReplyMessage } from './adminHandler.js';
import { openCasinoKeyboard } from '../keyboards.js';
import logger from '../../utils/logger.js';

/**
 * Регистрация обработчиков — /start, Stars payments, кнопка казино
 */
export function registerHandlers(bot) {
  bot.command('start', startHandler);

  // Telegram Stars payment flow
  bot.on('pre_checkout_query', preCheckoutHandler);
  bot.on('message', async (ctx, next) => {
    if (ctx.message?.successful_payment) {
      return successfulPaymentHandler(ctx);
    }
    return next();
  });

  // Админ: выводы / поддержка (ДО catch-all)
  registerAdminHandlers(bot);

  // Админ: ForceReply ответы игрокам (ДО catch-all текста)
  bot.on('message', async (ctx, next) => {
    const handled = await handleAdminReplyMessage(ctx, bot);
    if (handled) return;
    return next();
  });

  // Любые старые callback'и меню → снова только кнопка казино
  bot.action(/.*/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const text = `
🎰 <b>GunGad Casino</b>

Нажми на кнопку ниже, чтобы открыть казино!
      `.trim();

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: openCasinoKeyboard().reply_markup,
      }).catch(async () => {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: openCasinoKeyboard().reply_markup,
        });
      });
    } catch (error) {
      logger.logError(error, 'legacyCallbackHandler');
    }
  });

  // Любое другое сообщение — коротко и с кнопкой казино
  bot.on('message', async (ctx) => {
    if (ctx.message?.text?.startsWith('/')) return;
    await ctx.reply('🎰 Нажми кнопку ниже, чтобы открыть казино:', {
      reply_markup: openCasinoKeyboard().reply_markup,
    });
  });

  logger.info('✅ Обработчики зарегистрированы (только открыть казино)');
}
