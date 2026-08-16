/**
 * Poll Telegram Star transactions and credit wallets if successful_payment
 * was delayed or dropped (long-poll lag, dropPendingUpdates on restart).
 * Idempotent via gg_credit_stars (payload + charge id).
 */
import { getSupabaseAdmin } from '../database/supabase.js';
import logger from '../utils/logger.js';
import { creditStarsPayment } from '../bot/handlers/starsHandler.js';

const POLL_MS = 8_000;

let _timer = null;

function parseStarsPayload(payload) {
  const m = String(payload || '').match(/^gg_stars_([0-9a-f-]{36})_(\d+)_/i);
  if (!m) return null;
  return { profileId: m[1], starsAmount: Number(m[2]) };
}

async function reconcile(bot) {
  if (!bot?.telegram) return;
  const sb = getSupabaseAdmin();
  if (!sb) return;

  let result;
  try {
    result = await bot.telegram.callApi('getStarTransactions', { offset: 0, limit: 50 });
  } catch (e) {
    logger.warn(`[starsReconcile] getStarTransactions: ${e?.message || e}`);
    return;
  }

  const txs = result?.transactions;
  if (!Array.isArray(txs) || !txs.length) return;

  for (const tx of txs) {
    const source = tx.source || {};
    if (source.type && source.type !== 'user') continue;
    const parsed = parseStarsPayload(source.invoice_payload);
    if (!parsed) continue;

    const starsAmount = Number(tx.amount) || parsed.starsAmount;
    if (!Number.isFinite(starsAmount) || starsAmount < 1) continue;

    try {
      const data = await creditStarsPayment({
        profileId: parsed.profileId,
        starsAmount,
        chargeId: String(tx.id),
        payload: source.invoice_payload,
        telegramId: source.user?.id ?? null,
        notifyUser: false,
      });
      if (data && data.idempotent === false) {
        logger.info(
          `[starsReconcile] credited profile=%s stars=%d tx=%s`,
          parsed.profileId,
          starsAmount,
          tx.id,
        );
      }
    } catch (e) {
      logger.warn(`[starsReconcile] credit ${tx.id}: ${e?.message || e}`);
    }
  }
}

export function startStarsReconcile(bot) {
  if (_timer) return;
  const tick = () => {
    reconcile(bot).catch((e) => logger.warn(`[starsReconcile] ${e?.message || e}`));
  };
  tick();
  _timer = setInterval(tick, POLL_MS);
  if (typeof _timer.unref === 'function') _timer.unref();
  logger.info('[starsReconcile] started');
}
