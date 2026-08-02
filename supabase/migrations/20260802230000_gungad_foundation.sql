-- =============================================================================
-- GunGad Casino — foundation schema for Supabase
-- Project: nndebjrieyxqjnwkslhn (eu-central-1)
--
-- NEXT AGENT NOTES (do not delete):
-- 1) Existing LIVE tables already in public (DO NOT DROP):
--    users, promocodes, used_promocodes, withdrawals, withdrawal_messages,
--    sponsor_tasks, banned_users, casino_balances, casino_games,
--    casino_withdrawals, paid_subscriptions, op_service_settings, bot_settings
-- 2) Legacy users.user_id = Telegram ID. Link via gg_profiles.telegram_id.
-- 3) Old casino_* tables are stubs (0 rows) / dice-shaped — replace usage with gg_*.
-- 4) Money: BIGINT in USD cents (100 = $1.00). Never use float for money.
-- 5) Stars: Telegram Stars as INTEGER. Ledger in gg_star_ledger.
-- 6) Online players: gg_presence heartbeats; view v_online_players_count.
-- 7) Service role for bot/API only. Anon key for webapp with RLS.
-- 8) Telegram Mini App auth (validate initData → upsert profile) NOT implemented yet.
-- 9) Enable RLS policies carefully after wiring auth (telegram_id claim / custom JWT).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Game ids used by the webapp
DO $$ BEGIN
  CREATE TYPE public.gg_game_id AS ENUM (
    'crash', 'roulette', 'blackjack', 'coinflip', 'dice', 'mines', 'plinko'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gg_ledger_kind AS ENUM (
    'deposit', 'withdraw', 'bet', 'win', 'refund', 'bonus', 'referral',
    'admin_adjust', 'star_topup', 'star_spend'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gg_bet_status AS ENUM (
    'pending', 'won', 'lost', 'push', 'cancelled', 'cashed_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gg_star_status AS ENUM (
    'pending', 'paid', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Profiles (1 row per Telegram user)
CREATE TABLE IF NOT EXISTS public.gg_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  username text,
  first_name text,
  last_name text,
  language_code text NOT NULL DEFAULT 'ru',
  currency_code text NOT NULL DEFAULT 'USD',
  avatar_url text,
  vip_level integer NOT NULL DEFAULT 1 CHECK (vip_level BETWEEN 1 AND 20),
  vip_xp integer NOT NULL DEFAULT 0 CHECK (vip_xp >= 0),
  is_blocked boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  referrer_telegram_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gg_profiles_last_seen_idx ON public.gg_profiles (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS gg_profiles_referrer_idx ON public.gg_profiles (referrer_telegram_id);

-- Wallet: balance in USD cents
CREATE TABLE IF NOT EXISTS public.gg_wallets (
  profile_id uuid PRIMARY KEY REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  locked_cents bigint NOT NULL DEFAULT 0 CHECK (locked_cents >= 0),
  total_wagered_cents bigint NOT NULL DEFAULT 0 CHECK (total_wagered_cents >= 0),
  total_won_cents bigint NOT NULL DEFAULT 0 CHECK (total_won_cents >= 0),
  total_lost_cents bigint NOT NULL DEFAULT 0 CHECK (total_lost_cents >= 0),
  total_deposited_cents bigint NOT NULL DEFAULT 0 CHECK (total_deposited_cents >= 0),
  total_withdrawn_cents bigint NOT NULL DEFAULT 0 CHECK (total_withdrawn_cents >= 0),
  stars_balance integer NOT NULL DEFAULT 0 CHECK (stars_balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gg_wallets_lock_lte_balance CHECK (locked_cents <= balance_cents)
);

-- Immutable money ledger (source of truth for audits)
CREATE TABLE IF NOT EXISTS public.gg_ledger (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  kind public.gg_ledger_kind NOT NULL,
  amount_cents bigint NOT NULL,
  balance_after_cents bigint NOT NULL,
  bet_id uuid,
  star_payment_id uuid,
  idempotency_key text UNIQUE,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gg_ledger_profile_created_idx
  ON public.gg_ledger (profile_id, created_at DESC);

-- Bets / game rounds
CREATE TABLE IF NOT EXISTS public.gg_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  game_id public.gg_game_id NOT NULL,
  status public.gg_bet_status NOT NULL DEFAULT 'pending',
  bet_cents bigint NOT NULL CHECK (bet_cents > 0),
  payout_cents bigint NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
  multiplier numeric(12, 4) NOT NULL DEFAULT 0,
  client_seed text,
  server_seed_hash text,
  server_seed text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS gg_bets_profile_created_idx
  ON public.gg_bets (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gg_bets_game_created_idx
  ON public.gg_bets (game_id, created_at DESC);

ALTER TABLE public.gg_ledger
  DROP CONSTRAINT IF EXISTS gg_ledger_bet_id_fkey;
ALTER TABLE public.gg_ledger
  ADD CONSTRAINT gg_ledger_bet_id_fkey
  FOREIGN KEY (bet_id) REFERENCES public.gg_bets(id) ON DELETE SET NULL;

-- Telegram Stars payments
CREATE TABLE IF NOT EXISTS public.gg_star_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  telegram_payment_charge_id text UNIQUE,
  stars_amount integer NOT NULL CHECK (stars_amount > 0),
  usd_cents bigint NOT NULL DEFAULT 0 CHECK (usd_cents >= 0),
  status public.gg_star_status NOT NULL DEFAULT 'pending',
  payload text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS gg_star_payments_profile_idx
  ON public.gg_star_payments (profile_id, created_at DESC);

ALTER TABLE public.gg_ledger
  DROP CONSTRAINT IF EXISTS gg_ledger_star_payment_id_fkey;
ALTER TABLE public.gg_ledger
  ADD CONSTRAINT gg_ledger_star_payment_id_fkey
  FOREIGN KEY (star_payment_id) REFERENCES public.gg_star_payments(id) ON DELETE SET NULL;

-- Star balance movements (separate from USD ledger)
CREATE TABLE IF NOT EXISTS public.gg_star_ledger (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  delta_stars integer NOT NULL,
  stars_after integer NOT NULL CHECK (stars_after >= 0),
  reason text NOT NULL,
  star_payment_id uuid REFERENCES public.gg_star_payments(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Online presence / player counting
CREATE TABLE IF NOT EXISTS public.gg_presence (
  profile_id uuid PRIMARY KEY REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  game_id public.gg_game_id,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gg_presence_heartbeat_idx
  ON public.gg_presence (last_heartbeat_at DESC);

-- Casino-wide counters (optional cache row)
CREATE TABLE IF NOT EXISTS public.gg_casino_stats (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_players bigint NOT NULL DEFAULT 0,
  total_bets bigint NOT NULL DEFAULT 0,
  total_wagered_cents bigint NOT NULL DEFAULT 0,
  total_paid_cents bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.gg_casino_stats (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Views for next agent / dashboards
CREATE OR REPLACE VIEW public.v_online_players_count
WITH (security_invoker = true)
AS
SELECT count(*)::bigint AS online_count
FROM public.gg_presence
WHERE last_heartbeat_at > now() - interval '2 minutes';

CREATE OR REPLACE VIEW public.v_gg_player_public
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.telegram_id,
  p.username,
  p.first_name,
  p.vip_level,
  p.vip_xp,
  w.balance_cents,
  w.stars_balance,
  w.total_wagered_cents,
  w.total_won_cents,
  p.last_seen_at
FROM public.gg_profiles p
JOIN public.gg_wallets w ON w.profile_id = p.id;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.gg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gg_profiles_updated_at ON public.gg_profiles;
CREATE TRIGGER gg_profiles_updated_at
BEFORE UPDATE ON public.gg_profiles
FOR EACH ROW EXECUTE FUNCTION public.gg_set_updated_at();

DROP TRIGGER IF EXISTS gg_wallets_updated_at ON public.gg_wallets;
CREATE TRIGGER gg_wallets_updated_at
BEFORE UPDATE ON public.gg_wallets
FOR EACH ROW EXECUTE FUNCTION public.gg_set_updated_at();

-- Stub: ensure profile + empty wallet (service role / future RPC)
CREATE OR REPLACE FUNCTION public.gg_ensure_profile(
  p_telegram_id bigint,
  p_username text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_language_code text DEFAULT 'ru'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.gg_profiles (telegram_id, username, first_name, last_name, language_code)
  VALUES (p_telegram_id, p_username, p_first_name, p_last_name, coalesce(p_language_code, 'ru'))
  ON CONFLICT (telegram_id) DO UPDATE
    SET username = COALESCE(EXCLUDED.username, public.gg_profiles.username),
        first_name = COALESCE(EXCLUDED.first_name, public.gg_profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.gg_profiles.last_name),
        language_code = COALESCE(EXCLUDED.language_code, public.gg_profiles.language_code),
        last_seen_at = now(),
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.gg_wallets (profile_id)
  VALUES (v_id)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gg_ensure_profile(bigint, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_ensure_profile(bigint, text, text, text, text) TO service_role;

-- Presence heartbeat helper
CREATE OR REPLACE FUNCTION public.gg_heartbeat(
  p_profile_id uuid,
  p_session_id text,
  p_game_id public.gg_game_id DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gg_presence (profile_id, session_id, game_id, last_heartbeat_at)
  VALUES (p_profile_id, p_session_id, p_game_id, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        game_id = EXCLUDED.game_id,
        last_heartbeat_at = now();

  UPDATE public.gg_profiles
  SET last_seen_at = now()
  WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gg_heartbeat(uuid, text, public.gg_game_id) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_heartbeat(uuid, text, public.gg_game_id) TO service_role;

-- RLS ON (no permissive policies yet — service_role bypasses RLS)
ALTER TABLE public.gg_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_star_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_star_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_casino_stats ENABLE ROW LEVEL SECURITY;

-- Read-only online count for anon (safe aggregate)
GRANT SELECT ON public.v_online_players_count TO anon, authenticated;
