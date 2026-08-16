-- 25% referral commission on Stars top-ups (star-cents). Also align USD deposits to 25%.

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
  v_payment_id    uuid;
  v_wallet        record;
  v_stars_after   integer;
  v_credit        integer;
  v_referrer_tg   bigint;
  v_referrer_id   uuid;
  v_ref_wallet    record;
  v_commission    integer;
  v_ref_after     integer;
  v_ref_key       text;
BEGIN
  v_credit := GREATEST(0, COALESCE(p_stars_amount, 0)) * 100;

  IF p_payload IS NOT NULL AND length(trim(p_payload)) > 0 THEN
    SELECT id INTO v_payment_id FROM public.gg_star_payments WHERE payload = p_payload;
    IF v_payment_id IS NOT NULL THEN
      SELECT stars_balance INTO v_stars_after FROM public.gg_wallets WHERE profile_id = p_profile_id;
      RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'balance_cents', (SELECT balance_cents FROM public.gg_wallets WHERE profile_id = p_profile_id),
        'stars_balance', COALESCE(v_stars_after, 0),
        'idempotent', true,
        'referral_stars', 0
      );
    END IF;
  END IF;

  SELECT id INTO v_payment_id
  FROM public.gg_star_payments
  WHERE telegram_payment_charge_id = p_telegram_payment_charge_id;
  IF v_payment_id IS NOT NULL THEN
    SELECT stars_balance INTO v_stars_after FROM public.gg_wallets WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'payment_id', v_payment_id,
      'balance_cents', (SELECT balance_cents FROM public.gg_wallets WHERE profile_id = p_profile_id),
      'stars_balance', COALESCE(v_stars_after, 0),
      'idempotent', true,
      'referral_stars', 0
    );
  END IF;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  v_stars_after := v_wallet.stars_balance + v_credit;

  INSERT INTO public.gg_star_payments (
    profile_id, telegram_payment_charge_id,
    stars_amount, usd_cents, status, payload, meta, completed_at
  ) VALUES (
    p_profile_id, p_telegram_payment_charge_id,
    p_stars_amount, 0, 'paid', p_payload, p_meta, now()
  ) RETURNING id INTO v_payment_id;

  UPDATE public.gg_wallets SET stars_balance = v_stars_after WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, star_payment_id)
  VALUES (p_profile_id, v_credit, v_stars_after, 'purchase', v_payment_id);

  v_commission := 0;
  SELECT referrer_telegram_id INTO v_referrer_tg
  FROM public.gg_profiles
  WHERE id = p_profile_id;

  IF v_referrer_tg IS NOT NULL THEN
    SELECT id INTO v_referrer_id
    FROM public.gg_profiles
    WHERE telegram_id = v_referrer_tg
      AND is_blocked = false
    LIMIT 1;

    IF v_referrer_id IS NOT NULL AND v_referrer_id <> p_profile_id THEN
      v_commission := floor(v_credit * 0.25)::integer;
      IF v_commission > 0 THEN
        v_ref_key := 'ref:stars:' || p_telegram_payment_charge_id;
        IF NOT EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = v_ref_key) THEN
          SELECT * INTO v_ref_wallet
          FROM public.gg_wallets
          WHERE profile_id = v_referrer_id
          FOR UPDATE;

          IF FOUND THEN
            v_ref_after := v_ref_wallet.stars_balance + v_commission;
            UPDATE public.gg_wallets SET
              stars_balance = v_ref_after,
              updated_at = now()
            WHERE profile_id = v_referrer_id;

            INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, meta)
            VALUES (
              v_referrer_id, v_commission, v_ref_after, 'referral',
              jsonb_build_object(
                'friend_profile_id', p_profile_id,
                'star_payment_id', v_payment_id,
                'deposit_star_cents', v_credit,
                'pct', 25
              )
            );

            INSERT INTO public.gg_ledger (
              profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
            ) VALUES (
              v_referrer_id,
              'referral'::public.gg_ledger_kind,
              0,
              v_ref_wallet.balance_cents,
              v_ref_key,
              jsonb_build_object(
                'wallet', 'STARS',
                'friend_profile_id', p_profile_id,
                'star_cents', v_commission,
                'deposit_star_cents', v_credit,
                'pct', 25
              )
            );
          ELSE
            v_commission := 0;
          END IF;
        ELSE
          v_commission := 0;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'balance_cents', v_wallet.balance_cents,
    'stars_balance', v_stars_after,
    'idempotent', false,
    'referral_stars', v_commission
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_credit_stars(uuid, integer, bigint, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_credit_stars(uuid, integer, bigint, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.gg_complete_deposit(
  p_deposit_id uuid,
  p_amount_usd_cents bigint,
  p_external_id text,
  p_crypto_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep               record;
  v_wallet            record;
  v_balance_after     bigint;
  v_referrer_tg       bigint;
  v_referrer_id       uuid;
  v_ref_wallet        record;
  v_commission        bigint;
  v_ref_balance_after bigint;
  v_ref_key           text;
BEGIN
  SELECT * INTO v_dep
  FROM public.gg_deposit_requests
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit % not found', p_deposit_id;
  END IF;

  IF v_dep.status = 'completed' THEN
    RETURN (
      SELECT jsonb_build_object(
        'ok', true, 'idempotent', true,
        'balance_cents', w.balance_cents
      )
      FROM public.gg_wallets w WHERE w.profile_id = v_dep.profile_id
    );
  END IF;

  IF p_amount_usd_cents <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be positive';
  END IF;

  IF p_external_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gg_deposit_requests
    WHERE external_id = p_external_id AND status = 'completed' AND id <> p_deposit_id
  ) THEN
    RAISE EXCEPTION 'External payment % already credited', p_external_id;
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = v_dep.profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', v_dep.profile_id;
  END IF;

  v_balance_after := v_wallet.balance_cents + p_amount_usd_cents;

  UPDATE public.gg_wallets SET
    balance_cents = v_balance_after,
    total_deposited_cents = total_deposited_cents + p_amount_usd_cents
  WHERE profile_id = v_dep.profile_id;

  UPDATE public.gg_deposit_requests SET
    status = 'completed',
    amount_usd_cents = p_amount_usd_cents,
    external_id = COALESCE(p_external_id, external_id),
    crypto_amount = COALESCE(p_crypto_amount, crypto_amount),
    completed_at = now()
  WHERE id = p_deposit_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
  ) VALUES (
    v_dep.profile_id, 'deposit', p_amount_usd_cents, v_balance_after,
    'dep_' || COALESCE(p_external_id, p_deposit_id::text),
    jsonb_build_object(
      'deposit_id', p_deposit_id,
      'provider', v_dep.provider,
      'asset', v_dep.crypto_asset,
      'crypto_amount', p_crypto_amount
    )
  );

  SELECT referrer_telegram_id INTO v_referrer_tg
  FROM public.gg_profiles
  WHERE id = v_dep.profile_id;

  IF v_referrer_tg IS NOT NULL THEN
    SELECT id INTO v_referrer_id
    FROM public.gg_profiles
    WHERE telegram_id = v_referrer_tg
      AND is_blocked = false
    LIMIT 1;

    IF v_referrer_id IS NOT NULL AND v_referrer_id <> v_dep.profile_id THEN
      v_commission := floor(p_amount_usd_cents * 0.25)::bigint;
      IF v_commission > 0 THEN
        v_ref_key := 'ref:dep:' || COALESCE(p_external_id, p_deposit_id::text);

        IF NOT EXISTS (
          SELECT 1 FROM public.gg_ledger WHERE idempotency_key = v_ref_key
        ) THEN
          SELECT * INTO v_ref_wallet
          FROM public.gg_wallets
          WHERE profile_id = v_referrer_id
          FOR UPDATE;

          IF FOUND THEN
            v_ref_balance_after := v_ref_wallet.balance_cents + v_commission;
            UPDATE public.gg_wallets SET
              balance_cents = v_ref_balance_after,
              updated_at = now()
            WHERE profile_id = v_referrer_id;

            INSERT INTO public.gg_ledger (
              profile_id, kind, amount_cents, balance_after_cents,
              idempotency_key, meta
            ) VALUES (
              v_referrer_id,
              'referral'::public.gg_ledger_kind,
              v_commission,
              v_ref_balance_after,
              v_ref_key,
              jsonb_build_object(
                'friend_profile_id', v_dep.profile_id,
                'deposit_id', p_deposit_id,
                'deposit_cents', p_amount_usd_cents,
                'pct', 25
              )
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false,
    'balance_cents', v_balance_after,
    'profile_id', v_dep.profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_complete_deposit(uuid, bigint, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_complete_deposit(uuid, bigint, text, numeric) TO service_role;
