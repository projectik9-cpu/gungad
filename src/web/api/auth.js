/**
 * POST /api/auth
 * Validates Telegram WebApp initData (HMAC), ensures profile in gg_profiles,
 * returns { profile_id, balance_cents, stars_balance, vip_level, vip_xp, username, first_name }
 */
import crypto from 'crypto';
import express from 'express';
import { getSupabaseAdmin, ensureGgProfile, getSupabaseDiag } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * Validate Telegram Mini App initData signature.
 * Returns { user } or { error }.
 */
function validateInitData(initDataRaw) {
  try {
    if (!initDataRaw || typeof initDataRaw !== 'string') {
      return { error: 'empty_init_data' };
    }

    const botToken = config.telegram.botToken;
    if (!botToken) {
      return { error: 'bot_token_missing' };
    }

    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) return { error: 'hash_missing' };

    // data_check_string: all fields except hash, sorted by key, key=value\n
    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key === 'hash') continue;
      pairs.push([key, value]);
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

    // secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    // timing-safe compare
    const a = Buffer.from(expectedHash, 'utf8');
    const b = Buffer.from(hash, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      logger.warn(`[auth] hash mismatch tokenLen=${botToken.length} checkLen=${checkString.length}`);
      return { error: 'hash_mismatch' };
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (Date.now() / 1000 - authDate > 86400) {
      // 24h soft reject — Telegram can keep WebApp open a while
      logger.warn(`[auth] initData old, auth_date=${authDate}`);
    }

    const userRaw = params.get('user');
    if (!userRaw) return { error: 'user_missing' };
    const user = JSON.parse(userRaw);
    if (!user?.id) return { error: 'user_id_missing' };
    return { user };
  } catch (e) {
    logger.warn(`[auth] validateInitData error: ${e?.message || e}`);
    return { error: 'validate_exception' };
  }
}

/** Quick health for debugging from WebApp */
router.get('/ping', (req, res) => {
  const token = config.telegram.botToken || '';
  res.json({
    ok: true,
    has_bot_token: Boolean(token),
    token_len: token.length,
    token_suffix: token ? token.slice(-6) : null,
    supabase: getSupabaseDiag(),
  });
});

router.post('/', async (req, res) => {
  try {
    const { initData } = req.body || {};
    if (!initData) {
      return res.status(400).json({ error: 'initData required', code: 'empty_init_data' });
    }

    const validated = validateInitData(initData);
    if (!validated.user) {
      return res.status(403).json({
        error: 'Invalid initData signature',
        code: validated.error || 'invalid',
      });
    }
    const tgUser = validated.user;

    const profileId = await ensureGgProfile(tgUser);
    if (!profileId) {
      return res.status(500).json({ error: 'Failed to create profile', code: 'ensure_profile_failed' });
    }

    const sb = getSupabaseAdmin();
    if (!sb) {
      return res.status(500).json({ error: 'Supabase not configured', code: 'supabase_missing' });
    }

    let { data, error } = await sb.rpc('gg_get_wallet', { p_profile_id: profileId });
    if (error) {
      logger.error(`[auth] gg_get_wallet error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch wallet', code: 'wallet_failed' });
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

    logger.info(`[auth] ok telegram_id=${tgUser.id} profile=${profileId} balance=${data?.balance_cents}`);
    return res.json({
      ok: true,
      profile_id: profileId,
      balance_cents: data?.balance_cents ?? 0,
      stars_balance: data?.stars_balance ?? 0,
      vip_level: data?.vip_level ?? 1,
      vip_xp: data?.vip_xp ?? 0,
      username: data?.username ?? tgUser.username ?? null,
      first_name: data?.first_name ?? tgUser.first_name ?? null,
      total_wagered_cents: data?.total_wagered_cents ?? 0,
      total_won_cents: data?.total_won_cents ?? 0,
      total_lost_cents: data?.total_lost_cents ?? 0,
    });
  } catch (err) {
    const detail = String(err?.message || err).slice(0, 160);
    logger.error(`[auth] Unexpected error: ${detail}`);
    console.error('[auth] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error', code: 'internal', detail });
  }
});

export default router;
