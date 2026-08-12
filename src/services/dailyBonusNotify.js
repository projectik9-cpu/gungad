/**
 * Daily Telegram broadcast: welcome wheel is available again (once per Moscow day).
 */
import { CronJob } from 'cron';
import { getSupabaseAdmin } from '../database/supabase.js';
import { openCasinoKeyboard } from '../bot/keyboards.js';
import logger from '../utils/logger.js';
import { notifyLog } from './telegramLog.js';

const KIND = 'daily_welcome_bonus';
const PAGE = 400;
const SEND_GAP_MS = 50;
const BLOCKED_CODES = new Set([403, 400]);

const MESSAGE = `
🎁 <b>Колесо бонуса снова активно!</b>

Приветствуем вас в GunGad.
Ежедневный бонус за вход снова можно забрать — крутите колесо в казино.

Нажмите кнопку ниже ⬇️
`.trim();

function moscowDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function claimedTodayMoscow(iso) {
  if (!iso) return false;
  return moscowDateStr(new Date(iso)) === moscowDateStr();
}

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
 * @param {import('telegraf').Telegraf} bot
 * @param {{ force?: boolean }} [opts]
 */
export async function runDailyBonusNotify(bot, opts = {}) {
  const force = Boolean(opts.force);
  const sb = getSupabaseAdmin();
  if (!sb) {
    logger.warn('[dailyBonusNotify] supabase missing');
    return { ok: false, reason: 'no_supabase' };
  }

  const runDate = moscowDateStr();

  if (force) {
    await sb.from('gg_broadcast_runs').delete().eq('kind', KIND).eq('run_date', runDate);
  }

  const { data: inserted, error: insErr } = await sb
    .from('gg_broadcast_runs')
    .insert({ kind: KIND, run_date: runDate })
    .select('id')
    .maybeSingle();

  if (insErr) {
    if (String(insErr.code) === '23505' || /duplicate|unique/i.test(insErr.message || '')) {
      logger.info(`[dailyBonusNotify] already ran for ${runDate}`);
      return { ok: true, skipped: true, reason: 'already_ran', runDate };
    }
    logger.error(`[dailyBonusNotify] insert run failed: ${insErr.message}`);
    return { ok: false, reason: insErr.message };
  }

  const runId = inserted?.id;
  let sent = 0;
  let fail = 0;
  let skipped = 0;
  let from = 0;

  try {
    while (true) {
      const { data, error } = await sb
        .from('gg_profiles')
        .select('id, telegram_id, welcome_bonus_claimed_at')
        .eq('is_blocked', false)
        .is('bot_blocked_at', null)
        .not('telegram_id', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw new Error(error.message);
      if (!data?.length) break;

      for (const row of data) {
        if (claimedTodayMoscow(row.welcome_bonus_claimed_at)) {
          skipped += 1;
          continue;
        }

        try {
          await bot.telegram.sendMessage(row.telegram_id, MESSAGE, {
            parse_mode: 'HTML',
            reply_markup: openCasinoKeyboard().reply_markup,
          });
          sent += 1;
        } catch (err) {
          const code = tgErrorCode(err);
          if (code === 429) {
            const wait = Number(err?.response?.parameters?.retry_after || 2) * 1000;
            await sleep(Math.min(Math.max(wait, 1000), 30_000));
            try {
              await bot.telegram.sendMessage(row.telegram_id, MESSAGE, {
                parse_mode: 'HTML',
                reply_markup: openCasinoKeyboard().reply_markup,
              });
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
            logger.warn(`[dailyBonusNotify] send ${row.telegram_id}: ${err?.message || err}`);
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

    logger.info(`[dailyBonusNotify] done ${runDate} sent=${sent} fail=${fail} skipped=${skipped}`);
    notifyLog(
      [
        '📣 <b>Рассылка ежедневного бонуса</b>',
        `Дата: <code>${runDate}</code>`,
        `Отправлено: <b>${sent}</b>`,
        `Пропущено (уже крутили сегодня): <b>${skipped}</b>`,
        `Ошибки / блок бота: <b>${fail}</b>`,
      ].join('\n'),
    ).catch(() => {});

    return { ok: true, runDate, sent, fail, skipped };
  } catch (err) {
    logger.error(`[dailyBonusNotify] ${err?.message || err}`);
    return { ok: false, reason: err?.message || String(err), sent, fail, skipped };
  }
}

export function startDailyBonusNotify(bot) {
  const job = CronJob.from({
    cronTime: '0 12 * * *',
    onTick: () => {
      void runDailyBonusNotify(bot);
    },
    start: true,
    timeZone: 'Europe/Moscow',
  });

  logger.info('[dailyBonusNotify] cron 12:00 Europe/Moscow');

  const hourMsk = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  if (hourMsk >= 12) {
    void runDailyBonusNotify(bot);
  }

  return job;
}
