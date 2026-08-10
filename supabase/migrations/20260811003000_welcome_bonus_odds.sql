-- Welcome bonus odds: $10 = 0.15%, $100 = 0.001%
-- Roll scale: 1_000_000
--   $100: 10 / 1e6 = 0.001%
--   $10:  1500 / 1e6 = 0.15%
--   rest split across $0.5 / $1 / $2

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

  IF v_profile.welcome_bonus_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_claimed', true,
      'amount_cents', 0,
      'balance_cents', v_wallet.balance_cents
    );
  END IF;

  v_idem := 'welcome_bonus:' || p_profile_id::text;
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

  -- 0 .. 999999
  v_roll := floor(random() * 1000000)::int;

  IF v_roll < 10 THEN
    v_amount := 10000;   -- $100  0.001%
  ELSIF v_roll < 1510 THEN
    v_amount := 1000;    -- $10   0.15%
  ELSIF v_roll < 263270 THEN
    v_amount := 50;      -- $0.5  ~26.176%
  ELSIF v_roll < 599270 THEN
    v_amount := 200;     -- $2    ~33.6%
  ELSE
    v_amount := 100;     -- $1    ~40.073%
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
    jsonb_build_object('reason', 'welcome_wheel', 'slice_cents', v_amount, 'roll', v_roll)
  );

  RETURN jsonb_build_object(
    'already_claimed', false,
    'amount_cents', v_amount,
    'balance_cents', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_claim_welcome_bonus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_claim_welcome_bonus(uuid) TO service_role;
