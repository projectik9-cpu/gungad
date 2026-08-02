import logger from '../../utils/logger.js';
import { messages } from '../messages.js';
import { backToMenuButton } from '../keyboards.js';

/**
 * Обработчик команды /help
 */
export async function helpHandler(ctx) {
  try {
    const helpMessage = messages.help();

    await ctx.reply(helpMessage, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });

    logger.logUserAction(ctx.from.id, ctx.from.username, 'VIEW_HELP');
  } catch (error) {
    logger.logError(error, 'helpHandler');
    await ctx.reply(messages.errors.generic);
  }
}

/**
 * Обработчик callback для информации
 */
export async function infoCallbackHandler(ctx) {
  try {
    await ctx.answerCbQuery();

    const helpMessage = messages.help();

    await ctx.editMessageText(helpMessage, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });

    logger.logUserAction(ctx.from.id, ctx.from.username, 'VIEW_HELP_CALLBACK');
  } catch (error) {
    logger.logError(error, 'infoCallbackHandler');
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (e) {
      // Игнорируем ошибки при ответе на callback
    }
  }
}
