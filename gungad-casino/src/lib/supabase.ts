import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const SUPABASE_URL_DEFAULT = 'https://nndebjrieyxqjnwkslhn.supabase.co';

const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL_DEFAULT;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Browser client (anon). Money mutations must go through service-role API / RPCs later.
 * Returns null if env key missing so UI can keep demo mode.
 */
export const supabase: SupabaseClient<Database> | null = anonKey
  ? createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(anonKey && url);
}

/** Safe public online counter (view granted to anon). */
export async function fetchOnlinePlayersCount(): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('v_online_players_count').select('online_count').maybeSingle();
  if (error) {
    console.warn('[supabase] online count', error.message);
    return null;
  }
  return data?.online_count ?? 0;
}
