import { startHandler } from './startHandler.js';
import { preCheckoutHandler, successfulPaymentHandler } from './starsHandler.js';
import { registerAdminHandlers, handleAdminReplyMessage } from './adminHandler.js';
import { registerLogAdminHandlers } from './logAdminHandler.js';
import { openCasinoKeyboard } from '../keyboards.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';

function isLogChat(ctx) {
  const chat = ctx.chat;
  if (!chat) return false;
  const logId = String(config.logChatId || '').trim();
  if (!logId) return false;
  if (logId.startsWith('@')) {
    return (chat.username || '').toLowerCase() === logId.slice(1).toLowerCase();
  }
  return String(chat.id) === logId;
}

/**
 * Регистрация обработчиков — /start, Stars, админ, аналитика лог-канала
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

  // Админ-аналитика в лог-канале + ЛС админам
  registerLogAdminHandlers(bot);

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

  // Любое другое сообщение — коротко и с кнопкой казино (не в лог-канале)
  bot.on('message', async (ctx) => {
    if (ctx.message?.text?.startsWith('/')) return;
    if (isLogChat(ctx)) return;
    if (ctx.chat?.type !== 'private') return;
    await ctx.reply('🎰 Нажми кнопку ниже, чтобы открыть казино:', {
      reply_markup: openCasinoKeyboard().reply_markup,
    });
  });

  logger.info('✅ Обработчики зарегистрированы (казино + admin analytics)');
}
