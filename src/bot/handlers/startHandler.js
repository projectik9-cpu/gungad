import logger from '../../utils/logger.js';
import { openCasinoKeyboard, removeReplyKeyboard } from '../keyboards.js';
import { ensureGgProfile, getSupabaseAdmin, parseReferrerTelegramId } from '../../database/supabase.js';

/**
 * Обработчик команды /start
 * Supports deep link: /start ref{telegram_id}
 */
export async function startHandler(ctx) {
  try {
    const telegramUser = ctx.from;
    const referrerId = parseReferrerTelegramId(ctx.startPayload);

    // Создаём / обновляем профиль в Supabase (gg_profiles + wallet)
    ensureGgProfile(telegramUser, referrerId)
      .then((profileId) => {
        if (!profileId) return;
        const sb = getSupabaseAdmin();
        if (!sb) return;
        return sb
          .from('gg_profiles')
          .update({ bot_blocked_at: null, updated_at: new Date().toISOString() })
          .eq('id', profileId)
          .not('bot_blocked_at', 'is', null);
      })
      .catch((err) => {
        logger.warn('ensureGgProfile on /start failed', err?.message || err);
      });

    const welcomeMessage = `
🎰 <b>Добро пожаловать в GunGad Casino!</b> 🎰

Привет, <b>${telegramUser.first_name || 'игрок'}</b>! 👋

Мы рады видеть тебя в нашем казино!

<b>Нажми на кнопку ниже, чтобы открыть казино!</b> ⬇️
    `.trim();

    // Убираем старую reply-клавиатуру (Баланс/Профиль и т.д.)
    await ctx.reply(welcomeMessage, {
      parse_mode: 'HTML',
      reply_markup: removeReplyKeyboard().reply_markup,
    });

    await ctx.reply('⬇️', {
      reply_markup: openCasinoKeyboard().reply_markup,
    });

    logger.info(
      `✅ Пользователь ${telegramUser.id} (@${telegramUser.username}) запустил бота` +
        (referrerId ? ` ref=${referrerId}` : ''),
    );
  } catch (error) {
    logger.logError(error, 'startHandler');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}
