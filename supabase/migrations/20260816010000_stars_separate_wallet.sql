-- Stars top-up credits only stars_balance. Do not convert into USD play money.

CREATE OR REPLACE FUNCTION public.gg_credit_stars(
  p_profile_id                uuid,
  p_stars_amount              integer,
  p_usd_cents                 bigint,
  p_telegram_payment_charge_id text,
  p_payload                   text DEFAULT NULL,
  p_meta                      jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id   uuid;
  v_wallet       record;
  v_stars_after  integer;
BEGIN
  SELECT id INTO v_payment_id
  FROM public.gg_star_payments
  WHERE telegram_payment_charge_id = p_telegram_payment_charge_id;

  IF v_payment_id IS NOT NULL THEN
    SELECT stars_balance INTO v_stars_after
    FROM public.gg_wallets
    WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'payment_id',    v_payment_id,
      'balance_cents', (SELECT balance_cents FROM public.gg_wallets WHERE profile_id = p_profile_id),
      'stars_balance', COALESCE(v_stars_after, 0),
      'idempotent',    true
    );
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  v_stars_after := v_wallet.stars_balance + p_stars_amount;

  INSERT INTO public.gg_star_payments (
    profile_id, telegram_payment_charge_id,
    stars_amount, usd_cents, status,
    payload, meta, completed_at
  ) VALUES (
    p_profile_id, p_telegram_payment_charge_id,
    p_stars_amount, 0, 'paid',
    p_payload, p_meta, now()
  ) RETURNING id INTO v_payment_id;

  UPDATE public.gg_wallets SET
    stars_balance = v_stars_after
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_star_ledger (
    profile_id, delta_stars, stars_after,
    reason, star_payment_id
  ) VALUES (
    p_profile_id, p_stars_amount, v_stars_after,
    'purchase', v_payment_id
  );

  RETURN jsonb_build_object(
    'payment_id',    v_payment_id,
    'balance_cents', v_wallet.balance_cents,
    'stars_balance', v_stars_after,
    'idempotent',    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_credit_stars(uuid, integer, bigint, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_credit_stars(uuid, integer, bigint, text, text, jsonb) TO service_role;

