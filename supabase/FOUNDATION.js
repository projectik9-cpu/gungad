/**
 * NEXT AGENT: GunGad DB foundation is ready on Supabase.
 *
 * Project: nndebjrieyxqjnwkslhn
 * URL: https://nndebjrieyxqjnwkslhn.supabase.co
 * Migration: supabase/migrations/20260802230000_gungad_foundation.sql (APPLIED)
 *
 * DO NOT DROP legacy public tables (users has 4k+ rows, withdrawals, etc.).
 * Use gg_* tables for the casino webapp. Link telegram_id <-> legacy users.user_id.
 *
 * TODO for smarter model:
 * - Telegram WebApp initData validation (HMAC) → call gg_ensure_profile
 * - Atomic bet settle RPC (debit wallet + ledger + gg_bets) with idempotency_key
 * - Stars invoice / successful_payment webhook → gg_star_payments + wallet credit
 * - Wire App.tsx balance/onlineCount away from localStorage/fake online
 * - RLS policies after auth model chosen (custom JWT with telegram_id claim recommended)
 * - Migrate/bridge balances from legacy users.balance / casino_balances if needed
 * - Presence heartbeat from frontend every ~30s
 * - WARNING: legacy tables have RLS DISABLED — fix before exposing anon key broadly
 */

export const SUPABASE_PROJECT_REF = 'nndebjrieyxqjnwkslhn';
export const SUPABASE_URL_DEFAULT = 'https://nndebjrieyxqjnwkslhn.supabase.co';

/** Money helpers: always store BIGINT cents in DB */
export function usdToCents(usd: number): number {
  return Math.round(Number(usd) * 100);
}

export function centsToUsd(cents: number): number {
  return Number(cents) / 100;
}
