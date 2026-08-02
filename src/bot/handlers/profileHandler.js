import logger from '../../utils/logger.js';
import { backToMenuButton } from '../keyboards.js';

/**
 * Обработчик команды /profile
 */
export async function profileHandler(ctx) {
  try {
    const demoProfile = `
👤 <b>Демо профиль</b>

👤 ID: <code>${ctx.from.id}</code>
${ctx.from.username ? `📝 Username: @${ctx.from.username}\n` : ''}
💰 Баланс: <b>1000</b> монет
🏆 Уровень: <b>1</b>

⚠️ <b>Демо режим</b>
Подключите PostgreSQL для сохранения данных.

См. инструкцию в INSTALL.md
    `.trim();

    await ctx.reply(demoProfile, {
      parse_mode: 'HTML',
      reply_markup: backToMenuButton().reply_markup,
    });

    logger.info(`✅ ${ctx.from.id} посмотрел профиль (демо режим)`);
  } catch (error) {
    logger.logError(error, 'profileHandler');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}
