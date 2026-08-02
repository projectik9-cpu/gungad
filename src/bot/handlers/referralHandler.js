import logger from '../../utils/logger.js';
import { referralKeyboard } from '../keyboards.js';

/**
 * Обработчик команды /ref
 */
export async function referralHandler(ctx) {
  try {
    const demoRef = `
👥 <b>Реферальная программа (демо)</b>

⚠️ <b>Демо режим</b>

Реферальная система работает только с базой данных.

<b>После подключения БД:</b>
• Новый пользователь получает 500 монет
• Вы получаете 250 монет за каждого реферала

См. инструкцию в INSTALL.md
    `.trim();

    await ctx.reply(demoRef, {
      parse_mode: 'HTML',
      reply_markup: referralKeyboard(ctx.from.id).reply_markup,
    });
  } catch (error) {
    logger.logError(error, 'referralHandler');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}

/**
 * Обработчик callback для списка рефералов
 */
export async function myReferralsCallbackHandler(ctx) {
  try {
    await ctx.answerCbQuery();

    const stats = await userService.getUserStats(ctx.from.id);

    if (!stats || !stats.referrals || stats.referrals.length === 0) {
      await ctx.answerCbQuery('У вас пока нет рефералов', { show_alert: true });
      return;
    }

    let referralsList = '👥 <b>Ваши рефералы:</b>\n\n';

    stats.referrals.forEach((ref, index) => {
      const joinDate = new Date(ref.created_at).toLocaleDateString('ru-RU');
      referralsList += `${index + 1}. ${ref.username ? '@' + ref.username : 'ID: ' + ref.telegram_id}\n`;
      referralsList += `   Присоединился: ${joinDate}\n\n`;
    });

    referralsList += `\n💰 Всего заработано: <b>${stats.stats.referralEarnings}</b> монет`;

    await ctx.editMessageText(referralsList, {
      parse_mode: 'HTML',
      reply_markup: referralKeyboard(stats.profile.id).reply_markup,
    });

    logger.logUserAction(
      stats.profile.telegram_id,
      stats.profile.username,
      'VIEW_REFERRALS_LIST'
    );
  } catch (error) {
    logger.logError(error, 'myReferralsCallbackHandler');
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (e) {
      // Игнорируем ошибки при ответе на callback
    }
  }
}
