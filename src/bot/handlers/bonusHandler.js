import logger from '../../utils/logger.js';
import { backToMenuButton } from '../keyboards.js';

/**
 * Обработчик команды /bonus
 */
export async function bonusHandler(ctx) {
  try {
    const demoBonus = `
🎁 <b>Ежедневный бонус (демо)</b>

В демо режиме бонусы не сохраняются.

⚠️ <b>Подключите базу данных</b> для:
• Ежедневных бонусов (100 монет)
• Сохранения баланса
• Истории транзакций

См. инструкцию в INSTALL.md
    `.trim();

    await ctx.reply(demoBonus, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });
  } catch (error) {
    logger.logError(error, 'bonusHandler');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Обработчик callback для бонуса
 */
export async function bonusCallbackHandler(ctx) {
  try {
    await ctx.answerCbQuery();

    const demoBonus = `
🎁 <b>Ежедневный бонус (демо)</b>

В демо режиме бонусы не сохраняются.

⚠️ <b>Подключите базу данных</b> для полного функционала.
    `.trim();

    await ctx.editMessageText(demoBonus, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });
  } catch (error) {
    logger.logError(error, 'bonusCallbackHandler');
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (e) {
      // Игнорируем ошибки при ответе на callback
    }
  }
}
