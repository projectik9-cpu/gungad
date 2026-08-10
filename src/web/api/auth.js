/**
 * POST /api/auth
 * Validates Telegram WebApp initData (HMAC), ensures profile in gg_profiles,
 * returns { profile_id, balance_cents, locked_cents, stars_balance, vip_level, vip_xp, username, first_name }
 */
import express from 'express';
import {
  getSupabaseAdmin,
  ensureGgProfile,
  getSupabaseDiag,
  parseReferrerTelegramId,
} from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { validateInitData } from './telegramAuth.js';

const router = express.Router();

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
    const referrerId = parseReferrerTelegramId(validated.startParam);

    const profileId = await ensureGgProfile(tgUser, referrerId);
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

    // New wallets start at 0 — no auto demo credits (user opts into demo in the Mini App)

    logger.info(
      `[auth] ok telegram_id=${tgUser.id} profile=${profileId} balance=${data?.balance_cents}` +
        (referrerId ? ` ref=${referrerId}` : ''),
    );
    return res.json({
      ok: true,
      profile_id: profileId,
      balance_cents: data?.balance_cents ?? 0,
      locked_cents: data?.locked_cents ?? 0,
      stars_balance: data?.stars_balance ?? 0,
      vip_level: data?.vip_level ?? 1,
      vip_xp: data?.vip_xp ?? 0,
      username: data?.username ?? tgUser.username ?? null,
      first_name: data?.first_name ?? tgUser.first_name ?? null,
      total_wagered_cents: data?.total_wagered_cents ?? 0,
      total_won_cents: data?.total_won_cents ?? 0,
      total_lost_cents: data?.total_lost_cents ?? 0,
      telegram_id: data?.telegram_id ?? tgUser.id,
      welcome_bonus_available: data?.welcome_bonus_available !== false,
    });
  } catch (err) {
    const detail = String(err?.message || err).slice(0, 160);
    logger.error(`[auth] Unexpected error: ${detail}`);
    console.error('[auth] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error', code: 'internal', detail });
  }
});

export default router;
