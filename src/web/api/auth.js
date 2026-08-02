/**
 * POST /api/auth
 * Validates Telegram WebApp initData (HMAC), ensures profile in gg_profiles,
 * returns { profile_id, balance_cents, stars_balance, vip_level, vip_xp, username, first_name }
 */
import crypto from 'crypto';
import express from 'express';
import { getSupabaseAdmin, ensureGgProfile } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * Validate Telegram Mini App initData signature.
 * Returns parsed user object or null on failure.
 */
function validateInitData(initDataRaw) {
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) return null;

    // Remove hash from check string
    const checkArr = [];
    for (const [key, value] of [...params.entries()].sort()) {
      if (key !== 'hash') checkArr.push(`${key}=${value}`);
    }
    const checkString = checkArr.join('\n');

    // HMAC-SHA256(secret_key, checkString), secret_key = HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.telegram.botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    // Optional: check auth_date freshness (max 1 hour)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (Date.now() / 1000 - authDate > 3600) {
      logger.warn('[auth] initData expired, auth_date=%d', authDate);
      // In production you may want to return null here. For now just warn.
    }

    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch (e) {
    logger.warn('[auth] validateInitData error', e.message);
    return null;
  }
}

router.post('/', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) {
      return res.status(400).json({ error: 'initData required' });
    }

    const tgUser = validateInitData(initData);
    if (!tgUser) {
      return res.status(403).json({ error: 'Invalid initData signature' });
    }

    // Ensure profile + wallet exist
    const profileId = await ensureGgProfile(tgUser);
    if (!profileId) {
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    // Fetch wallet + profile data
    const sb = getSupabaseAdmin();
    let { data, error } = await sb.rpc('gg_get_wallet', { p_profile_id: profileId });
    if (error) {
      logger.error('[auth] gg_get_wallet error', error);
      return res.status(500).json({ error: 'Failed to fetch wallet' });
    }

    // Starting credits for brand-new wallets (empty → +$1000)
    if ((data?.balance_cents ?? 0) === 0 && (data?.total_wagered_cents ?? 0) === 0) {
      const refill = await sb.rpc('gg_demo_refill', {
        p_profile_id: profileId,
        p_amount_cents: 100000,
      });
      if (!refill.error) {
        const again = await sb.rpc('gg_get_wallet', { p_profile_id: profileId });
        if (!again.error && again.data) data = again.data;
      }
    }

    return res.json({
      ok: true,
      profile_id:    profileId,
      balance_cents: data?.balance_cents  ?? 0,
      stars_balance: data?.stars_balance  ?? 0,
      vip_level:     data?.vip_level      ?? 1,
      vip_xp:        data?.vip_xp         ?? 0,
      username:      data?.username       ?? tgUser.username ?? null,
      first_name:    data?.first_name     ?? tgUser.first_name ?? null,
      total_wagered_cents: data?.total_wagered_cents ?? 0,
      total_won_cents:     data?.total_won_cents     ?? 0,
      total_lost_cents:    data?.total_lost_cents    ?? 0,
    });
  } catch (err) {
    logger.error('[auth] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
