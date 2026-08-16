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
  return config.admin.ids.includes(Number(ctx.from?.id));
}

function isStarsWd(data) {
  return String(data?.asset || '').toUpperCase() === 'STARS';
}

function formatWdSum(data) {
  const n = Number(data?.amount_usd_cents) || 0;
  return isStarsWd(data)
    ? `⭐ ${(n / 100).toFixed(2).replace(/\.00$/, '')}`
    : `$${(n / 100).toFixed(2)}`;
}

function userWdApprovedText(data) {
  if (isStarsWd(data)) {
    return `✅ <b>Вывод выполнен</b>\n\n⭐ ${(data.amount_usd_cents / 100).toFixed(2).replace(/\.00$/, '')} Stars отправлены вам в Telegram.`;
  }
  return `✅ <b>Вывод выполнен</b>\n\nСумма $${(data.amount_usd_cents / 100).toFixed(2)} отправлена на ваш кошелёк. Спасибо за игру в GunGad!`;
}

function userWdRejectedText(data, reason) {
  const sum = formatWdSum(data);
  if (reason) {
    return `❌ <b>Вывод отклонён</b>\n\nЗаявка на ${sum} отклонена.\nПричина: ${escapeHtml(reason)}\n\nСредства возвращены на баланс.`;
  }
  return `❌ <b>Вывод отклонён</b>\n\nЗаявка на ${sum} отклонена, средства возвращены на баланс.`;
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

async function resolveTicketTelegramId(sb, ticket) {
  if (ticket?.telegram_id) return Number(ticket.telegram_id);
  if (!ticket?.profile_id) return null;
  const { data: profile } = await sb
    .from('gg_profiles')
    .select('telegram_id')
    .eq('id', ticket.profile_id)
    .maybeSingle();
  return profile?.telegram_id ? Number(profile.telegram_id) : null;
}

async function notifyUserByTelegramId(bot, telegramId, text) {
  if (!telegramId) return { ok: false, reason: 'no_telegram_id' };
  try {
    await bot.telegram.sendMessage(telegramId, text, { parse_mode: 'HTML' });
    return { ok: true };
  } catch (e) {
    const reason = e?.response?.description || e?.message || String(e);
    logger.warn(`[admin] notify tg ${telegramId} failed: ${reason}`);
    return { ok: false, reason };
  }
}

function askForceReply(ctx, prompt, pending) {
  pendingAdminReplies.set(ctx.from.id, pending);
  return ctx.reply(prompt, {
    parse_mode: 'HTML',
    ...Markup.forceReply(),
  });
}

async function deliverSupportReply(bot, sb, ticket, text, adminId) {
  const replyBody = String(text || '').slice(0, 4000);

  // Always persist first — player can read it in Mini App even if TG DM fails
  await sb.from('gg_support_tickets').update({
    status: 'replied',
    replied_at: new Date().toISOString(),
    reply_text: replyBody,
    admin_telegram_id: adminId,
  }).eq('id', ticket.id);

  const tgId = await resolveTicketTelegramId(sb, ticket);
  if (tgId && !ticket.telegram_id) {
    await sb.from('gg_support_tickets')
      .update({ telegram_id: tgId })
      .eq('id', ticket.id)
      .catch(() => {});
  }

  const send = await notifyUserByTelegramId(
    bot,
    tgId,
    `💬 <b>Ответ поддержки GunGad</b>\n\n${escapeHtml(replyBody)}\n\n<code>Тикет ${ticket.id}</code>`,
  );

  return send;
}

/**
 * Resolve pending admin action from memory, reply-to ticket, or awaiting_admin_reply row.
 */
async function resolvePendingAction(ctx, sb) {
  const fromId = ctx.from.id;
  const pending = pendingAdminReplies.get(fromId);
  if (pending) {
    pendingAdminReplies.delete(fromId);
    return pending;
  }

  const replyToId = ctx.message?.reply_to_message?.message_id;
  const replyText = ctx.message?.reply_to_message?.text
    || ctx.message?.reply_to_message?.caption
    || '';
  if (replyToId || replyText) {
    const rejectM = replyText.match(/заявки\s+([0-9a-f-]{36})/i);
    if (rejectM) return { kind: 'wd_reject', id: rejectM[1] };
    const wdMsgM = replyText.match(/по выводу\s+([0-9a-f-]{36})/i);
    if (wdMsgM) return { kind: 'wd_msg', id: wdMsgM[1] };
    const ticketM = replyText.match(/тикет(?:а)?\s+([0-9a-f-]{36})/i);
    if (ticketM) return { kind: 'sup_reply', id: ticketM[1] };

    if (replyToId) {
      const { data: byMsg } = await sb
        .from('gg_support_tickets')
        .select('id, telegram_id, profile_id, message, status')
        .eq('admin_message_id', replyToId)
        .maybeSingle();
      if (byMsg) return { kind: 'sup_reply', id: byMsg.id, ticket: byMsg };

      const { data: wd } = await sb
        .from('gg_withdrawals')
        .select('id')
        .eq('admin_message_id', replyToId)
        .maybeSingle();
      if (wd) return { kind: 'wd_msg', id: wd.id };
    }
  }

  // Durable fallback after bot restart: admin clicked Reply earlier
  const { data: awaiting } = await sb
    .from('gg_support_tickets')
    .select('id, telegram_id, profile_id, message, status')
    .eq('admin_telegram_id', fromId)
    .eq('status', 'awaiting_admin_reply')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (awaiting) return { kind: 'sup_reply', id: awaiting.id, ticket: awaiting };

  return null;
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
      if (!data?.ok) {
        return ctx.answerCbQuery(`Уже обработана (${data?.status || '?'})`, { show_alert: true });
      }

      await ctx.answerCbQuery('Заявка подтверждена ✅');
      const doneLine = `\n\n✅ <b>ВЫПЛАЧЕНО</b> админом @${ctx.from.username ?? ctx.from.id}`;
      await ctx.editMessageText(
        `${ctx.callbackQuery?.message?.text || 'Заявка'}${doneLine}`,
        { parse_mode: 'HTML' },
      ).catch(() => {});
      await ctx.reply(`✅ Вывод <code>${withdrawalId}</code> подтверждён (${formatWdSum(data)})`, { parse_mode: 'HTML' }).catch(() => {});

      await notifyUser(bot, sb, data.profile_id, userWdApprovedText(data));

      logWithdrawProcessed({
        withdrawalId,
        profileId: data.profile_id,
        amountCents: data.amount_usd_cents,
        asset: data.asset,
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
      const sb = getSupabaseAdmin();
      if (sb) {
        await sb.from('gg_support_tickets').update({
          status: 'awaiting_admin_reply',
          admin_telegram_id: ctx.from.id,
        }).eq('id', ticketId);
      }
      await ctx.answerCbQuery();
      const prompt = await askForceReply(
        ctx,
        [
          `💬 Ответ на тикет <code>${ticketId}</code>`,
          'Напиши сообщение игроку следующим сообщением.',
          'Можно также ответить реплаем на само сообщение с тикетом.',
          `Или командой: <code>/reply ${ticketId} текст</code>`,
        ].join('\n'),
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

  // ── /reply TICKET_ID text… ───────────────────────────────────────────────
  bot.command('reply', async (ctx) => {
    try {
      if (!isAdmin(ctx)) return;
      const raw = (ctx.message?.text || ctx.channelPost?.text || '').trim();
      const m = raw.match(/^\/reply(?:@\w+)?\s+([0-9a-f-]{36})\s+([\s\S]+)$/i);
      if (!m) {
        await ctx.reply('Использование: /reply TICKET_UUID текст ответа');
        return;
      }
      const ticketId = m[1];
      const body = m[2].trim();
      const sb = getSupabaseAdmin();
      if (!sb) {
        await ctx.reply('БД недоступна');
        return;
      }
      const { data: ticket } = await sb
        .from('gg_support_tickets')
        .select('id, telegram_id, profile_id, message')
        .eq('id', ticketId)
        .maybeSingle();
      if (!ticket) {
        await ctx.reply('Тикет не найден');
        return;
      }
      const send = await deliverSupportReply(bot, sb, ticket, body, ctx.from.id);
      if (send.ok) {
        await ctx.reply('✅ Ответ отправлен игроку в Telegram и сохранён в тикете.');
      } else {
        await ctx.reply(
          `⚠️ Ответ сохранён в тикете (игрок увидит в приложении), но Telegram DM не ушёл: ${escapeHtml(send.reason || 'unknown')}\nЧастая причина: игрок не нажимал /start у бота.`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (e) {
      logger.error(`[admin] /reply: ${e?.message || e}`);
      await ctx.reply('Ошибка /reply').catch(() => {});
    }
  });

  bot.command('wdok', async (ctx) => {
    try {
      if (!isAdmin(ctx)) return;
      const m = (ctx.message?.text || '').match(/^\/wdok(?:@\w+)?\s+([0-9a-f-]{36})/i);
      if (!m) {
        await ctx.reply('Использование: /wdok WITHDRAWAL_UUID');
        return;
      }
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.rpc('gg_process_withdrawal', {
        p_withdrawal_id: m[1],
        p_action: 'approved',
        p_admin_telegram_id: ctx.from.id,
      });
      if (error) {
        await ctx.reply(`Ошибка: ${error.message.slice(0, 160)}`);
        return;
      }
      if (!data?.ok) {
        await ctx.reply(`Уже обработана (${data?.status || '?'})`);
        return;
      }
      await ctx.reply(`✅ Вывод ${m[1]} подтверждён (${formatWdSum(data)})`);
      await notifyUser(bot, sb, data.profile_id, userWdApprovedText(data));
      logWithdrawProcessed({
        withdrawalId: m[1],
        profileId: data.profile_id,
        amountCents: data.amount_usd_cents,
        asset: data.asset,
        status: 'approved',
        adminId: ctx.from.id,
      }).catch(() => {});
    } catch (e) {
      logger.error(`[admin] /wdok: ${e?.message || e}`);
    }
  });

  bot.command('wdno', async (ctx) => {
    try {
      if (!isAdmin(ctx)) return;
      const m = (ctx.message?.text || '').match(/^\/wdno(?:@\w+)?\s+([0-9a-f-]{36})(?:\s+([\s\S]+))?/i);
      if (!m) {
        await ctx.reply('Использование: /wdno WITHDRAWAL_UUID [причина]');
        return;
      }
      const reason = (m[2] || '').trim() === '-' || !(m[2] || '').trim() ? null : m[2].trim();
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.rpc('gg_process_withdrawal', {
        p_withdrawal_id: m[1],
        p_action: 'rejected',
        p_admin_telegram_id: ctx.from.id,
        p_reason: reason,
      });
      if (error) {
        await ctx.reply(`Ошибка: ${error.message.slice(0, 160)}`);
        return;
      }
      if (!data?.ok) {
        await ctx.reply(`Уже обработана (${data?.status || '?'})`);
        return;
      }
      await notifyUser(bot, sb, data.profile_id, userWdRejectedText(data, reason));
      logWithdrawProcessed({
        withdrawalId: m[1],
        profileId: data.profile_id,
        amountCents: data.amount_usd_cents,
        asset: data.asset,
        status: 'rejected',
        adminId: ctx.from.id,
        reason,
      }).catch(() => {});
      await ctx.reply('❌ Заявка отклонена, средства возвращены игроку.');
    } catch (e) {
      logger.error(`[admin] /wdno: ${e?.message || e}`);
    }
  });
}

/**
 * Handle admin ForceReply / reply-to-ticket texts. Returns true if consumed.
 * Must run before catch-all message handler.
 */
export async function handleAdminReplyMessage(ctx, bot) {
  if (!ctx.from || !isAdmin(ctx)) return false;
  const text = ctx.message?.text;
  if (!text || text.startsWith('/')) return false;

  const sb = getSupabaseAdmin();
  if (!sb) return false;

  const pending = await resolvePendingAction(ctx, sb);
  if (!pending) return false;

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
      await notifyUser(bot, sb, data.profile_id, userWdRejectedText(data, reason));
      logWithdrawProcessed({
        withdrawalId: pending.id,
        profileId: data.profile_id,
        amountCents: data.amount_usd_cents,
        asset: data.asset,
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
      let ticket = pending.ticket;
      if (!ticket) {
        const { data } = await sb
          .from('gg_support_tickets')
          .select('id, telegram_id, profile_id, message')
          .eq('id', pending.id)
          .maybeSingle();
        ticket = data;
      }
      if (!ticket) {
        await ctx.reply('Тикет не найден');
        return true;
      }

      const send = await deliverSupportReply(bot, sb, ticket, text, ctx.from.id);
      if (send.ok) {
        await ctx.reply('✅ Ответ отправлен игроку в Telegram и сохранён в тикете.');
      } else {
        await ctx.reply(
          `⚠️ Ответ сохранён в тикете (игрок увидит в поддержке в приложении), но в Telegram не дошло: <code>${escapeHtml(send.reason || 'unknown')}</code>\nЧастая причина: игрок не писал /start боту.`,
          { parse_mode: 'HTML' },
        );
      }
      return true;
    }
  } catch (e) {
    logger.error(`[admin] reply handler: ${e?.message || e}`);
    await ctx.reply('Внутренняя ошибка').catch(() => {});
    return true;
  }

  return false;
}
