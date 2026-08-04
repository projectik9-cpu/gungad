/**
 * Crypto Bot Pay (https://pay.crypt.bot) auto-deposit integration.
 *
 * POST /api/deposit/cryptobot/create
 *   Body: { profile_id, amount_usd, asset? }
 *   Creates an invoice via Crypto Bot API, stores pending gg_deposit_requests
 *   row, returns { invoice_url, deposit_id }.
 *
 * POST /api/deposit/cryptobot/webhook
 *   Crypto Bot webhook (update_type=invoice_paid).
 *   Validates crypto-pay-api-signature header (HMAC-SHA256 of body with
 *   SHA256(api_token) as key), credits wallet via gg_complete_deposit RPC.
 *
 * ENV:
 *   CRYPTOBOT_API_TOKEN — Crypto Pay API token (create in @CryptoBot → Crypto Pay)
 */
import crypto from 'crypto';
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const CRYPTOBOT_API = 'https://pay.crypt.bot/api';
const API_TOKEN = (process.env.CRYPTOBOT_API_TOKEN || '').trim();

const SUPPORTED_ASSETS = ['USDT', 'TON', 'BTC', 'ETH', 'SOL', 'LTC', 'TRX', 'USDC'];
const MIN_DEPOSIT_USD = 1;
const MAX_DEPOSIT_USD = 25_000;

async function cryptoBotCall(method, payload) {
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
    throw new Error(`CryptoBot ${method} failed: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.result;
}

// --- Create invoice ---------------------------------------------------------
router.post('/create', async (req, res) => {
  try {
    if (!API_TOKEN) {
      return res.status(503).json({ error: 'CryptoBot not configured', code: 'no_token' });
    }

    const { profile_id, amount_usd, asset = 'USDT' } = req.body || {};
    if (!profile_id || typeof profile_id !== 'string') {
      return res.status(400).json({ error: 'profile_id required' });
    }

    const amountUsd = Number(amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_DEPOSIT_USD || amountUsd > MAX_DEPOSIT_USD) {
      return res.status(400).json({ error: `amount_usd must be ${MIN_DEPOSIT_USD}–${MAX_DEPOSIT_USD}` });
    }

    const upperAsset = String(asset).toUpperCase();
    if (!SUPPORTED_ASSETS.includes(upperAsset)) {
      return res.status(400).json({ error: `asset must be one of ${SUPPORTED_ASSETS.join(', ')}` });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const amountCents = Math.round(amountUsd * 100);

    // 1) create pending deposit row
    const { data: depData, error: depErr } = await sb.rpc('gg_create_deposit', {
      p_profile_id: profile_id,
      p_provider: 'cryptobot',
      p_asset: upperAsset,
      p_amount_usd_cents: amountCents,
      p_meta: { requested_usd: amountUsd },
    });
    if (depErr) {
      logger.error(`[cryptobot/create] gg_create_deposit: ${depErr.message}`);
      return res.status(500).json({ error: 'Failed to create deposit' });
    }
    const depositId = depData.deposit_id;

    // 2) create Crypto Bot invoice in fiat USD terms (it converts to asset)
    const invoice = await cryptoBotCall('createInvoice', {
      currency_type: 'fiat',
      fiat: 'USD',
      amount: String(amountUsd),
      accepted_assets: upperAsset === 'USDT' ? undefined : [upperAsset],
      description: `GunGad deposit $${amountUsd}`,
      payload: JSON.stringify({ deposit_id: depositId, profile_id }),
      expires_in: 3600, // 1 hour
    });

    // 3) store invoice id on the deposit row
    await sb
      .from('gg_deposit_requests')
      .update({ external_id: `cb_${invoice.invoice_id}` })
      .eq('id', depositId);

    logger.info(`[cryptobot/create] invoice ${invoice.invoice_id} for profile=${profile_id} $${amountUsd}`);
    return res.json({
      ok: true,
      deposit_id: depositId,
      invoice_id: invoice.invoice_id,
      invoice_url: invoice.bot_invoice_url || invoice.pay_url,
      mini_app_url: invoice.mini_app_invoice_url ?? null,
    });
  } catch (err) {
    logger.error(`[cryptobot/create] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Webhook -----------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  try {
    if (!API_TOKEN) return res.status(503).json({ error: 'not configured' });

    // Signature: HMAC-SHA256 of raw JSON body with key SHA256(api_token)
    const sig = req.headers['crypto-pay-api-signature'];
    const secret = crypto.createHash('sha256').update(API_TOKEN).digest();
    const checkString = typeof req.rawBody === 'string' && req.rawBody.length
      ? req.rawBody
      : JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

    if (!sig || hmac !== sig) {
      logger.warn(`[cryptobot/webhook] bad signature (got=${String(sig).slice(0, 12)}…)`);
      return res.status(403).json({ error: 'bad signature' });
    }

    const update = req.body;
    if (update.update_type !== 'invoice_paid') {
      return res.json({ ok: true, ignored: true });
    }

    const invoice = update.payload; // paid invoice object
    let meta = {};
    try { meta = JSON.parse(invoice.payload || '{}'); } catch { /* ignore */ }

    const depositId = meta.deposit_id;
    if (!depositId) {
      logger.warn(`[cryptobot/webhook] invoice ${invoice.invoice_id} without deposit_id payload`);
      return res.json({ ok: true, ignored: true });
    }

    // Amount: for fiat invoices paid_amount is in crypto; use invoice.amount (fiat USD)
    const paidUsd = Number(invoice.amount);
    const amountCents = Math.round(paidUsd * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      logger.warn(`[cryptobot/webhook] bad amount ${invoice.amount}`);
      return res.status(400).json({ error: 'bad amount' });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('gg_complete_deposit', {
      p_deposit_id: depositId,
      p_amount_usd_cents: amountCents,
      p_external_id: `cb_${invoice.invoice_id}`,
      p_crypto_amount: invoice.paid_amount != null ? Number(invoice.paid_amount) : null,
    });

    if (error) {
      logger.error(`[cryptobot/webhook] gg_complete_deposit: ${error.message}`);
      return res.status(500).json({ error: 'credit failed' });
    }

    logger.info(`[cryptobot/webhook] credited deposit=${depositId} $${paidUsd} idempotent=${data?.idempotent}`);
    return res.json({ ok: true });
  } catch (err) {
    logger.error(`[cryptobot/webhook] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Status (for Mini App polling) ------------------------------------------
router.get('/status', async (req, res) => {
  try {
    const { deposit_id } = req.query;
    if (!deposit_id) return res.status(400).json({ error: 'deposit_id required' });

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data, error } = await sb
      .from('gg_deposit_requests')
      .select('id, status, amount_usd_cents, profile_id')
      .eq('id', deposit_id)
      .maybeSingle();

    if (error || !data) return res.status(404).json({ error: 'not found' });

    let balance_cents;
    if (data.status === 'completed') {
      const { data: w } = await sb.rpc('gg_get_wallet', { p_profile_id: data.profile_id });
      balance_cents = w?.balance_cents;
    }

    return res.json({ ok: true, status: data.status, amount_usd_cents: data.amount_usd_cents, balance_cents });
  } catch (err) {
    logger.error(`[cryptobot/status] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
