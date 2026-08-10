/**
 * Structured event logs → Telegram channel/group (LOG_CHAT_ID / @dbdjdjd66).
 */
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { getSupabaseAdmin } from '../database/supabase.js';

let _bot = null;

export function setLogBot(bot) {
  _bot = bot;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatUserLabel(profile) {
  if (!profile) return '—';
  if (profile.username) return `@${escapeHtml(profile.username)}`;
  if (profile.first_name) return escapeHtml(profile.first_name);
  if (profile.telegram_id) return `tg:${profile.telegram_id}`;
  return '—';
}

export async function notifyLog(html) {
  const chatId = config.logChatId;
  if (!_bot || !chatId) return;
  try {
    await _bot.telegram.sendMessage(chatId, html, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
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
    .select('id, telegram_id, username, first_name')
    .eq('id', profileId)
    .maybeSingle();
  return data;
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
}) {
  if (idempotent) return;

  const profile = await fetchProfile(profileId);
  const usd = ((amountCents ?? 0) / 100).toFixed(2);
  await notifyLog([
    '💰 <b>ДЕПОЗИТ</b>',
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    `Сумма: <b>$${usd}</b>`,
    `Провайдер: <b>${escapeHtml(provider || '?')}</b>`,
    cryptoAmount != null ? `Крипто: <code>${escapeHtml(cryptoAmount)}</code>` : null,
    `Deposit: <code>${escapeHtml(depositId)}</code>`,
    externalId ? `Ext: <code>${escapeHtml(externalId)}</code>` : null,
  ].filter(Boolean).join('\n'));

  // Referral commission created inside gg_complete_deposit
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
    const refProfile = await fetchProfile(row.profile_id);
    const friend = formatUserLabel(profile);
    await notifyLog([
      '🎁 <b>РЕФЕРАЛ 20%</b>',
      `Реферер: ${formatUserLabel(refProfile)} (<code>${refProfile?.telegram_id ?? '?'}</code>)`,
      `От депозита: ${friend}`,
      `Начислено: <b>$${(row.amount_cents / 100).toFixed(2)}</b>`,
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
  const profile = await fetchProfile(profileId);
  await notifyLog([
    '💸 <b>ЗАЯВКА НА ВЫВОД</b>',
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    `Сумма: <b>$${Number(amountUsd).toFixed(2)}</b> ${escapeHtml(asset)}`,
    `Адрес: <code>${escapeHtml(address)}</code>`,
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
  const profile = await fetchProfile(profileId);
  const title = status === 'approved' ? '✅ ВЫВОД ВЫПЛАЧЕН' : '❌ ВЫВОД ОТКЛОНЁН';
  await notifyLog([
    `<b>${title}</b>`,
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    `Сумма: <b>$${((amountCents ?? 0) / 100).toFixed(2)}</b>`,
    `Админ: <code>${adminId ?? '?'}</code>`,
    reason ? `Причина: ${escapeHtml(reason)}` : null,
    `ID: <code>${escapeHtml(withdrawalId)}</code>`,
  ].filter(Boolean).join('\n'));
}

export async function logWelcomeBonus({ profileId, amountCents, alreadyClaimed }) {
  if (alreadyClaimed || !amountCents) return;
  const profile = await fetchProfile(profileId);
  await notifyLog([
    '🎡 <b>БОНУС КОЛЕСО</b>',
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    `Выигрыш: <b>$${((amountCents ?? 0) / 100).toFixed(2)}</b>`,
  ].join('\n'));
}

export async function logSupportTicket({ ticketId, profile, message }) {
  await notifyLog([
    '🆘 <b>ТИКЕТ ПОДДЕРЖКИ</b>',
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    '',
    escapeHtml(message).slice(0, 800),
    '',
    `Тикет: <code>${escapeHtml(ticketId)}</code>`,
  ].join('\n'));
}

export async function logStarsTopup({ profileId, starsAmount, usdCents, idempotent }) {
  if (idempotent) return;
  const profile = await fetchProfile(profileId);
  await notifyLog([
    '⭐ <b>STARS ПОПОЛНЕНИЕ</b>',
    `Игрок: ${formatUserLabel(profile)} (<code>${profile?.telegram_id ?? '?'}</code>)`,
    `Stars: <b>${starsAmount}</b> → <b>$${((usdCents ?? 0) / 100).toFixed(2)}</b>`,
  ].join('\n'));
}

export default {
  setLogBot,
  notifyLog,
  logDepositCredited,
  logWithdrawRequest,
  logWithdrawProcessed,
  logWelcomeBonus,
  logSupportTicket,
  logStarsTopup,
};
