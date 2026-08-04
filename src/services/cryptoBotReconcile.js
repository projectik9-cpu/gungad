/**
 * Crypto Bot invoice reconciler — polls getInvoices for pending cryptobot
 * deposits and credits wallets when status === 'paid'.
 *
 * Needed because Crypto Pay webhooks must be enabled manually in @CryptoBot
 * (API has no setWebhook). This is the reliable fallback.
 */
import { getSupabaseAdmin } from '../database/supabase.js';
import logger from '../utils/logger.js';

const API_TOKEN = (process.env.CRYPTOBOT_API_TOKEN || '').trim();
const CRYPTOBOT_API = 'https://pay.crypt.bot/api';
const POLL_MS = 20_000;

let _timer = null;

async function cryptoBotCall(method, payload = {}) {
  const res = await fetch(`${CRYPTOBOT_API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Crypto-Pay-API-Token': API_TOKEN,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    throw new Error(`CryptoBot ${method}: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.result;
}

async function reconcile() {
  if (!API_TOKEN) return;
  const sb = getSupabaseAdmin();
  if (!sb) return;

  const { data: pending, error } = await sb
    .from('gg_deposit_requests')
    .select('id, external_id, amount_usd_cents')
    .eq('provider', 'cryptobot')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    logger.warn(`[cryptobotReconcile] fetch pending: ${error.message}`);
    return;
  }
  if (!pending?.length) return;

  const invoiceIds = pending
    .map((d) => String(d.external_id || '').replace(/^cb_/, ''))
    .filter((id) => /^\d+$/.test(id));

  if (!invoiceIds.length) return;

  let items = [];
  try {
    const result = await cryptoBotCall('getInvoices', { invoice_ids: invoiceIds.join(',') });
    items = result?.items ?? result ?? [];
    if (!Array.isArray(items)) items = [];
  } catch (e) {
    logger.warn(`[cryptobotReconcile] getInvoices: ${e?.message || e}`);
    return;
  }

  const byId = new Map(items.map((inv) => [String(inv.invoice_id), inv]));

  for (const dep of pending) {
    const invId = String(dep.external_id || '').replace(/^cb_/, '');
    const inv = byId.get(invId);
    if (!inv || inv.status !== 'paid') continue;

    const paidUsd = Number(inv.amount);
    const amountCents = Math.round(paidUsd * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) continue;

    const { data, error: credErr } = await sb.rpc('gg_complete_deposit', {
      p_deposit_id: dep.id,
      p_amount_usd_cents: amountCents,
      p_external_id: `cb_${inv.invoice_id}`,
      p_crypto_amount: inv.paid_amount != null ? Number(inv.paid_amount) : null,
    });

    if (credErr) {
      logger.error(`[cryptobotReconcile] credit ${dep.id}: ${credErr.message}`);
      continue;
    }

    logger.info(
      `[cryptobotReconcile] credited deposit=${dep.id} $${paidUsd} invoice=${inv.invoice_id} idempotent=${data?.idempotent}`,
    );
  }
}

export function startCryptoBotReconcile() {
  if (!API_TOKEN) {
    logger.warn('[cryptobotReconcile] CRYPTOBOT_API_TOKEN not set — disabled');
    return;
  }
  if (_timer) return;

  logger.info(`[cryptobotReconcile] polling every ${POLL_MS / 1000}s`);
  _timer = setInterval(() => {
    reconcile().catch((e) => logger.error(`[cryptobotReconcile] ${e?.message || e}`));
  }, POLL_MS);

  setTimeout(() => reconcile().catch(() => {}), 3_000);
}

export function stopCryptoBotReconcile() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
