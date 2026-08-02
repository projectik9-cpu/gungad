import logger from '../../utils/logger.js';
import { backToMenuButton } from '../keyboards.js';

/**
 * Обработчик команды /balance
 */
export async function balanceHandler(ctx) {
  try {
    // Демо данные без БД
    const demoBalance = `
💰 <b>Демо баланс</b>

<b>1000</b> монет

⚠️ <b>Демо режим</b>
Подключите базу данных для сохранения данных.

См. инструкцию в INSTALL.md
    `.trim();

    await ctx.reply(demoBalance, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });

    logger.info(`✅ ${ctx.from.id} проверил баланс (демо режим)`);
  } catch (error) {
    logger.logError(error, 'balanceHandler');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Обработчик callback для баланса
 */
export async function balanceCallbackHandler(ctx) {
  try {
    await ctx.answerCbQuery();

    const demoBalance = `
💰 <b>Демо баланс</b>

<b>1000</b> монет

⚠️ <b>Демо режим</b>
Подключите базу данных для сохранения данных.
    `.trim();

    await ctx.editMessageText(demoBalance, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });
  } catch (error) {
    logger.logError(error, 'balanceCallbackHandler');
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (e) {
      // Игнорируем ошибки при ответе на callback
    }
  }
}
