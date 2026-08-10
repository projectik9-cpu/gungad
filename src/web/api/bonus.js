/**
 * POST /api/bonus/welcome
 * One-time welcome wheel claim via gg_claim_welcome_bonus.
 * Body: { profile_id, initData }
 */
import express from 'express';
import crypto from 'crypto';
import { getSupabaseAdmin } from '../../database/supabase.js';
import config from '../../config/config.js';
import logger from '../../utils/logger.js';
import { logWelcomeBonus } from '../../services/telegramLog.js';

const router = express.Router();

function validateInitData(initDataRaw) {
  try {
    if (!initDataRaw || typeof initDataRaw !== 'string') return null;
    const botToken = config.telegram.botToken;
    if (!botToken) return null;

    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) return null;

    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key === 'hash') continue;
      pairs.push([key, value]);
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    const a = Buffer.from(expectedHash, 'utf8');
    const b = Buffer.from(hash, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    if (!user?.id) return null;
    return user;
  } catch {
    return null;
  }
}

router.post('/welcome', async (req, res) => {
  try {
    const { profile_id, initData } = req.body || {};
    if (!profile_id) {
      return res.status(400).json({ error: 'profile_id required', code: 'missing_profile' });
    }
    if (!initData) {
      return res.status(400).json({ error: 'initData required', code: 'empty_init_data' });
    }

    const tgUser = validateInitData(initData);
    if (!tgUser) {
      return res.status(403).json({ error: 'Invalid initData', code: 'invalid' });
    }

    const sb = getSupabaseAdmin();
    if (!sb) {
      return res.status(500).json({ error: 'Supabase not configured', code: 'supabase_missing' });
    }

    // Ensure the profile belongs to this Telegram user
    const { data: profile, error: pErr } = await sb
      .from('gg_profiles')
      .select('id, telegram_id')
      .eq('id', profile_id)
      .maybeSingle();

    if (pErr || !profile) {
      return res.status(404).json({ error: 'Profile not found', code: 'not_found' });
    }
    if (Number(profile.telegram_id) !== Number(tgUser.id)) {
      return res.status(403).json({ error: 'Profile mismatch', code: 'forbidden' });
    }

    const { data, error } = await sb.rpc('gg_claim_welcome_bonus', {
      p_profile_id: profile_id,
    });

    if (error) {
      logger.error(`[bonus] claim failed: ${error.message}`);
      return res.status(500).json({ error: 'Claim failed', code: 'rpc_failed' });
    }

    logWelcomeBonus({
      profileId: profile_id,
      amountCents: data?.amount_cents ?? 0,
      alreadyClaimed: Boolean(data?.already_claimed),
    }).catch(() => {});

    return res.json({
      ok: true,
      already_claimed: Boolean(data?.already_claimed),
      amount_cents: data?.amount_cents ?? 0,
      balance_cents: data?.balance_cents ?? 0,
    });
  } catch (err) {
    logger.error(`[bonus] unexpected: ${err?.message || err}`);
    return res.status(500).json({ error: 'Internal server error', code: 'internal' });
  }
});

export default router;
