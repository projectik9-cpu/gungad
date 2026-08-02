import { createClient } from '@supabase/supabase-js';
import config from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * Bot / server Supabase client.
 * Prefer SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Never expose to frontend.
 */
let client = null;

export function getSupabaseAdmin() {
  if (client) return client;

  const url = config.supabase.url;
  const key = config.supabase.serviceRoleKey || config.supabase.anonKey;

  if (!url || !key) {
    logger.warn('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    return null;
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Upsert Telegram user into gg_profiles + empty wallet */
export async function ensureGgProfile(telegramUser) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb.rpc('gg_ensure_profile', {
    p_telegram_id: telegramUser.id,
    p_username: telegramUser.username ?? null,
    p_first_name: telegramUser.first_name ?? null,
    p_last_name: telegramUser.last_name ?? null,
    p_language_code: telegramUser.language_code ?? 'ru',
  });

  if (error) {
    logger.error('gg_ensure_profile failed', error);
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

export default { getSupabaseAdmin, ensureGgProfile, getOnlinePlayersCount };
