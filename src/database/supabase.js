import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * Bot / server Supabase client.
 * Prefer SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Never expose to frontend.
 */
let client = null;
let initError = null;

export function getSupabaseAdmin() {
  if (client) return client;
  if (initError) return null;

  const url = config.supabase.url;
  const key = config.supabase.serviceRoleKey || config.supabase.anonKey;

  if (!url || !key) {
    logger.warn('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    return null;
  }

  try {
    // Node < 22 has no native WebSocket; supabase-js realtime requires `ws`
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  } catch (err) {
    initError = err;
    logger.error(`[supabase] createClient failed: ${err?.message || err}`);
    return null;
  }
  return client;
}

/** Diagnostic info for /api/auth/ping (no secrets) */
export function getSupabaseDiag() {
  const service = config.supabase.serviceRoleKey || '';
  const anon = config.supabase.anonKey || '';
  const key = service || anon;
  return {
    has_url: Boolean(config.supabase.url),
    has_service_role: Boolean(service),
    has_anon: Boolean(anon),
    service_len: service.length,
    service_kind: service.startsWith('eyJ')
      ? 'jwt'
      : service.startsWith('sb_secret')
        ? 'sb_secret'
        : service.startsWith('sb_publishable')
          ? 'sb_publishable'
          : service
            ? 'other'
            : 'missing',
    client_ok: Boolean(getSupabaseAdmin()),
    init_error: initError ? String(initError.message || initError).slice(0, 160) : null,
    using_key: service ? 'service_role' : anon ? 'anon' : 'none',
    key_len: key.length,
  };
}

/** Parse `ref123456` from /start payload, Mini App start_param, or URL. */
export function parseReferrerTelegramId(payload) {
  if (payload == null) return null;
  let raw = String(payload).trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const m = raw.match(/ref[_-]?(\d{5,16})/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function parseReferrerFromCtx(ctx) {
  const text = ctx.message?.text || ctx.channelPost?.text || '';
  return (
    parseReferrerTelegramId(ctx.startPayload) ||
    parseReferrerTelegramId(ctx.payload) ||
    parseReferrerTelegramId(text)
  );
}

/** Upsert Telegram user into gg_profiles + empty wallet */
export async function ensureGgProfile(telegramUser, referrerTelegramId = null) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const params = {
    p_telegram_id: telegramUser.id,
    p_username: telegramUser.username ?? null,
    p_first_name: telegramUser.first_name ?? null,
    p_last_name: telegramUser.last_name ?? null,
    p_language_code: telegramUser.language_code ?? 'ru',
  };
  if (referrerTelegramId != null) {
    params.p_referrer_telegram_id = referrerTelegramId;
  }

  const { data, error } = await sb.rpc('gg_ensure_profile', params);

  if (error) {
    logger.error(`[supabase] gg_ensure_profile failed: ${error.message}`);
    return null;
  }
  return data;
}

export async function applyReferralSignup(profileId, referrerTelegramId) {
  const sb = getSupabaseAdmin();
  if (!sb || !profileId || referrerTelegramId == null) return null;
  const { data, error } = await sb.rpc('gg_apply_referral_signup', {
    p_profile_id: profileId,
    p_referrer_telegram_id: referrerTelegramId,
  });
  if (error) {
    logger.error(`[supabase] gg_apply_referral_signup failed: ${error.message}`);
    return null;
  }
  return data;
}

export async function getOnlinePlayersCount() {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from('v_online_players_count').select('online_count').maybeSingle();
  if (error) {
    logger.error('v_online_players_count failed', error);
    return null;
  }
  return data?.online_count ?? 0;
}

export default { getSupabaseAdmin, ensureGgProfile, applyReferralSignup, parseReferrerTelegramId, parseReferrerFromCtx, getOnlinePlayersCount };
