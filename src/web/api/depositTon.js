/**
 * Tonkeeper / direct TON deposits (memo scheme).
 *
 * POST /api/deposit/ton/create
 *   Body: { profile_id, amount_usd }
 *   Generates a unique memo, stores a pending gg_deposit_requests row and
 *   returns { address, memo, ton_amount, deposit_id, tonkeeper_url }.
 *
 * GET /api/deposit/ton/status?deposit_id=...
 *   Returns { status, balance_cents? } so the Mini App can poll after payment.
 *
 * ENV:
 *   TON_RECEIVING_ADDRESS — your TON wallet address that accepts deposits
 */
import crypto from 'crypto';
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import { getTonUsdRate } from '../../services/tonMonitor.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const TON_ADDRESS = (process.env.TON_RECEIVING_ADDRESS || '').trim();
const MIN_DEPOSIT_USD = 1;
const MAX_DEPOSIT_USD = 25_000;

router.post('/create', async (req, res) => {
  try {
    if (!TON_ADDRESS) {
      return res.status(503).json({ error: 'TON deposits not configured', code: 'no_address' });
    }

    const { profile_id, amount_usd } = req.body || {};
    if (!profile_id || typeof profile_id !== 'string') {
      return res.status(400).json({ error: 'profile_id required' });
    }

    const amountUsd = Number(amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_DEPOSIT_USD || amountUsd > MAX_DEPOSIT_USD) {
      return res.status(400).json({ error: `amount_usd must be ${MIN_DEPOSIT_USD}–${MAX_DEPOSIT_USD}` });
    }

    // TON amount by current rate
    const rate = await getTonUsdRate();
    if (!rate || rate <= 0) {
      return res.status(503).json({ error: 'TON rate unavailable' });
    }
    const tonAmount = Math.ceil((amountUsd / rate) * 1e4) / 1e4; // round up to 4 decimals

    const memo = `gg${crypto.randomBytes(5).toString('hex')}`;
    const amountCents = Math.round(amountUsd * 100);

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data, error } = await sb.rpc('gg_create_deposit', {
      p_profile_id: profile_id,
      p_provider: 'tonkeeper',
      p_asset: 'TON',
      p_amount_usd_cents: amountCents,
      p_memo: memo,
      p_meta: { requested_usd: amountUsd, ton_amount: tonAmount, rate_usd: rate },
    });
    if (error) {
      logger.error(`[ton/create] gg_create_deposit: ${error.message}`);
      return res.status(500).json({ error: 'Failed to create deposit' });
    }

    // nanotons for deep link
    const nano = Math.round(tonAmount * 1e9);
    const tonkeeperUrl =
      `ton://transfer/${TON_ADDRESS}?amount=${nano}&text=${encodeURIComponent(memo)}`;
    const tonkeeperWebUrl =
      `https://app.tonkeeper.com/transfer/${TON_ADDRESS}?amount=${nano}&text=${encodeURIComponent(memo)}`;

    logger.info(`[ton/create] deposit=${data.deposit_id} memo=${memo} ${tonAmount} TON (~$${amountUsd})`);
    return res.json({
      ok: true,
      deposit_id: data.deposit_id,
      address: TON_ADDRESS,
      memo,
      ton_amount: tonAmount,
      usd_amount: amountUsd,
      rate_usd: rate,
      tonkeeper_url: tonkeeperUrl,
      tonkeeper_web_url: tonkeeperWebUrl,
    });
  } catch (err) {
    logger.error(`[ton/create] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    logger.error(`[ton/status] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
