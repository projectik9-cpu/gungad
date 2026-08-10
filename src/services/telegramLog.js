/**
 * Structured event logs → Telegram channel/group (LOG_CHAT_ID / @dbdjdjd66).
 */
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { getSupabaseAdmin } from '../database/supabase.js';

let _bot = null;

const TG_MSG_LIMIT = 3900;

export function setLogBot(bot) {
  _bot = bot;
}

export function getLogBot() {
  return _bot;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatUsd(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$?.??';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

export function formatUserLabel(profile) {
  if (!profile) return '—';
  if (profile.username) return `@${escapeHtml(profile.username)}`;
  if (profile.first_name) return escapeHtml(profile.first_name);
  if (profile.telegram_id) return `tg:${profile.telegram_id}`;
  return '—';
}

/** Compact identity block used in every money event */
export function formatPlayerLine(profile, wallet) {
  const lines = [
    `Игрок: ${formatUserLabel(profile)}`,
    `TG ID: <code>${profile?.telegram_id ?? '?'}</code>`,
    `Profile: <code>${profile?.id ?? '?'}</code>`,
  ];
  if (profile?.first_name || profile?.last_name) {
    lines.push(`Имя: ${escapeHtml([profile.first_name, profile.last_name].filter(Boolean).join(' '))}`);
  }
  if (profile?.vip_level != null) {
    lines.push(`VIP: L${profile.vip_level} · XP ${profile.vip_xp ?? 0}`);
  }
  if (wallet) {
    const avail = (wallet.balance_cents ?? 0) - (wallet.locked_cents ?? 0);
    lines.push(
      `Баланс: <b>${formatUsd(wallet.balance_cents)}</b> · доступно ${formatUsd(avail)} · lock ${formatUsd(wallet.locked_cents)}`,
    );
  }
  return lines.join('\n');
}

export async function notifyLog(html) {
  const chatId = config.logChatId;
  if (!_bot || !chatId) return;
  const text = String(html ?? '');
  try {
    if (text.length <= TG_MSG_LIMIT) {
      await _bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      return;
    }
    // Split long analytics dumps
    let rest = text;
    let part = 1;
    while (rest.length > 0) {
      let chunk = rest.slice(0, TG_MSG_LIMIT);
      const cut = chunk.lastIndexOf('\n');
      if (cut > TG_MSG_LIMIT * 0.6) chunk = chunk.slice(0, cut);
      await _bot.telegram.sendMessage(
        chatId,
        part === 1 ? chunk : `…(${part})\n${chunk}`,
        { parse_mode: 'HTML', disable_web_page_preview: true },
      );
      rest = rest.slice(chunk.length);
      part += 1;
      if (part > 8) break;
    }
  } catch (e) {
    logger.warn(`[telegramLog] send failed: ${e?.message || e}`);
  }
}

export async function fetchProfile(profileId) {
  if (!profileId) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from('gg_profiles')
    .select('id, telegram_id, username, first_name, last_name, vip_level, vip_xp, referrer_telegram_id, created_at, last_seen_at, welcome_bonus_claimed_at, is_blocked')
    .eq('id', profileId)
    .maybeSingle();
  return data;
}

export async function fetchWallet(profileId) {
  if (!profileId) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from('gg_wallets')
    .select('balance_cents, locked_cents, stars_balance, total_wagered_cents, total_won_cents, total_lost_cents, total_deposited_cents, total_withdrawn_cents')
    .eq('profile_id', profileId)
    .maybeSingle();
  return data;
}

export async function fetchProfileByTelegramId(telegramId) {
  const sb = getSupabaseAdmin();
  if (!sb || telegramId == null) return null;
  const { data } = await sb
    .from('gg_profiles')
    .select('id, telegram_id, username, first_name, last_name, vip_level, vip_xp, referrer_telegram_id, created_at, last_seen_at, welcome_bonus_claimed_at, is_blocked')
    .eq('telegram_id', Number(telegramId))
    .maybeSingle();
  return data;
}

export async function fetchProfileBundle(profileId) {
  const [profile, wallet] = await Promise.all([
    fetchProfile(profileId),
    fetchWallet(profileId),
  ]);
  return { profile, wallet };
}

/** After successful (non-idempotent) deposit: log + referral commission if any */
export async function logDepositCredited({
  depositId,
  profileId,
  amountCents,
  provider,
  externalId,
  cryptoAmount,
  idempotent,
  balanceAfterCents,
}) {
  if (idempotent) return;

  const { profile, wallet } = await fetchProfileBundle(profileId);
  const bal = balanceAfterCents ?? wallet?.balance_cents;
  await notifyLog([
    '💰 <b>ДЕПОЗИТ ЗАЧИСЛЁН</b>',
    formatPlayerLine(profile, wallet ? { ...wallet, balance_cents: bal ?? wallet.balance_cents } : null),
    '',
    `Сумма: <b>${formatUsd(amountCents)}</b>`,
    `Провайдер: <b>${escapeHtml(provider || '?')}</b>`,
    cryptoAmount != null ? `Крипто: <code>${escapeHtml(cryptoAmount)}</code>` : null,
    bal != null ? `Баланс после: <b>${formatUsd(bal)}</b>` : null,
    `Всего депозитов: <b>${formatUsd(wallet?.total_deposited_cents)}</b>`,
    `Deposit: <code>${escapeHtml(depositId)}</code>`,
    externalId ? `Ext: <code>${escapeHtml(externalId)}</code>` : null,
  ].filter(Boolean).join('\n'));

  const sb = getSupabaseAdmin();
  if (!sb || !depositId) return;
  try {
    const { data: rows } = await sb
      .from('gg_ledger')
      .select('amount_cents, profile_id, meta')
      .eq('kind', 'referral')
      .eq('idempotency_key', `ref:dep:${externalId || depositId}`)
      .limit(1);
    const row = rows?.[0];
    if (!row) return;
    const ref = await fetchProfileBundle(row.profile_id);
    await notifyLog([
      '🎁 <b>РЕФЕРАЛ 20%</b>',
      formatPlayerLine(ref.profile, ref.wallet),
      '',
      `От депозита: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
      `Начислено: <b>${formatUsd(row.amount_cents)}</b>`,
      `Deposit: <code>${escapeHtml(depositId)}</code>`,
    ].join('\n'));
  } catch (e) {
    logger.warn(`[telegramLog] referral lookup: ${e?.message || e}`);
  }
}

export async function logWithdrawRequest({
  withdrawalId,
  profileId,
  amountUsd,
  asset,
  address,
}) {
  const { profile, wallet } = await fetchProfileBundle(profileId);
  await notifyLog([
    '💸 <b>ЗАЯВКА НА ВЫВОД</b>',
    formatPlayerLine(profile, wallet),
    '',
    `Сумма: <b>${formatUsd(Math.round(Number(amountUsd) * 100))}</b> ${escapeHtml(asset)}`,
    `Адрес: <code>${escapeHtml(address)}</code>`,
    `Всего выведено: <b>${formatUsd(wallet?.total_withdrawn_cents)}</b>`,
    `ID: <code>${escapeHtml(withdrawalId)}</code>`,
  ].join('\n'));
}

export async function logWithdrawProcessed({
  withdrawalId,
  profileId,
  amountCents,
  status,
  adminId,
  reason,
}) {
  const { profile, wallet } = await fetchProfileBundle(profileId);
  const title = status === 'approved' ? '✅ ВЫВОД ВЫПЛАЧЕН' : '❌ ВЫВОД ОТКЛОНЁН';
  await notifyLog([
    `<b>${title}</b>`,
    formatPlayerLine(profile, wallet),
    '',
    `Сумма: <b>${formatUsd(amountCents)}</b>`,
    `Админ: <code>${adminId ?? '?'}</code>`,
    reason ? `Причина: ${escapeHtml(reason)}` : null,
    `ID: <code>${escapeHtml(withdrawalId)}</code>`,
  ].filter(Boolean).join('\n'));
}

export async function logWelcomeBonus({ profileId, amountCents, alreadyClaimed }) {
  if (alreadyClaimed || !amountCents) return;
  const { profile, wallet } = await fetchProfileBundle(profileId);
  await notifyLog([
    '🎡 <b>БОНУС КОЛЕСО</b>',
    formatPlayerLine(profile, wallet),
    '',
    `Выигрыш: <b>${formatUsd(amountCents)}</b>`,
  ].join('\n'));
}

export async function logSupportTicket({ ticketId, profile, message }) {
  await notifyLog([
    '🆘 <b>ТИКЕТ ПОДДЕРЖКИ</b>',
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    `Profile: <code>${profile?.id ?? '?'}</code>`,
    '',
    escapeHtml(message).slice(0, 800),
    '',
    `Тикет: <code>${escapeHtml(ticketId)}</code>`,
  ].join('\n'));
}

export async function logStarsTopup({ profileId, starsAmount, usdCents, idempotent }) {
  if (idempotent) return;
  const { profile, wallet } = await fetchProfileBundle(profileId);
  await notifyLog([
    '⭐ <b>STARS ПОПОЛНЕНИЕ</b>',
    formatPlayerLine(profile, wallet),
    '',
    `Stars: <b>${starsAmount}</b> → <b>${formatUsd(usdCents)}</b>`,
  ].join('\n'));
}

/**
 * Log one-shot settle (mines/dice/...) or crash resolve outcome.
 * Skips pure cancelled (refund) noise unless forced.
 */
export async function logBetOutcome({
  profileId,
  gameId,
  betCents,
  payoutCents,
  multiplier,
  status,
  betId,
  phase, // 'settle' | 'resolve' | 'place'
  balanceCents,
  lockedCents,
  idempotent,
}) {
  if (idempotent) return;
  if (status === 'cancelled') return;

  const { profile, wallet } = await fetchProfileBundle(profileId);
  const stake = Number(betCents) || 0;
  const payout = Number(payoutCents) || 0;
  const net = payout - (phase === 'resolve' ? 0 : stake);
  // For resolve: stake already deducted at place; net profit = payout - stake for display
  const profit = phase === 'resolve'
    ? payout - stake
    : payout - stake;

  const isWin = status === 'won' || status === 'cashed_out' || (payout > 0 && status !== 'lost');
  const isLoss = status === 'lost' || (payout === 0 && status !== 'push');

  let title;
  if (status === 'push') title = '🤝 <b>ПУШ</b>';
  else if (isWin && profit >= 5000) title = '🚀 <b>КРУПНЫЙ ВЫИГРЫШ</b>';
  else if (isWin) title = '🟢 <b>ВЫИГРЫШ</b>';
  else if (isLoss) title = '🔴 <b>ПРОИГРЫШ</b>';
  else title = '🎲 <b>СТАВКА</b>';

  const walletSnap = wallet
    ? {
        ...wallet,
        balance_cents: balanceCents ?? wallet.balance_cents,
        locked_cents: lockedCents ?? wallet.locked_cents,
      }
    : null;

  await notifyLog([
    title,
    formatPlayerLine(profile, walletSnap),
    '',
    `Игра: <b>${escapeHtml(String(gameId || '?').toUpperCase())}</b>`,
    `Статус: <code>${escapeHtml(status)}</code>`,
    `Ставка: <b>${formatUsd(stake)}</b>`,
    `Множитель: <b>${Number(multiplier || 0).toFixed(2)}x</b>`,
    `Выплата: <b>${formatUsd(payout)}</b>`,
    `Профит: <b>${formatUsd(profit)}</b>`,
    balanceCents != null ? `Баланс после: <b>${formatUsd(balanceCents)}</b>` : null,
    `Всего поставл.: ${formatUsd(wallet?.total_wagered_cents)} · выиграно ${formatUsd(wallet?.total_won_cents)} · проиграно ${formatUsd(wallet?.total_lost_cents)}`,
    betId ? `Bet: <code>${escapeHtml(betId)}</code>` : null,
  ].filter(Boolean).join('\n'));
}

export async function logBetPlaced({
  profileId,
  gameId,
  betCents,
  betId,
  balanceCents,
  lockedCents,
  idempotent,
}) {
  if (idempotent) return;
  // Only log crash places (open bets) — compact
  const { profile, wallet } = await fetchProfileBundle(profileId);
  const walletSnap = wallet
    ? {
        ...wallet,
        balance_cents: balanceCents ?? wallet.balance_cents,
        locked_cents: lockedCents ?? wallet.locked_cents,
      }
    : null;
  await notifyLog([
    '📌 <b>СТАВКА ОТКРЫТА</b>',
    formatPlayerLine(profile, walletSnap),
    '',
    `Игра: <b>${escapeHtml(String(gameId || '?').toUpperCase())}</b>`,
    `Сумма: <b>${formatUsd(betCents)}</b>`,
    balanceCents != null ? `Баланс после списания: <b>${formatUsd(balanceCents)}</b>` : null,
    betId ? `Bet: <code>${escapeHtml(betId)}</code>` : null,
  ].filter(Boolean).join('\n'));
}

export default {
  setLogBot,
  getLogBot,
  notifyLog,
  logDepositCredited,
  logWithdrawRequest,
  logWithdrawProcessed,
  logWelcomeBonus,
  logSupportTicket,
  logStarsTopup,
  logBetOutcome,
  logBetPlaced,
};
