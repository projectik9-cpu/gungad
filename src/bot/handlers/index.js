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
  bot.start(startHandler);

  // Telegram Stars payment flow
  bot.on('pre_checkout_query', preCheckoutHandler);
  bot.on('message', async (ctx, next) => {
    if (ctx.message?.successful_payment) {
      return successfulPaymentHandler(ctx);
    }
    return next();
  });

  // Админ: выводы / поддержка (кнопки) — ДО catch-all action
  registerAdminHandlers(bot);

  // Админ: ForceReply ответы (ДО лог-канала, иначе next() теряется)
  bot.on('message', async (ctx, next) => {
    const handled = await handleAdminReplyMessage(ctx, bot);
    if (handled) return;
    return next();
  });

  // Админ-аналитика в лог-канале + ЛС админам
  registerLogAdminHandlers(bot);

  // Любые старые callback'и меню → снова только кнопка казино
  bot.action(/.*/, async (ctx) => {
    const data = String(ctx.callbackQuery?.data || '');
    if (/^(wd_|sup_)/.test(data)) return;
    try {
      await ctx.answerCbQuery();
      const text = `
🎮 <b>GunGad</b>

Нажми Play, чтобы открыть игры.
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
    await ctx.reply('🎮 Нажми Play, чтобы открыть игры:', {
      reply_markup: openCasinoKeyboard().reply_markup,
    });
  });

  logger.info('✅ Обработчики зарегистрированы (казино + admin analytics)');
}
