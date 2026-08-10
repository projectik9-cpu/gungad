/**
 * Shared Telegram Mini App initData validation + profile ownership check.
 */
import crypto from 'crypto';
import config from '../../config/config.js';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';

/**
 * Validate Telegram WebApp initData HMAC.
 * @returns {{ user: object, startParam?: string|null } | { error: string }}
 */
export function validateInitData(initDataRaw) {
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

    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key === 'hash') continue;
      pairs.push([key, value]);
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    const a = Buffer.from(expectedHash, 'utf8');
    const b = Buffer.from(hash, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { error: 'hash_mismatch' };
    }

    const userRaw = params.get('user');
    if (!userRaw) return { error: 'user_missing' };
    const user = JSON.parse(userRaw);
    if (!user?.id) return { error: 'user_id_missing' };
    const startParam = params.get('start_param') || null;
    return { user, startParam };
  } catch (e) {
    logger.warn(`[telegramAuth] validateInitData error: ${e?.message || e}`);
    return { error: 'validate_exception' };
  }
}

/**
 * Ensure initData is valid and profile_id belongs to that Telegram user.
 * @returns {Promise<{ ok: true, tgUser: object, profileId: string } | { ok: false, status: number, error: string, code: string }>}
 */
export async function assertProfileOwnership(profileId, initData) {
  if (!profileId || typeof profileId !== 'string') {
    return { ok: false, status: 400, error: 'profile_id required', code: 'missing_profile' };
  }
  if (!initData) {
    return { ok: false, status: 400, error: 'initData required', code: 'empty_init_data' };
  }

  const validated = validateInitData(initData);
  if (!validated.user) {
    return {
      ok: false,
      status: 403,
      error: 'Invalid initData',
      code: validated.error || 'invalid',
    };
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return { ok: false, status: 500, error: 'Supabase not configured', code: 'supabase_missing' };
  }

  const { data: profile, error: pErr } = await sb
    .from('gg_profiles')
    .select('id, telegram_id')
    .eq('id', profileId)
    .maybeSingle();

  if (pErr || !profile) {
    return { ok: false, status: 404, error: 'Profile not found', code: 'not_found' };
  }
  if (Number(profile.telegram_id) !== Number(validated.user.id)) {
    return { ok: false, status: 403, error: 'Profile mismatch', code: 'profile_mismatch' };
  }

  return { ok: true, tgUser: validated.user, profileId: profile.id };
}
