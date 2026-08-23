import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../utils/logger.js';
import { openCasinoKeyboard, removeReplyKeyboard } from '../keyboards.js';
import {
  ensureGgProfile,
  getSupabaseAdmin,
  parseReferrerFromCtx,
  applyReferralSignup,
} from '../../database/supabase.js';

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

function welcomeCaption(firstName, signupCents = 0) {
  const name = escapeHtml(firstName || 'игрок');
  const lines = [
    `Привет, <b>${name}</b>.`,
    '',
    'Добро пожаловать в <b>GunGad</b>.',
    'Нажми Play, чтобы открыть игры.',
  ];
  if (signupCents > 0) {
    lines.push('', `🎁 Бонус за приглашение: <b>+$${(signupCents / 100).toFixed(2)}</b> на баланс.`);
  }
  return lines.join('\n');
}

/**
 * /start  — deep link /start ref{telegram_id}
 */
export async function startHandler(ctx) {
  try {
    const telegramUser = ctx.from;
    const referrerId = parseReferrerFromCtx(ctx);

    let profileId = null;
    let signupCents = 0;
    try {
      profileId = await ensureGgProfile(telegramUser, referrerId);
      if (profileId) {
        const sb = getSupabaseAdmin();
        if (sb) {
          await sb
            .from('gg_profiles')
            .update({ bot_blocked_at: null, updated_at: new Date().toISOString() })
            .eq('id', profileId)
            .not('bot_blocked_at', 'is', null);
        }
        if (referrerId) {
          const applied = await applyReferralSignup(profileId, referrerId);
          logger.info(
            `[start] referral telegram=${telegramUser.id} ref=${referrerId} result=${JSON.stringify(applied)}`,
          );
          if (applied?.paid) {
            signupCents = Number(applied.invitee_cents) || 0;
            const label = telegramUser.username
              ? `@${telegramUser.username}`
              : escapeHtml(telegramUser.first_name || telegramUser.id);
            await ctx.telegram.sendMessage(
              referrerId,
              `👥 По твоей ссылке зашёл ${label}.\n🎁 Тебе начислено <b>$${(Number(applied.referrer_cents) / 100).toFixed(2)}</b>.\nДальше 25% с его пополнений.`,
              { parse_mode: 'HTML' },
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.warn('ensureGgProfile on /start failed', err?.message || err);
    }

    const caption = welcomeCaption(telegramUser.first_name, signupCents);
    const keyboard = openCasinoKeyboard(referrerId).reply_markup;

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
