/**
 * Broadcast a Telegram message to every bot user (same delivery loop as /bonuspush).
 */
import { getSupabaseAdmin } from '../database/supabase.js';
import { openCasinoKeyboard } from '../bot/keyboards.js';
import logger from '../utils/logger.js';
import { notifyLog } from './telegramLog.js';

const PAGE = 400;
const SEND_GAP_MS = 50;
const BLOCKED_CODES = new Set([403, 400]);
const TG_TEXT_LIMIT = 3900;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tgErrorCode(err) {
  const n = Number(err?.response?.error_code || err?.code || 0);
  return Number.isFinite(n) ? n : 0;
}

async function markBotBlocked(sb, profileId) {
  await sb
    .from('gg_profiles')
    .update({ bot_blocked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', profileId);
}

/**
 * @param {{ telegram: import('telegraf').Telegram }} bot
 * @param {{ html: string, kind?: string, withCasinoButton?: boolean, logTitle?: string }} opts
 */
export async function runUserBroadcast(bot, opts = {}) {
  const html = String(opts.html || '').trim();
  if (!html) {
    return { ok: false, reason: 'empty' };
  }
  const sb = getSupabaseAdmin();
  if (!sb) {
    logger.warn('[broadcast] supabase missing');
    return { ok: false, reason: 'no_supabase' };
  }

  const kind = String(opts.kind || `mail_${Date.now()}`).slice(0, 80);
  const withCasinoButton = opts.withCasinoButton !== false;
  const body = html.slice(0, TG_TEXT_LIMIT);

  const { data: inserted, error: insErr } = await sb
    .from('gg_broadcast_runs')
    .insert({ kind, run_date: new Date().toISOString().slice(0, 10) })
    .select('id')
    .maybeSingle();

  if (insErr) {
    logger.error(`[broadcast] insert run failed: ${insErr.message}`);
    return { ok: false, reason: insErr.message };
  }

  const runId = inserted?.id;
  let sent = 0;
  let fail = 0;
  let skipped = 0;
  let from = 0;

  const sendOpts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(withCasinoButton ? { reply_markup: openCasinoKeyboard().reply_markup } : {}),
  };

  const sendOne = (telegramId) => bot.telegram.sendMessage(telegramId, body, sendOpts);

  try {
    while (true) {
      const { data, error } = await sb
        .from('gg_profiles')
        .select('id, telegram_id')
        .eq('is_blocked', false)
        .is('bot_blocked_at', null)
        .not('telegram_id', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const row of data) {
        try {
          await sendOne(row.telegram_id);
          sent += 1;
        } catch (err) {
          const code = tgErrorCode(err);
          if (code === 429) {
            const wait = Number(err?.response?.parameters?.retry_after || 2) * 1000;
            await sleep(Math.min(Math.max(wait, 1000), 30_000));
            try {
              await sendOne(row.telegram_id);
              sent += 1;
            } catch (err2) {
              fail += 1;
              if (BLOCKED_CODES.has(tgErrorCode(err2))) {
                await markBotBlocked(sb, row.id);
              }
            }
          } else if (BLOCKED_CODES.has(code)) {
            fail += 1;
            await markBotBlocked(sb, row.id);
          } else {
            fail += 1;
            logger.warn(`[broadcast] send ${row.telegram_id}: ${err?.message || err}`);
          }
        }

        await sleep(SEND_GAP_MS);
      }

      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (runId) {
      await sb
        .from('gg_broadcast_runs')
        .update({
          finished_at: new Date().toISOString(),
          sent_count: sent,
          fail_count: fail,
          skipped_count: skipped,
        })
        .eq('id', runId);
    }

    logger.info(`[broadcast] done kind=${kind} sent=${sent} fail=${fail}`);
    notifyLog(
      [
        opts.logTitle || '📣 <b>Рассылка</b>',
        `Отправлено: <b>${sent}</b>`,
        `Ошибки / блок бота: <b>${fail}</b>`,
      ].join('\n'),
    ).catch(() => {});

    return { ok: true, kind, sent, fail, skipped };
  } catch (err) {
    logger.error(`[broadcast] ${err?.message || err}`);
    return { ok: false, reason: err?.message || String(err), sent, fail, skipped };
  }
}
