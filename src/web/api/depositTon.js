import crypto from 'crypto';
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { assertProfileOwnership } from './telegramAuth.js';

const router = express.Router();
const TON_ADDRESS = (process.env.TON_RECEIVING_ADDRESS || '').trim();
const TON_USDT_MASTER = config.payment.tonUsdtMasterAddress;
const MIN_DEPOSIT_USD = 1;
const MAX_DEPOSIT_USD = 25_000;
const USDT_DECIMALS = 1e6;

router.post('/create', async (req, res) => {
  try {
    const { profile_id, initData, amount_usd, asset = 'TON' } = req.body || {};
    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error, code: auth.code });
    if (!TON_ADDRESS) return res.status(503).json({ error: 'TON deposits not configured', code: 'no_address' });

    const upperAsset = String(asset).toUpperCase() === 'USDT' ? 'USDT_TON' : 'TON';
    const amountUsd = Number(amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_DEPOSIT_USD || amountUsd > MAX_DEPOSIT_USD) {
      return res.status(400).json({ error: `amount_usd must be ${MIN_DEPOSIT_USD}–${MAX_DEPOSIT_USD}` });
    }

    const rate = upperAsset === 'TON' ? await getTonUsdRate() : 1;
    if (upperAsset === 'TON' && (!rate || rate <= 0)) return res.status(503).json({ error: 'TON rate unavailable' });
    const tonAmount = upperAsset === 'TON' ? Math.ceil((amountUsd / rate) * 1e4) / 1e4 : null;
    const tokenAmount = upperAsset === 'USDT_TON' ? Math.round(amountUsd * USDT_DECIMALS) : null;
    const memo = `gg${crypto.randomBytes(5).toString('hex')}`;
    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    const { data, error } = await sb.rpc('gg_create_deposit', {
      p_profile_id: profile_id,
      p_provider: 'tonkeeper',
      p_asset: upperAsset,
      p_amount_usd_cents: Math.round(amountUsd * 100),
      p_memo: memo,
      p_meta: {
        requested_usd: amountUsd,
        rate_usd: rate,
        ton_amount: tonAmount,
        token_amount: upperAsset === 'USDT_TON' ? amountUsd : null,
        token_amount_raw: tokenAmount,
        token_master: upperAsset === 'USDT_TON' ? TON_USDT_MASTER : null,
        decimals: upperAsset === 'USDT_TON' ? 6 : 9,
      },
    });
    if (error) {
      logger.error(`[ton/create] gg_create_deposit: ${error.message}`);
      return res.status(500).json({ error: 'Failed to create deposit' });
    }

    const query = upperAsset === 'TON'
      ? `amount=${Math.round(tonAmount * 1e9)}&text=${encodeURIComponent(memo)}`
      : `jetton=${encodeURIComponent(TON_USDT_MASTER)}&amount=${tokenAmount}&text=${encodeURIComponent(memo)}`;
    const tonkeeperUrl = `ton://transfer/${TON_ADDRESS}?${query}`;
    const tonkeeperWebUrl = `https://app.tonkeeper.com/transfer/${TON_ADDRESS}?${query}`;
    return res.json({
      ok: true,
      deposit_id: data.deposit_id,
      asset: upperAsset,
      address: TON_ADDRESS,
      memo,
      ton_amount: tonAmount,
      token_amount: upperAsset === 'USDT_TON' ? amountUsd : null,
      usd_amount: amountUsd,
      rate_usd: rate,
      tonkeeper_url: tonkeeperUrl,
      tonkeeper_web_url: tonkeeperWebUrl,
    });
  } catch (err) {
    logger.error(`[ton/create] ${err?.message || err}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const { deposit_id } = req.query;
    if (!deposit_id) return res.status(400).json({ error: 'deposit_id required' });
    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
    const { data, error } = await sb.from('gg_deposit_requests')
      .select('id, status, amount_usd_cents, profile_id').eq('id', deposit_id).maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'not found' });
    let balance_cents;
    if (data.status === 'completed') {
      const { data: w } = await sb.rpc('gg_get_wallet', { p_profile_id: data.profile_id });
      balance_cents = w?.balance_cents;
    }
    return res.json({ ok: true, status: data.status, amount_usd_cents: data.amount_usd_cents, balance_cents });
  } catch (err) {
    logger.error(`[ton/status] ${err?.message || err}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { TON_USDT_MASTER };
export { getTonUsdRate } from '../../services/tonMonitor.js';
export default router;
