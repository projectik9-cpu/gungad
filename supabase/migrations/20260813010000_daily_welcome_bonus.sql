-- Daily welcome wheel (once per Moscow calendar day) + broadcast bookkeeping

ALTER TABLE public.gg_profiles
  ADD COLUMN IF NOT EXISTS bot_blocked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.gg_broadcast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  run_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  UNIQUE (kind, run_date)
);

ALTER TABLE public.gg_broadcast_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS gg_profiles_bonus_notify_idx
  ON public.gg_profiles (telegram_id)
  WHERE is_blocked = false AND bot_blocked_at IS NULL;

CREATE OR REPLACE FUNCTION public.gg_welcome_bonus_is_available(p_claimed_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_claimed_at IS NULL
    OR ((p_claimed_at AT TIME ZONE 'Europe/Moscow')::date
        < (timezone('Europe/Moscow', now()))::date);
$$;

CREATE OR REPLACE FUNCTION public.gg_claim_welcome_bonus(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   record;
  v_wallet    record;
  v_roll      int;
  v_amount    bigint;
  v_balance   bigint;
  v_idem      text;
  v_day       text;
BEGIN
  SELECT id, welcome_bonus_claimed_at
  INTO v_profile
  FROM public.gg_profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF NOT public.gg_welcome_bonus_is_available(v_profile.welcome_bonus_claimed_at) THEN
    RETURN jsonb_build_object(
      'already_claimed', true,
      'amount_cents', 0,
      'balance_cents', v_wallet.balance_cents
    );
  END IF;

  v_day := to_char((timezone('Europe/Moscow', now()))::date, 'YYYY-MM-DD');
  v_idem := 'welcome_bonus:' || p_profile_id::text || ':' || v_day;

  IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = v_idem) THEN
    UPDATE public.gg_profiles
    SET welcome_bonus_claimed_at = coalesce(welcome_bonus_claimed_at, now()),
        updated_at = now()
    WHERE id = p_profile_id;

    RETURN jsonb_build_object(
      'already_claimed', true,
      'amount_cents', 0,
      'balance_cents', v_wallet.balance_cents
    );
  END IF;

  v_roll := floor(random() * 1000000)::int;

  IF v_roll < 10 THEN
    v_amount := 10000;
  ELSIF v_roll < 1510 THEN
    v_amount := 1000;
  ELSIF v_roll < 263270 THEN
    v_amount := 50;
  ELSIF v_roll < 599270 THEN
    v_amount := 200;
  ELSE
    v_amount := 100;
  END IF;

  v_balance := v_wallet.balance_cents + v_amount;

  UPDATE public.gg_wallets SET
    balance_cents = v_balance,
    updated_at = now()
  WHERE profile_id = p_profile_id;

  UPDATE public.gg_profiles SET
    welcome_bonus_claimed_at = now(),
    updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
  ) VALUES (
    p_profile_id,
    'bonus'::public.gg_ledger_kind,
    v_amount,
    v_balance,
    v_idem,
    jsonb_build_object('reason', 'welcome_wheel', 'slice_cents', v_amount, 'roll', v_roll, 'day', v_day)
  );

  RETURN jsonb_build_object(
    'already_claimed', false,
    'amount_cents', v_amount,
    'balance_cents', v_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gg_get_wallet(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile_id',              w.profile_id,
    'balance_cents',           w.balance_cents,
    'locked_cents',            w.locked_cents,
    'stars_balance',           w.stars_balance,
    'total_wagered_cents',     w.total_wagered_cents,
    'total_won_cents',         w.total_won_cents,
    'total_lost_cents',        w.total_lost_cents,
    'vip_level',               p.vip_level,
    'vip_xp',                  p.vip_xp,
    'username',                p.username,
    'first_name',              p.first_name,
    'telegram_id',             p.telegram_id,
    'welcome_bonus_available', public.gg_welcome_bonus_is_available(p.welcome_bonus_claimed_at)
  ) INTO v_result
  FROM public.gg_wallets w
  JOIN public.gg_profiles p ON p.id = w.profile_id
  WHERE w.profile_id = p_profile_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gg_welcome_bonus_is_available(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_welcome_bonus_is_available(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.gg_claim_welcome_bonus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_claim_welcome_bonus(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.gg_get_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_get_wallet(uuid) TO service_role;
