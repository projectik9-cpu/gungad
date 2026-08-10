/**
 * TON chain monitor — polls Toncenter for incoming transactions on
 * TON_RECEIVING_ADDRESS, matches memos with pending gg_deposit_requests,
 * credits wallets via gg_complete_deposit RPC.
 *
 * ENV:
 *   TON_RECEIVING_ADDRESS — receiving wallet address
 *   TONCENTER_API_KEY     — optional, higher rate limits (toncenter.com)
 *
 * Started from src/index.js via startTonMonitor().
 */
import { getSupabaseAdmin } from '../database/supabase.js';
import logger from '../utils/logger.js';
import { logDepositCredited } from './telegramLog.js';

const TON_ADDRESS = (process.env.TON_RECEIVING_ADDRESS || '').trim();
const TONCENTER_KEY = (process.env.TONCENTER_API_KEY || '').trim();
const POLL_INTERVAL_MS = 30_000;      // check chain every 30s
const RATE_TTL_MS = 5 * 60_000;       // cache TON/USD rate for 5 min
const EXPIRE_AFTER_MS = 2 * 3600_000; // expire pending deposits after 2h
// Tolerance: accept payment if received >= 95% of expected TON (rate drift)
const AMOUNT_TOLERANCE = 0.95;

let _timer = null;
let _rateCache = { rate: 0, at: 0 };

/** TON/USD rate with cache (CoinGecko primary, Toncenter fallback disabled) */
export async function getTonUsdRate() {
  if (_rateCache.rate > 0 && Date.now() - _rateCache.at < RATE_TTL_MS) {
    return _rateCache.rate;
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
    );
    const json = await res.json();
    const rate = Number(json?.['the-open-network']?.usd);
    if (rate > 0) {
      _rateCache = { rate, at: Date.now() };
      return rate;
    }
  } catch (e) {
    logger.warn(`[tonMonitor] rate fetch failed: ${e?.message || e}`);
  }
  return _rateCache.rate || 0;
}

async function fetchIncomingTxs() {
  const params = new URLSearchParams({
    address: TON_ADDRESS,
    limit: '30',
    archival: 'false',
  });
  if (TONCENTER_KEY) params.set('api_key', TONCENTER_KEY);

  const res = await fetch(`https://toncenter.com/api/v2/getTransactions?${params}`);
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    throw new Error(`toncenter: ${JSON.stringify(json.error ?? json).slice(0, 120)}`);
  }
  return json.result || [];
}

function parseTx(tx) {
  const inMsg = tx.in_msg;
  if (!inMsg || !inMsg.value || inMsg.value === '0') return null;

  const nano = Number(inMsg.value);
  if (!Number.isFinite(nano) || nano <= 0) return null;

  // Comment (memo) — plain text messages have msg_data['@type'] === 'msg.dataText'
  let comment = '';
  const msgData = inMsg.msg_data;
  if (msgData?.['@type'] === 'msg.dataText' && msgData.text) {
    try {
      comment = Buffer.from(msgData.text, 'base64').toString('utf8').trim();
    } catch { /* ignore */ }
  }
  if (!comment && typeof inMsg.message === 'string') {
    comment = inMsg.message.trim();
  }

  return {
    hash: tx.transaction_id?.hash ?? null,
    lt: tx.transaction_id?.lt ?? null,
    tonAmount: nano / 1e9,
    comment,
    from: inMsg.source ?? null,
    utime: tx.utime ?? 0,
  };
}

async function processPendingDeposits() {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  // 1) pending TON deposits
  const { data: pending, error } = await sb
    .from('gg_deposit_requests')
    .select('id, memo, amount_usd_cents, meta, created_at')
    .eq('provider', 'tonkeeper')
    .eq('status', 'pending');

  if (error) {
    logger.warn(`[tonMonitor] fetch pending: ${error.message}`);
    return;
  }
  if (!pending?.length) return;

  // 2) expire old ones
  const now = Date.now();
  const live = [];
  for (const dep of pending) {
    if (now - new Date(dep.created_at).getTime() > EXPIRE_AFTER_MS) {
      await sb.from('gg_deposit_requests').update({ status: 'expired' }).eq('id', dep.id);
    } else {
      live.push(dep);
    }
  }
  if (!live.length) return;

  // 3) incoming chain txs
  let txs;
  try {
    txs = await fetchIncomingTxs();
  } catch (e) {
    logger.warn(`[tonMonitor] ${e?.message || e}`);
    return;
  }

  const byMemo = new Map(live.map(d => [String(d.memo).trim(), d]));

  for (const rawTx of txs) {
    const tx = parseTx(rawTx);
    if (!tx || !tx.comment || !tx.hash) continue;

    const dep = byMemo.get(tx.comment);
    if (!dep) continue;

    const expectedTon = Number(dep.meta?.ton_amount ?? 0);
    if (expectedTon > 0 && tx.tonAmount < expectedTon * AMOUNT_TOLERANCE) {
      logger.warn(
        `[tonMonitor] deposit ${dep.id}: got ${tx.tonAmount} TON < expected ${expectedTon} — skipping (manual review)`,
      );
      continue;
    }

    // Credit exactly what was requested in USD (amount fixed at invoice time)
    const { data, error: credErr } = await sb.rpc('gg_complete_deposit', {
      p_deposit_id: dep.id,
      p_amount_usd_cents: dep.amount_usd_cents,
      p_external_id: `ton_${tx.hash}`,
      p_crypto_amount: tx.tonAmount,
    });

    if (credErr) {
      logger.error(`[tonMonitor] credit ${dep.id}: ${credErr.message}`);
      continue;
    }

    byMemo.delete(tx.comment);
    logger.info(
      `[tonMonitor] credited deposit=${dep.id} ${tx.tonAmount} TON ($${dep.amount_usd_cents / 100}) tx=${tx.hash?.slice(0, 12)} idempotent=${data?.idempotent}`,
    );
    logDepositCredited({
      depositId: dep.id,
      profileId: data?.profile_id ?? dep.profile_id,
      amountCents: dep.amount_usd_cents,
      provider: 'tonkeeper',
      externalId: `ton_${tx.hash}`,
      cryptoAmount: tx.tonAmount,
      idempotent: Boolean(data?.idempotent),
    }).catch(() => {});
  }
}

export function startTonMonitor() {
  if (!TON_ADDRESS) {
    logger.warn('[tonMonitor] TON_RECEIVING_ADDRESS not set — TON deposits disabled');
    return;
  }
  if (_timer) return;

  logger.info(`[tonMonitor] watching ${TON_ADDRESS} every ${POLL_INTERVAL_MS / 1000}s`);
  _timer = setInterval(() => {
    processPendingDeposits().catch(e =>
      logger.error(`[tonMonitor] tick error: ${e?.message || e}`),
    );
  }, POLL_INTERVAL_MS);

  // first run shortly after boot
  setTimeout(() => processPendingDeposits().catch(() => {}), 5_000);
}

export function stopTonMonitor() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
