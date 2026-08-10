/**
 * Admin bot handlers:
 * - Withdrawals: approve / reject (with reason) / message user
 * - Support: reply / close
 * Callbacks must be registered before catch-all actions.
 */
import { Markup } from 'telegraf';
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { logWithdrawProcessed, escapeHtml } from '../../services/telegramLog.js';

/** @type {Map<number, { kind: string, id: string, promptMessageId?: number }>} */
const pendingAdminReplies = new Map();

export function isAdmin(ctx) {
  return config.admin.ids.includes(ctx.from?.id);
}

async function notifyUser(bot, sb, profileId, text) {
  try {
    const { data: profile } = await sb
      .from('gg_profiles')
      .select('telegram_id')
      .eq('id', profileId)
      .maybeSingle();
    if (profile?.telegram_id) {
      await bot.telegram.sendMessage(profile.telegram_id, text, { parse_mode: 'HTML' });
      return true;
    }
  } catch (e) {
    logger.warn(`[admin] notify user failed: ${e?.message || e}`);
  }
  return false;
}

async function notifyUserByTelegramId(bot, telegramId, text) {
  if (!telegramId) return false;
  try {
    await bot.telegram.sendMessage(telegramId, text, { parse_mode: 'HTML' });
    return true;
  } catch (e) {
    logger.warn(`[admin] notify tg ${telegramId} failed: ${e?.message || e}`);
    return false;
  }
}

function askForceReply(ctx, prompt, pending) {
  pendingAdminReplies.set(ctx.from.id, pending);
  return ctx.reply(prompt, {
    parse_mode: 'HTML',
    ...Markup.forceReply(),
  });
}

export function registerAdminHandlers(bot) {
  // ── Withdraw approve ─────────────────────────────────────────────────────
  bot.action(/^wd_approve_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const withdrawalId = ctx.match[1];
      const sb = getSupabaseAdmin();
      if (!sb) return ctx.answerCbQuery('БД недоступна', { show_alert: true });

      const { data, error } = await sb.rpc('gg_process_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_action: 'approved',
        p_admin_telegram_id: ctx.from.id,
      });

      if (error) {
        logger.error(`[admin] approve ${withdrawalId}: ${error.message}`);
        return ctx.answerCbQuery(`Ошибка: ${error.message.slice(0, 100)}`, { show_alert: true });
      }
      if (!data.ok) {
        return ctx.answerCbQuery(`Уже обработана (${data.status})`, { show_alert: true });
      }

      const amountUsd = (data.amount_usd_cents / 100).toFixed(2);
      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n✅ <b>ВЫПЛАЧЕНО</b> админом @${ctx.from.username ?? ctx.from.id}`,
        { parse_mode: 'HTML' },
      ).catch(() => {});
      await ctx.answerCbQuery('Заявка подтверждена ✅');

      await notifyUser(bot, sb, data.profile_id,
        `✅ <b>Вывод выполнен</b>\n\nСумма $${amountUsd} отправлена на ваш кошелёк. Спасибо за игру в GunGad!`);

      logWithdrawProcessed({
        withdrawalId,
        profileId: data.profile_id,
        amountCents: data.amount_usd_cents,
        status: 'approved',
        adminId: ctx.from.id,
      }).catch(() => {});

      logger.info(`[admin] withdrawal ${withdrawalId} approved by ${ctx.from.id}`);
    } catch (e) {
      logger.error(`[admin] wd_approve: ${e?.message || e}`);
      ctx.answerCbQuery('Внутренняя ошибка').catch(() => {});
    }
  });

  // ── Withdraw reject → ask reason ─────────────────────────────────────────
  bot.action(/^wd_reject_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const withdrawalId = ctx.match[1];
      await ctx.answerCbQuery();
      const prompt = await askForceReply(
        ctx,
        `❌ Причина отклонения для заявки <code>${withdrawalId}</code>\nНапиши текст игроку (или «-» без причины):`,
        { kind: 'wd_reject', id: withdrawalId },
      );
      const entry = pendingAdminReplies.get(ctx.from.id);
      if (entry) entry.promptMessageId = prompt?.message_id;
    } catch (e) {
      logger.error(`[admin] wd_reject prompt: ${e?.message || e}`);
      ctx.answerCbQuery('Ошибка').catch(() => {});
    }
  });

  // ── Withdraw: free-text message to user ──────────────────────────────────
  bot.action(/^wd_msg_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const withdrawalId = ctx.match[1];
      await ctx.answerCbQuery();
      const prompt = await askForceReply(
        ctx,
        `✉️ Сообщение игроку по выводу <code>${withdrawalId}</code>:`,
        { kind: 'wd_msg', id: withdrawalId },
      );
      const entry = pendingAdminReplies.get(ctx.from.id);
      if (entry) entry.promptMessageId = prompt?.message_id;
    } catch (e) {
      logger.error(`[admin] wd_msg: ${e?.message || e}`);
    }
  });

  // ── Support: reply ───────────────────────────────────────────────────────
  bot.action(/^sup_reply_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const ticketId = ctx.match[1];
      await ctx.answerCbQuery();
      const prompt = await askForceReply(
        ctx,
        `💬 Ответ на тикет <code>${ticketId}</code>\nНапиши сообщение игроку:`,
        { kind: 'sup_reply', id: ticketId },
      );
      const entry = pendingAdminReplies.get(ctx.from.id);
      if (entry) entry.promptMessageId = prompt?.message_id;
    } catch (e) {
      logger.error(`[admin] sup_reply: ${e?.message || e}`);
    }
  });

  // ── Support: close ───────────────────────────────────────────────────────
  bot.action(/^sup_close_(.+)$/, async (ctx) => {
    try {
      if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Нет прав', { show_alert: true });
      }
      const ticketId = ctx.match[1];
      const sb = getSupabaseAdmin();
      if (!sb) return ctx.answerCbQuery('БД недоступна', { show_alert: true });

      await sb.from('gg_support_tickets')
        .update({ status: 'closed', admin_telegram_id: ctx.from.id })
        .eq('id', ticketId);

      await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n🔒 <b>ЗАКРЫТО</b> админом @${ctx.from.username ?? ctx.from.id}`,
        { parse_mode: 'HTML' },
      ).catch(() => {});
      await ctx.answerCbQuery('Тикет закрыт');
    } catch (e) {
      logger.error(`[admin] sup_close: ${e?.message || e}`);
      ctx.answerCbQuery('Ошибка').catch(() => {});
    }
  });
}

/**
 * Handle admin ForceReply texts. Returns true if consumed.
 * Must run before catch-all message handler.
 */
export async function handleAdminReplyMessage(ctx, bot) {
  if (!ctx.from || !isAdmin(ctx)) return false;
  const text = ctx.message?.text;
  if (!text || text.startsWith('/')) return false;

  const pending = pendingAdminReplies.get(ctx.from.id);
  if (!pending) return false;

  pendingAdminReplies.delete(ctx.from.id);
  const sb = getSupabaseAdmin();
  if (!sb) {
    await ctx.reply('БД недоступна');
    return true;
  }

  try {
    if (pending.kind === 'wd_reject') {
      const reason = text.trim() === '-' ? null : text.trim();
      const { data, error } = await sb.rpc('gg_process_withdrawal', {
        p_withdrawal_id: pending.id,
        p_action: 'rejected',
        p_admin_telegram_id: ctx.from.id,
        p_reason: reason,
      });
      if (error) {
        await ctx.reply(`Ошибка: ${error.message.slice(0, 120)}`);
        return true;
      }
      if (!data?.ok) {
        await ctx.reply(`Уже обработана (${data?.status ?? '?'})`);
        return true;
      }
      const amountUsd = (data.amount_usd_cents / 100).toFixed(2);
      const userText = reason
        ? `❌ <b>Вывод отклонён</b>\n\nЗаявка на $${amountUsd} отклонена.\nПричина: ${escapeHtml(reason)}\n\nСредства возвращены на баланс.`
        : `❌ <b>Вывод отклонён</b>\n\nЗаявка на $${amountUsd} отклонена, средства возвращены на баланс. По вопросам пишите в поддержку.`;
      await notifyUser(bot, sb, data.profile_id, userText);
      logWithdrawProcessed({
        withdrawalId: pending.id,
        profileId: data.profile_id,
        amountCents: data.amount_usd_cents,
        status: 'rejected',
        adminId: ctx.from.id,
        reason,
      }).catch(() => {});
      await ctx.reply('❌ Заявка отклонена, игрок уведомлён.');
      return true;
    }

    if (pending.kind === 'wd_msg') {
      const { data: wd } = await sb
        .from('gg_withdrawals')
        .select('id, profile_id, amount_usd_cents')
        .eq('id', pending.id)
        .maybeSingle();
      if (!wd) {
        await ctx.reply('Заявка не найдена');
        return true;
      }
      const ok = await notifyUser(
        bot,
        sb,
        wd.profile_id,
        `💬 <b>Сообщение по выводу</b>\n\n${escapeHtml(text)}`,
      );
      await ctx.reply(ok ? '✅ Отправлено игроку' : '❌ Не удалось отправить');
      return true;
    }

    if (pending.kind === 'sup_reply') {
      const { data: ticket } = await sb
        .from('gg_support_tickets')
        .select('id, telegram_id, profile_id, message')
        .eq('id', pending.id)
        .maybeSingle();
      if (!ticket) {
        await ctx.reply('Тикет не найден');
        return true;
      }
      const ok = await notifyUserByTelegramId(
        bot,
        ticket.telegram_id,
        `💬 <b>Ответ поддержки GunGad</b>\n\n${escapeHtml(text)}`,
      );
      await sb.from('gg_support_tickets').update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        reply_text: text.slice(0, 4000),
        admin_telegram_id: ctx.from.id,
      }).eq('id', pending.id);
      await ctx.reply(ok ? '✅ Ответ отправлен игроку' : '❌ Не удалось отправить (нет telegram_id?)');
      return true;
    }
  } catch (e) {
    logger.error(`[admin] reply handler: ${e?.message || e}`);
    await ctx.reply('Внутренняя ошибка').catch(() => {});
    return true;
  }

  return false;
}
