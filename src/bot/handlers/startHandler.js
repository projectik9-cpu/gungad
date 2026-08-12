import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import { openCasinoKeyboard, removeReplyKeyboard } from '../keyboards.js';
import { ensureGgProfile, getSupabaseAdmin, parseReferrerTelegramId } from '../../database/supabase.js';

const WELCOME_IMAGE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/casino-welcome-gungad.png',
);

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function welcomeCaption(firstName) {
  const name = escapeHtml(firstName || 'игрок');
  return [
    `Привет, <b>${name}</b>.`,
    '',
    'Добро пожаловать в <b>GunGad</b>.',
    'Открой казино кнопкой ниже.',
  ].join('\n');
}

/**
 * Обработчик команды /start
 * Supports deep link: /start ref{telegram_id}
 */
export async function startHandler(ctx) {
  try {
    const telegramUser = ctx.from;
    const referrerId = parseReferrerTelegramId(ctx.startPayload);

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

    const caption = welcomeCaption(telegramUser.first_name);
    const keyboard = openCasinoKeyboard().reply_markup;

    const stub = await ctx.reply('\u200b', {
      reply_markup: removeReplyKeyboard().reply_markup,
    }).catch(() => null);

    if (existsSync(WELCOME_IMAGE)) {
      await ctx.replyWithPhoto(
        { source: createReadStream(WELCOME_IMAGE) },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        },
      );
    } else {
      await ctx.reply(caption, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }

    if (stub?.message_id) {
      await ctx.deleteMessage(stub.message_id).catch(() => {});
    }

    logger.info(
      `✅ Пользователь ${telegramUser.id} (@${telegramUser.username}) запустил бота` +
        (referrerId ? ` ref=${referrerId}` : ''),
    );
  } catch (error) {
    logger.logError(error, 'startHandler');
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
}
