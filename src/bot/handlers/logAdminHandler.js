/**
 * Admin analytics commands for the log channel (@dbdjdjd66) and admin DMs.
 *
 * /help /user /bets /ledger /deps /wds /stats /online /top /search /balance /ref
 */
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { getSupabaseAdmin } from '../../database/supabase.js';
import {
  escapeHtml,
  formatUsd,
  formatUserLabel,
  formatPlayerLine,
  fetchProfile,
  fetchWallet,
  fetchProfileByTelegramId,
  notifyLog,
} from '../../services/telegramLog.js';
import { runDailyBonusNotify } from '../../services/dailyBonusNotify.js';

const TG_LIMIT = 3900;

function isAdminUser(telegramId) {
  return config.admin.ids.includes(Number(telegramId));
}

/** Allow commands in private admin DM or in the configured log chat */
function isAllowedChat(ctx) {
  const chat = ctx.chat;
  if (!chat) return false;
  if (chat.type === 'private' && isAdminUser(ctx.from?.id)) return true;

  const logId = String(config.logChatId || '').trim();
  if (!logId) return false;

  // Match @username (channel/supergroup)
  if (logId.startsWith('@')) {
    const uname = logId.slice(1).toLowerCase();
    if ((chat.username || '').toLowerCase() === uname) return true;
  }

  // Match numeric id
  if (String(chat.id) === logId) return true;

  return false;
}

async function replyChunks(ctx, html) {
  const text = String(html ?? '');
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const send = async (chunk) => {
    // channel_post: ctx.reply can fail; sendMessage is reliable for both
    await ctx.telegram.sendMessage(chatId, chunk, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  };

  if (text.length <= TG_LIMIT) {
    await send(text);
    return;
  }
  let rest = text;
  let part = 1;
  while (rest.length > 0 && part <= 10) {
    let chunk = rest.slice(0, TG_LIMIT);
    const cut = chunk.lastIndexOf('\n');
    if (cut > TG_LIMIT * 0.55) chunk = chunk.slice(0, cut);
    await send(part === 1 ? chunk : `…(${part})\n${chunk}`);
    rest = rest.slice(chunk.length);
    part += 1;
  }
}

function getCommandText(ctx) {
  return (
    ctx.message?.text ||
    ctx.channelPost?.text ||
    ctx.update?.channel_post?.text ||
    ''
  );
}

function parseCommand(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return null;
  // /help@BotName args...
  const m = raw.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return {
    command: m[1].toLowerCase(),
    args: (m[2] || '').trim(),
    arg0: (m[2] || '').trim().split(/\s+/)[0] || '',
  };
}

function parseArgId(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith('@')) s = s.slice(1);
  return s;
}

/** Resolve profile by tg id / @username / uuid */
async function resolveProfile(raw) {
  const sb = getSupabaseAdmin();
  if (!sb || !raw) return null;
  const q = parseArgId(raw);

  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
    return fetchProfile(q);
  }
  // Numeric telegram id
  if (/^\d+$/.test(q)) {
    return fetchProfileByTelegramId(q);
  }
  // Username
  const { data } = await sb
    .from('gg_profiles')
    .select('id, telegram_id, username, first_name, last_name, vip_level, vip_xp, referrer_telegram_id, created_at, last_seen_at, welcome_bonus_claimed_at, is_blocked')
    .ilike('username', q)
    .limit(1)
    .maybeSingle();
  return data;
}

function fmtTs(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return String(iso);
  }
}

const HELP_TEXT = `
🛠 <b>GunGad Admin — команды</b>

Пиши в этом канале или в ЛС боту (если ты в ADMIN_IDS).

<b>Игрок</b>
/user TG_ID | @nick | uuid — полный досье
/balance ID — баланс и totals
/bets ID [n] — последние ставки (default 15)
/wins ID [n] — только выигрыши
/losses ID [n] — только проигрыши
/ledger ID [n] — ledger (деньги)
/deps ID [n] — депозиты
/wds ID [n] — выводы
/ref ID — реферер и рефералы
/tickets ID — тикеты поддержки

<b>Поиск / топы</b>
/search текст — поиск по username / имени / tg id
/top wagered|won|lost|deposited|withdrawn|balance [n]
/online — сколько онлайн
/stats — сводка казино
/bigwins [n] — крупные выигрыши (профит ≥ $10)

<b>Рассылка</b>
/bonuspush — ежедневное уведомление про колесо (если ещё не уходило сегодня)
/bonuspush force — отправить ещё раз сегодня

<b>Выводы / поддержка</b>
/wdok UUID — подтвердить вывод
/wdno UUID [причина] — отклонить (средства на баланс)
/reply UUID текст — ответ в поддержку

<b>Прочее</b>
/help — это меню
/ping — проверка бота

Пример: <code>/user 123456789</code>
`.trim();

async function cmdHelp(ctx) {
  await replyChunks(ctx, HELP_TEXT);
}

async function cmdPing(ctx) {
  await replyChunks(
    ctx,
    `pong · chat=<code>${ctx.chat?.id}</code> · you=<code>${ctx.from?.id ?? 'channel'}</code>`,
  );
}

async function cmdBonusPush(ctx) {
  const force = parseCommand(getCommandText(ctx))?.arg0?.toLowerCase() === 'force';
  await replyChunks(
    ctx,
    force
      ? '📣 Принудительная рассылка колеса…'
      : '📣 Рассылка колеса (если ещё не было сегодня)…',
  );
  const result = await runDailyBonusNotify({ telegram: ctx.telegram }, { force });
  if (result?.skipped) {
    await replyChunks(
      ctx,
      `Сегодня уже отправляли (<code>${escapeHtml(result.runDate || '')}</code>).\nПовтор: <code>/bonuspush force</code>`,
    );
    return;
  }
  if (!result?.ok) {
    await replyChunks(ctx, `Не вышло: ${escapeHtml(result?.reason || 'unknown')}`);
    return;
  }
  await replyChunks(
    ctx,
    `Готово · sent=<b>${result.sent ?? 0}</b> · skip=<b>${result.skipped ?? 0}</b> · fail=<b>${result.fail ?? 0}</b>`,
  );
}

async function buildUserDossier(profile) {
  const sb = getSupabaseAdmin();
  const wallet = await fetchWallet(profile.id);

  const [
    betsCount,
    winsCount,
    lossesCount,
    deps,
    wds,
    lastBets,
    lastDeps,
    lastWds,
    tickets,
    refs,
  ] = await Promise.all([
    sb.from('gg_bets').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id),
    sb.from('gg_bets').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id).in('status', ['won', 'cashed_out']),
    sb.from('gg_bets').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('status', 'lost'),
    sb.from('gg_deposit_requests').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('status', 'completed'),
    sb.from('gg_withdrawals').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id),
    sb.from('gg_bets').select('game_id, status, bet_cents, payout_cents, multiplier, created_at, settled_at')
      .eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(8),
    sb.from('gg_deposit_requests').select('amount_usd_cents, status, provider, created_at, completed_at, external_id')
      .eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(5),
    sb.from('gg_withdrawals').select('amount_usd_cents, status, asset, created_at, processed_at')
      .eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(5),
    sb.from('gg_support_tickets').select('id, status, created_at').eq('profile_id', profile.id)
      .order('created_at', { ascending: false }).limit(5),
    sb.from('gg_profiles').select('telegram_id, username, first_name', { count: 'exact' })
      .eq('referrer_telegram_id', profile.telegram_id).limit(10),
  ]);

  const net = (wallet?.total_won_cents ?? 0) - (wallet?.total_wagered_cents ?? 0);
  // Player liability estimate from house view
  const houseRough =
    (wallet?.total_deposited_cents ?? 0) -
    (wallet?.total_withdrawn_cents ?? 0) -
    (wallet?.balance_cents ?? 0);

  const lines = [
    '👤 <b>ДОСЬЕ ИГРОКА</b>',
    formatPlayerLine(profile, wallet),
    `Создан: ${fmtTs(profile.created_at)}`,
    `Last seen: ${fmtTs(profile.last_seen_at)}`,
    `Бонус колесо: ${profile.welcome_bonus_claimed_at ? `получен ${fmtTs(profile.welcome_bonus_claimed_at)}` : 'не получен'}`,
    `Блок: ${profile.is_blocked ? '🚫 ДА' : 'нет'}`,
    profile.referrer_telegram_id
      ? `Реферер TG: <code>${profile.referrer_telegram_id}</code>`
      : 'Реферер: —',
    '',
    '<b>Кошелёк</b>',
    `Stars: ${wallet?.stars_balance ?? 0}`,
    `Wagered: <b>${formatUsd(wallet?.total_wagered_cents)}</b>`,
    `Won: <b>${formatUsd(wallet?.total_won_cents)}</b>`,
    `Lost: <b>${formatUsd(wallet?.total_lost_cents)}</b>`,
    `Deposited: <b>${formatUsd(wallet?.total_deposited_cents)}</b>`,
    `Withdrawn: <b>${formatUsd(wallet?.total_withdrawn_cents)}</b>`,
    `Net (won−wagered): <b>${formatUsd(net)}</b>`,
    `Оценка house (dep−wd−bal): <b>${formatUsd(houseRough)}</b>`,
    '',
    '<b>Счётчики</b>',
    `Ставок: ${betsCount.count ?? 0} · побед: ${winsCount.count ?? 0} · поражений: ${lossesCount.count ?? 0}`,
    `Депозитов OK: ${deps.count ?? 0} · заявок вывода: ${wds.count ?? 0}`,
    `Рефералов: ${refs.count ?? 0}`,
  ];

  if (lastBets.data?.length) {
    lines.push('', '<b>Последние ставки</b>');
    for (const b of lastBets.data) {
      const profit = (b.payout_cents ?? 0) - (b.bet_cents ?? 0);
      lines.push(
        `· ${escapeHtml(b.game_id)} ${escapeHtml(b.status)} bet ${formatUsd(b.bet_cents)} → ${formatUsd(b.payout_cents)} (${Number(b.multiplier || 0).toFixed(2)}x, P/L ${formatUsd(profit)}) · ${fmtTs(b.settled_at || b.created_at)}`,
      );
    }
  }

  if (lastDeps.data?.length) {
    lines.push('', '<b>Депозиты</b>');
    for (const d of lastDeps.data) {
      lines.push(
        `· ${escapeHtml(d.status)} ${formatUsd(d.amount_usd_cents)} ${escapeHtml(d.provider || '')} · ${fmtTs(d.completed_at || d.created_at)}`,
      );
    }
  }

  if (lastWds.data?.length) {
    lines.push('', '<b>Выводы</b>');
    for (const w of lastWds.data) {
      lines.push(
        `· ${escapeHtml(w.status)} ${formatUsd(w.amount_usd_cents)} ${escapeHtml(w.asset || '')} · ${fmtTs(w.processed_at || w.created_at)}`,
      );
    }
  }

  if (tickets.data?.length) {
    lines.push('', '<b>Тикеты</b>');
    for (const t of tickets.data) {
      lines.push(`· ${escapeHtml(t.status)} <code>${t.id}</code> · ${fmtTs(t.created_at)}`);
    }
  }

  if (refs.data?.length) {
    lines.push('', '<b>Рефералы (до 10)</b>');
    for (const r of refs.data) {
      lines.push(`· ${formatUserLabel(r)} (<code>${r.telegram_id}</code>)`);
    }
  }

  return lines.join('\n');
}

async function cmdUser(ctx) {
  const arg = parseCommand(getCommandText(ctx))?.arg0;
  if (!arg) {
    await replyChunks(ctx, 'Использование: <code>/user TG_ID</code> или <code>/user @nick</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, `❌ Игрок не найден: <code>${escapeHtml(arg)}</code>`);
    return;
  }
  await replyChunks(ctx, await buildUserDossier(profile));
}

async function cmdBalance(ctx) {
  const arg = parseCommand(getCommandText(ctx))?.arg0;
  if (!arg) {
    await replyChunks(ctx, 'Использование: <code>/balance TG_ID</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const wallet = await fetchWallet(profile.id);
  await replyChunks(ctx, [
    '💼 <b>БАЛАНС</b>',
    formatPlayerLine(profile, wallet),
    `Wagered ${formatUsd(wallet?.total_wagered_cents)} · Won ${formatUsd(wallet?.total_won_cents)} · Lost ${formatUsd(wallet?.total_lost_cents)}`,
    `Dep ${formatUsd(wallet?.total_deposited_cents)} · WD ${formatUsd(wallet?.total_withdrawn_cents)}`,
  ].join('\n'));
}

async function listBets(ctx, filter) {
  const parsed = parseCommand(getCommandText(ctx));
  const arg = parsed?.arg0;
  const n = Math.min(Math.max(parseInt((parsed?.args || '').split(/\s+/)[1] || '15', 10) || 15, 1), 40);
  if (!arg) {
    await replyChunks(ctx, 'Нужен id: <code>/bets TG_ID</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const sb = getSupabaseAdmin();
  let q = sb
    .from('gg_bets')
    .select('id, game_id, status, bet_cents, payout_cents, multiplier, created_at, settled_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(n);
  if (filter === 'wins') q = q.in('status', ['won', 'cashed_out']);
  if (filter === 'losses') q = q.eq('status', 'lost');
  const { data, error } = await q;
  if (error) {
    await replyChunks(ctx, `Ошибка: ${escapeHtml(error.message)}`);
    return;
  }
  const title = filter === 'wins' ? 'ВЫИГРЫШИ' : filter === 'losses' ? 'ПРОИГРЫШИ' : 'СТАВКИ';
  const lines = [
    `📜 <b>${title}</b> · ${formatUserLabel(profile)} (<code>${profile.telegram_id}</code>)`,
    `Показано: ${data?.length ?? 0}`,
    '',
  ];
  for (const b of data || []) {
    const profit = (b.payout_cents ?? 0) - (b.bet_cents ?? 0);
    lines.push(
      `${escapeHtml(b.game_id)} · ${escapeHtml(b.status)} · bet ${formatUsd(b.bet_cents)} → pay ${formatUsd(b.payout_cents)} · ${Number(b.multiplier || 0).toFixed(2)}x · P/L ${formatUsd(profit)}`,
      `<code>${b.id}</code> · ${fmtTs(b.settled_at || b.created_at)}`,
      '',
    );
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function cmdLedger(ctx) {
  const parsed = parseCommand(getCommandText(ctx));
  const arg = parsed?.arg0;
  const n = Math.min(Math.max(parseInt((parsed?.args || '').split(/\s+/)[1] || '20', 10) || 20, 1), 50);
  if (!arg) {
    await replyChunks(ctx, 'Использование: <code>/ledger TG_ID [n]</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('gg_ledger')
    .select('kind, amount_cents, balance_after_cents, created_at, idempotency_key, meta')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(n);
  if (error) {
    await replyChunks(ctx, `Ошибка: ${escapeHtml(error.message)}`);
    return;
  }
  const lines = [
    `📒 <b>LEDGER</b> · ${formatUserLabel(profile)} (<code>${profile.telegram_id}</code>)`,
    '',
  ];
  for (const row of data || []) {
    lines.push(
      `${escapeHtml(row.kind)} · ${formatUsd(row.amount_cents)} → bal ${formatUsd(row.balance_after_cents)} · ${fmtTs(row.created_at)}`,
    );
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function cmdDeps(ctx) {
  const parsed = parseCommand(getCommandText(ctx));
  const arg = parsed?.arg0;
  const n = Math.min(Math.max(parseInt((parsed?.args || '').split(/\s+/)[1] || '15', 10) || 15, 1), 40);
  if (!arg) {
    await replyChunks(ctx, 'Нужен id: <code>/deps TG_ID</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('gg_deposit_requests')
    .select('id, amount_usd_cents, status, provider, crypto_asset, crypto_amount, external_id, created_at, completed_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(n);
  const lines = [`💰 <b>ДЕПОЗИТЫ</b> · ${formatUserLabel(profile)} (<code>${profile.telegram_id}</code>)`, ''];
  for (const d of data || []) {
    lines.push(
      `${escapeHtml(d.status)} · ${formatUsd(d.amount_usd_cents)} · ${escapeHtml(d.provider || '')} ${escapeHtml(d.crypto_asset || '')}`,
      `id <code>${d.id}</code> ext <code>${escapeHtml(d.external_id || '—')}</code>`,
      fmtTs(d.completed_at || d.created_at),
      '',
    );
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function cmdWds(ctx) {
  const parsed = parseCommand(getCommandText(ctx));
  const arg = parsed?.arg0;
  const n = Math.min(Math.max(parseInt((parsed?.args || '').split(/\s+/)[1] || '15', 10) || 15, 1), 40);
  if (!arg) {
    await replyChunks(ctx, 'Нужен id: <code>/wds TG_ID</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('gg_withdrawals')
    .select('id, amount_usd_cents, status, asset, recipient_address, reject_reason, created_at, processed_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(n);
  const lines = [`💸 <b>ВЫВОДЫ</b> · ${formatUserLabel(profile)} (<code>${profile.telegram_id}</code>)`, ''];
  for (const w of data || []) {
    lines.push(
      `${escapeHtml(w.status)} · ${formatUsd(w.amount_usd_cents)} · ${escapeHtml(w.asset || '')}`,
      `<code>${escapeHtml(w.recipient_address || '')}</code>`,
      w.reject_reason ? `Причина: ${escapeHtml(w.reject_reason)}` : null,
      `id <code>${w.id}</code> · ${fmtTs(w.processed_at || w.created_at)}`,
      '',
    );
  }
  await replyChunks(ctx, lines.filter(Boolean).join('\n'));
}

async function cmdRef(ctx) {
  const arg = parseCommand(getCommandText(ctx))?.arg0;
  if (!arg) {
    await replyChunks(ctx, 'Нужен id: <code>/ref TG_ID</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const sb = getSupabaseAdmin();
  let referrer = null;
  if (profile.referrer_telegram_id) {
    referrer = await fetchProfileByTelegramId(profile.referrer_telegram_id);
  }
  const { data: kids, count } = await sb
    .from('gg_profiles')
    .select('telegram_id, username, first_name, created_at', { count: 'exact' })
    .eq('referrer_telegram_id', profile.telegram_id)
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: refLedger } = await sb
    .from('gg_ledger')
    .select('amount_cents')
    .eq('profile_id', profile.id)
    .eq('kind', 'referral');
  const earned = (refLedger || []).reduce((s, r) => s + (r.amount_cents || 0), 0);

  const lines = [
    '🎁 <b>РЕФЕРАЛЫ</b>',
    formatPlayerLine(profile, await fetchWallet(profile.id)),
    referrer
      ? `Реферер: ${formatUserLabel(referrer)} (<code>${referrer.telegram_id}</code>)`
      : 'Реферер: —',
    `Заработано referral: <b>${formatUsd(earned)}</b>`,
    `Приглашено: <b>${count ?? 0}</b>`,
    '',
  ];
  for (const k of kids || []) {
    lines.push(`· ${formatUserLabel(k)} (<code>${k.telegram_id}</code>) · ${fmtTs(k.created_at)}`);
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function cmdTickets(ctx) {
  const arg = parseCommand(getCommandText(ctx))?.arg0;
  if (!arg) {
    await replyChunks(ctx, 'Нужен id: <code>/tickets TG_ID</code>');
    return;
  }
  const profile = await resolveProfile(arg);
  if (!profile) {
    await replyChunks(ctx, '❌ Не найден');
    return;
  }
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('gg_support_tickets')
    .select('id, status, message, reply_text, created_at, replied_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(15);
  const lines = [`🆘 <b>ТИКЕТЫ</b> · ${formatUserLabel(profile)}`, ''];
  for (const t of data || []) {
    lines.push(
      `${escapeHtml(t.status)} <code>${t.id}</code> · ${fmtTs(t.created_at)}`,
      escapeHtml((t.message || '').slice(0, 200)),
      t.reply_text ? `↳ ${escapeHtml(String(t.reply_text).slice(0, 200))}` : null,
      '',
    );
  }
  await replyChunks(ctx, lines.filter(Boolean).join('\n'));
}

async function cmdSearch(ctx) {
  const q = (parseCommand(getCommandText(ctx))?.args || '').trim();
  if (!q || q.length < 2) {
    await replyChunks(ctx, 'Использование: <code>/search username</code>');
    return;
  }
  const sb = getSupabaseAdmin();
  let rows = [];
  if (/^\d+$/.test(q)) {
    const p = await fetchProfileByTelegramId(q);
    if (p) rows = [p];
  } else {
    const { data } = await sb
      .from('gg_profiles')
      .select('id, telegram_id, username, first_name, last_name, vip_level, created_at')
      .or(`username.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20);
    rows = data || [];
  }
  if (!rows.length) {
    await replyChunks(ctx, 'Никого не нашёл');
    return;
  }
  const lines = ['🔎 <b>ПОИСК</b>', `Запрос: <code>${escapeHtml(q)}</code>`, ''];
  for (const p of rows) {
    lines.push(
      `${formatUserLabel(p)} · tg <code>${p.telegram_id}</code> · VIP L${p.vip_level ?? 1}`,
      `<code>${p.id}</code>`,
      '',
    );
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function cmdTop(ctx) {
  const parsed = parseCommand(getCommandText(ctx));
  const parts = (parsed?.args || '').trim().split(/\s+/).filter(Boolean);
  const fieldMap = {
    wagered: 'total_wagered_cents',
    won: 'total_won_cents',
    lost: 'total_lost_cents',
    deposited: 'total_deposited_cents',
    withdrawn: 'total_withdrawn_cents',
    balance: 'balance_cents',
  };
  const key = (parts[0] || 'wagered').toLowerCase();
  const col = fieldMap[key] || fieldMap.wagered;
  const n = Math.min(Math.max(parseInt(parts[1] || '10', 10) || 10, 1), 25);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('gg_wallets')
    .select(`profile_id, ${col}, balance_cents, gg_profiles!inner(telegram_id, username, first_name)`)
    .order(col, { ascending: false })
    .limit(n);
  if (error) {
    const { data: wallets } = await sb.from('gg_wallets').select(`profile_id, ${col}, balance_cents`).order(col, { ascending: false }).limit(n);
    const lines = [`🏆 <b>TOP ${escapeHtml(key)}</b>`, ''];
    let i = 1;
    for (const w of wallets || []) {
      const p = await fetchProfile(w.profile_id);
      lines.push(`${i}. ${formatUserLabel(p)} (<code>${p?.telegram_id}</code>) — <b>${formatUsd(w[col])}</b>`);
      i += 1;
    }
    await replyChunks(ctx, lines.join('\n'));
    return;
  }
  const lines = [`🏆 <b>TOP ${escapeHtml(key)}</b>`, ''];
  let i = 1;
  for (const w of data || []) {
    const p = w.gg_profiles;
    lines.push(
      `${i}. ${formatUserLabel(p)} (<code>${p?.telegram_id}</code>) — <b>${formatUsd(w[col])}</b>`,
    );
    i += 1;
  }
  await replyChunks(ctx, lines.join('\n'));
}

async function cmdOnline(ctx) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('gg_online_count');
  if (error) {
    await replyChunks(ctx, `Ошибка: ${escapeHtml(error.message)}`);
    return;
  }
  const count = typeof data === 'number' ? data : data?.count ?? data;
  await replyChunks(ctx, `🟢 Онлайн сейчас: <b>${escapeHtml(String(count))}</b>`);
}

async function cmdStats(ctx) {
  const sb = getSupabaseAdmin();
  const [
    profiles,
    walletsAgg,
    bets,
    deps,
    wds,
    online,
  ] = await Promise.all([
    sb.from('gg_profiles').select('id', { count: 'exact', head: true }),
    sb.from('gg_wallets').select('balance_cents, total_wagered_cents, total_won_cents, total_lost_cents, total_deposited_cents, total_withdrawn_cents'),
    sb.from('gg_bets').select('id', { count: 'exact', head: true }),
    sb.from('gg_deposit_requests').select('amount_usd_cents, status').eq('status', 'completed'),
    sb.from('gg_withdrawals').select('amount_usd_cents, status'),
    sb.rpc('gg_online_count'),
  ]);

  let bal = 0, wag = 0, won = 0, lost = 0, depW = 0, wdW = 0;
  for (const w of walletsAgg.data || []) {
    bal += w.balance_cents || 0;
    wag += w.total_wagered_cents || 0;
    won += w.total_won_cents || 0;
    lost += w.total_lost_cents || 0;
    depW += w.total_deposited_cents || 0;
    wdW += w.total_withdrawn_cents || 0;
  }
  let depSum = 0;
  for (const d of deps.data || []) depSum += d.amount_usd_cents || 0;
  let wdPending = 0;
  let wdDone = 0;
  for (const w of wds.data || []) {
    if (w.status === 'pending') wdPending += w.amount_usd_cents || 0;
    if (w.status === 'approved' || w.status === 'completed') wdDone += w.amount_usd_cents || 0;
  }
  const onlineCount = typeof online.data === 'number' ? online.data : online.data?.count ?? online.data ?? '?';

  await replyChunks(ctx, [
    '📊 <b>СВОДКА КАЗИНО</b>',
    `Игроков: <b>${profiles.count ?? 0}</b>`,
    `Онлайн: <b>${escapeHtml(String(onlineCount))}</b>`,
    `Ставок всего: <b>${bets.count ?? 0}</b>`,
    '',
    `Сумма балансов: <b>${formatUsd(bal)}</b>`,
    `Wagered: <b>${formatUsd(wag)}</b>`,
    `Won: <b>${formatUsd(won)}</b>`,
    `Lost: <b>${formatUsd(lost)}</b>`,
    `Deposited (wallets): <b>${formatUsd(depW)}</b>`,
    `Withdrawn (wallets): <b>${formatUsd(wdW)}</b>`,
    `Deposits completed sum: <b>${formatUsd(depSum)}</b>`,
    `Withdrawals pending: <b>${formatUsd(wdPending)}</b>`,
    `Withdrawals paid: <b>${formatUsd(wdDone)}</b>`,
    `House rough (dep−wd−bal): <b>${formatUsd(depW - wdW - bal)}</b>`,
  ].join('\n'));
}

async function cmdBigWins(ctx) {
  const n = Math.min(Math.max(parseInt(parseCommand(getCommandText(ctx))?.arg0 || '15', 10) || 15, 1), 40);
  const sb = getSupabaseAdmin();
  // payout meaningfully above bet
  const { data } = await sb
    .from('gg_bets')
    .select('id, profile_id, game_id, status, bet_cents, payout_cents, multiplier, settled_at, created_at')
    .in('status', ['won', 'cashed_out'])
    .order('settled_at', { ascending: false })
    .limit(80);

  const big = (data || [])
    .map((b) => ({ ...b, profit: (b.payout_cents || 0) - (b.bet_cents || 0) }))
    .filter((b) => b.profit >= 1000)
    .slice(0, n);

  const lines = [`🚀 <b>КРУПНЫЕ ВЫИГРЫШИ</b> (профит ≥ $10)`, ''];
  for (const b of big) {
    const p = await fetchProfile(b.profile_id);
    lines.push(
      `${formatUserLabel(p)} (<code>${p?.telegram_id}</code>) · ${escapeHtml(b.game_id)} · ${Number(b.multiplier || 0).toFixed(2)}x`,
      `bet ${formatUsd(b.bet_cents)} → ${formatUsd(b.payout_cents)} · P/L <b>${formatUsd(b.profit)}</b>`,
      fmtTs(b.settled_at || b.created_at),
      '',
    );
  }
  if (!big.length) lines.push('Пока пусто');
  await replyChunks(ctx, lines.join('\n'));
}

function wrap(handler) {
  return async (ctx, next) => {
    try {
      if (isAllowedChat(ctx)) await handler(ctx);
    } catch (e) {
      logger.error(`[logAdmin] ${handler.name || 'cmd'}: ${e?.message || e}`);
      try {
        await replyChunks(ctx, `❌ Ошибка: ${escapeHtml(e?.message || e)}`);
      } catch {
        /* ignore */
      }
    }
    if (typeof next === 'function') return next();
  };
}

async function cmdWdOk(ctx) {
  const parsed = parseCommand(getCommandText(ctx));
  const id = parseArgId(parsed?.arg0);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    await replyChunks(ctx, 'Использование: <code>/wdok UUID</code>');
    return;
  }
  const sb = getSupabaseAdmin();
  if (!sb) {
    await replyChunks(ctx, 'БД недоступна');
    return;
  }
  const { data, error } = await sb.rpc('gg_process_withdrawal', {
    p_withdrawal_id: id,
    p_action: 'approved',
    p_admin_telegram_id: ctx.from?.id || null,
  });
  if (error) {
    await replyChunks(ctx, `Ошибка: ${escapeHtml(error.message)}`);
    return;
  }
  if (!data?.ok) {
    await replyChunks(ctx, `Уже обработана (${escapeHtml(data?.status)})`);
    return;
  }
  await replyChunks(ctx, `✅ Вывод <code>${escapeHtml(id)}</code> подтверждён`);
}

async function cmdWdNo(ctx) {
  const parsed = parseCommand(getCommandText(ctx));
  const raw = (parsed?.args || '').trim();
  const m = raw.match(/^([0-9a-f-]{36})(?:\s+([\s\S]+))?/i);
  if (!m) {
    await replyChunks(ctx, 'Использование: <code>/wdno UUID [причина]</code>');
    return;
  }
  const reason = !m[2] || m[2].trim() === '-' ? null : m[2].trim();
  const sb = getSupabaseAdmin();
  if (!sb) {
    await replyChunks(ctx, 'БД недоступна');
    return;
  }
  const { data, error } = await sb.rpc('gg_process_withdrawal', {
    p_withdrawal_id: m[1],
    p_action: 'rejected',
    p_admin_telegram_id: ctx.from?.id || null,
    p_reason: reason,
  });
  if (error) {
    await replyChunks(ctx, `Ошибка: ${escapeHtml(error.message)}`);
    return;
  }
  if (!data?.ok) {
    await replyChunks(ctx, `Уже обработана (${escapeHtml(data?.status)})`);
    return;
  }
  await replyChunks(ctx, `❌ Вывод отклонён, средства на балансе игрока`);
}

const COMMAND_MAP = {
  help: cmdHelp,
  ping: cmdPing,
  user: cmdUser,
  balance: cmdBalance,
  bets: (ctx) => listBets(ctx, 'all'),
  wins: (ctx) => listBets(ctx, 'wins'),
  losses: (ctx) => listBets(ctx, 'losses'),
  ledger: cmdLedger,
  deps: cmdDeps,
  wds: cmdWds,
  ref: cmdRef,
  tickets: cmdTickets,
  search: cmdSearch,
  top: cmdTop,
  online: cmdOnline,
  stats: cmdStats,
  bigwins: cmdBigWins,
  bonuspush: cmdBonusPush,
  wdok: cmdWdOk,
  wdno: cmdWdNo,
};

async function dispatchAdminCommand(ctx) {
  const text = getCommandText(ctx);
  if (!text.startsWith('/')) return;
  const parsed = parseCommand(text);
  if (!parsed) return;
  const fn = COMMAND_MAP[parsed.command];
  if (!fn) return;
  await fn(ctx);
}

export function registerLogAdminHandlers(bot) {
  const run = wrap(dispatchAdminCommand);

  // Channels post as channel_post (NOT message) — this is why /help was silent in @dbdjdjd66
  bot.on('channel_post', run);
  bot.on('edited_channel_post', run);
  // Private chats / groups
  bot.on('message', run);

  logger.info('✅ Log-channel admin analytics commands registered (message + channel_post)');
}

export async function maybeAnnounceCommandsOnline() {
  try {
    await notifyLog([
      '🛠 <b>Admin-команды онлайн</b>',
      'Напиши <code>/help</code> в этом чате — полный список.',
      'Примеры: <code>/user TG_ID</code>, <code>/stats</code>, <code>/bigwins</code>, <code>/top wagered</code>',
    ].join('\n'));
  } catch {
    /* ignore */
  }
}

export default { registerLogAdminHandlers, maybeAnnounceCommandsOnline };
