/**
 * TON chain monitor for incoming TON and USDT (TON) payments.
 */
import { getSupabaseAdmin } from '../database/supabase.js';
import config from '../config/config.js';
import logger from '../utils/logger.js';
import { logDepositCredited } from './telegramLog.js';

const TON_ADDRESS = (process.env.TON_RECEIVING_ADDRESS || '').trim();
const TONCENTER_KEY = (process.env.TONCENTER_API_KEY || '').trim();
const TON_USDT_MASTER = config.payment.tonUsdtMasterAddress;
const POLL_INTERVAL_MS = 30_000;
const RATE_TTL_MS = 5 * 60_000;
const EXPIRE_AFTER_MS = 2 * 3600_000;
const AMOUNT_TOLERANCE = 0.95;

let _timer = null;
let _rateCache = { rate: 0, at: 0 };

export async function getTonUsdRate() {
  if (_rateCache.rate > 0 && Date.now() - _rateCache.at < RATE_TTL_MS) return _rateCache.rate;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
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
  const params = new URLSearchParams({ address: TON_ADDRESS, limit: '100', archival: 'false' });
  if (TONCENTER_KEY) params.set('api_key', TONCENTER_KEY);
  const res = await fetch(`https://toncenter.com/api/v2/getTransactions?${params}`);
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`toncenter: ${JSON.stringify(json.error ?? json).slice(0, 120)}`);
  return json.result || [];
}

async function fetchJettonTransfers() {
  if (!TON_USDT_MASTER) return [];
  const params = new URLSearchParams({
    owner_address: TON_ADDRESS,
    jetton_master: TON_USDT_MASTER,
    direction: 'in',
    limit: '100',
  });
  if (TONCENTER_KEY) params.set('api_key', TONCENTER_KEY);
  const res = await fetch(`https://toncenter.com/api/v3/jetton/transfers?${params}`);
  if (!res.ok) throw new Error(`toncenter jettons: ${res.status}`);
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json?.jetton_transfers) ? json.jetton_transfers : [];
}

function parseComment(msg) {
  let comment = '';
  const msgData = msg?.msg_data;
  if (msgData?.['@type'] === 'msg.dataText' && msgData.text) {
    try { comment = Buffer.from(msgData.text, 'base64').toString('utf8').trim(); } catch { /* ignore */ }
  }
  return comment || (typeof msg?.message === 'string' ? msg.message.trim() : '');
}

function parseTx(tx) {
  const inMsg = tx.in_msg;
  const nano = Number(inMsg?.value);
  if (!inMsg || !Number.isFinite(nano) || nano <= 0) return null;
  return {
    hash: tx.transaction_id?.hash ?? null,
    tonAmount: nano / 1e9,
    comment: parseComment(inMsg),
  };
}

function parseJettonTransfer(tx) {
  const amount = Number(tx.amount ?? tx.jetton_amount ?? tx.value);
  const master = String(tx.jetton_master ?? tx.jetton_master_address ?? tx.jetton?.address ?? '');
  const comment = String(tx.comment ?? tx.payload ?? '').trim();
  const hash = tx.transaction_hash ?? tx.tx_hash ?? tx.hash ?? null;
  if (!hash || !Number.isFinite(amount) || amount <= 0 || master !== TON_USDT_MASTER || !comment) return null;
  return { hash, tokenAmount: amount / 1e6, comment };
}

async function credit(sb, dep, externalId, cryptoAmount) {
  const { data, error } = await sb.rpc('gg_complete_deposit', {
    p_deposit_id: dep.id,
    p_amount_usd_cents: dep.amount_usd_cents,
    p_external_id: externalId,
    p_crypto_amount: cryptoAmount,
  });
  if (error) {
    logger.error(`[tonMonitor] credit ${dep.id}: ${error.message}`);
    return;
  }
  logger.info(`[tonMonitor] credited deposit=${dep.id} tx=${externalId.slice(0, 24)} idempotent=${data?.idempotent}`);
  logDepositCredited({
    depositId: dep.id,
    profileId: data?.profile_id ?? dep.profile_id,
    amountCents: dep.amount_usd_cents,
    provider: 'tonkeeper',
    externalId,
    cryptoAmount,
    idempotent: Boolean(data?.idempotent),
  }).catch(() => {});
}

async function processPendingDeposits() {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { data: pending, error } = await sb.from('gg_deposit_requests')
    .select('id, profile_id, memo, amount_usd_cents, crypto_asset, meta, created_at')
    .eq('provider', 'tonkeeper').eq('status', 'pending');
  if (error) return logger.warn(`[tonMonitor] fetch pending: ${error.message}`);
  if (!pending?.length) return;

  const live = pending.filter((dep) => {
    if (Date.now() - new Date(dep.created_at).getTime() > EXPIRE_AFTER_MS) {
      void sb.from('gg_deposit_requests').update({ status: 'expired' }).eq('id', dep.id);
      return false;
    }
    return true;
  });
  if (!live.length) return;

  let tonTxs = [];
  let jettonTxs = [];
  try { tonTxs = await fetchIncomingTxs(); } catch (e) { logger.warn(`[tonMonitor] TON ${e?.message || e}`); }
  try { jettonTxs = await fetchJettonTransfers(); } catch (e) { logger.warn(`[tonMonitor] USDT ${e?.message || e}`); }
  const byMemo = new Map(live.map((dep) => [String(dep.memo).trim(), dep]));

  for (const raw of tonTxs) {
    const tx = parseTx(raw);
    if (!tx?.hash || !tx.comment) continue;
    const dep = byMemo.get(tx.comment);
    if (!dep || String(dep.crypto_asset).toUpperCase() !== 'TON') continue;
    const expected = Number(dep.meta?.ton_amount || 0);
    if (expected > 0 && tx.tonAmount < expected * AMOUNT_TOLERANCE) continue;
    await credit(sb, dep, `ton_${tx.hash}`, tx.tonAmount);
    byMemo.delete(tx.comment);
  }

  for (const raw of jettonTxs) {
    const tx = parseJettonTransfer(raw);
    if (!tx) continue;
    const dep = byMemo.get(tx.comment);
    if (!dep || String(dep.crypto_asset).toUpperCase() !== 'USDT_TON') continue;
    const expected = Number(dep.meta?.token_amount || 0);
    if (expected > 0 && tx.tokenAmount < expected * AMOUNT_TOLERANCE) continue;
    await credit(sb, dep, `tontusdt_${tx.hash}`, tx.tokenAmount);
    byMemo.delete(tx.comment);
  }
}

export function startTonMonitor() {
  if (!TON_ADDRESS) {
    logger.warn('[tonMonitor] TON_RECEIVING_ADDRESS not set — TON deposits disabled');
    return;
  }
  if (_timer) return;
  logger.info(`[tonMonitor] watching ${TON_ADDRESS} every ${POLL_INTERVAL_MS / 1000}s`);
  _timer = setInterval(() => processPendingDeposits().catch((e) => logger.error(`[tonMonitor] tick error: ${e?.message || e}`)), POLL_INTERVAL_MS);
  setTimeout(() => processPendingDeposits().catch(() => {}), 5_000);
}

export function stopTonMonitor() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
