-- Stars withdrawals by application + process/cancel must not touch USD locks.
-- Also: credit Stars by invoice payload so polling and successful_payment cannot double-credit.

CREATE UNIQUE INDEX IF NOT EXISTS gg_star_payments_payload_uidx
  ON public.gg_star_payments (payload)
  WHERE payload IS NOT NULL AND payload <> '';

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
  IF p_payload IS NOT NULL AND length(trim(p_payload)) > 0 THEN
    SELECT id INTO v_payment_id
    FROM public.gg_star_payments
    WHERE payload = p_payload;
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
  END IF;

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

CREATE OR REPLACE FUNCTION public.gg_request_star_withdrawal(
  p_profile_id uuid,
  p_stars integer,
  p_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet record;
  v_id uuid;
BEGIN
  IF p_stars IS NULL OR p_stars < 1 THEN
    RAISE EXCEPTION 'MIN_WITHDRAW';
  END IF;
  IF p_address IS NULL OR length(trim(p_address)) < 3 THEN
    RAISE EXCEPTION 'BAD_ADDRESS';
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_wallet.stars_balance < p_stars THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  UPDATE public.gg_wallets SET
    stars_balance = stars_balance - p_stars
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_star_ledger (
    profile_id, delta_stars, stars_after, reason
  ) VALUES (
    p_profile_id,
    -p_stars,
    v_wallet.stars_balance - p_stars,
    'withdraw_request'
  );

  INSERT INTO public.gg_withdrawals (
    profile_id, amount_usd_cents, asset, recipient_address
  ) VALUES (
    p_profile_id, p_stars, 'STARS', trim(p_address)
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'withdrawal_id', v_id,
    'stars_balance', v_wallet.stars_balance - p_stars,
    'stars_amount', p_stars
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_request_star_withdrawal(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_request_star_withdrawal(uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.gg_process_withdrawal(
  p_withdrawal_id uuid,
  p_action text,
  p_admin_telegram_id bigint DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd record;
  v_wallet record;
  v_balance_after bigint;
  v_stars_after integer;
BEGIN
  SELECT * INTO v_wd
  FROM public.gg_withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
  END IF;

  IF v_wd.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_PROCESSED', 'status', v_wd.status);
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = v_wd.profile_id
  FOR UPDATE;

  IF upper(v_wd.asset) = 'STARS' THEN
    IF p_action = 'approved' THEN
      UPDATE public.gg_withdrawals SET
        status = 'approved',
        admin_telegram_id = p_admin_telegram_id,
        processed_at = now()
      WHERE id = p_withdrawal_id;

      RETURN jsonb_build_object(
        'ok', true, 'status', 'approved',
        'profile_id', v_wd.profile_id,
        'amount_usd_cents', v_wd.amount_usd_cents,
        'asset', 'STARS',
        'stars_amount', v_wd.amount_usd_cents
      );
    ELSIF p_action = 'rejected' THEN
      v_stars_after := v_wallet.stars_balance + v_wd.amount_usd_cents::integer;
      UPDATE public.gg_wallets SET
        stars_balance = v_stars_after
      WHERE profile_id = v_wd.profile_id;

      INSERT INTO public.gg_star_ledger (
        profile_id, delta_stars, stars_after, reason
      ) VALUES (
        v_wd.profile_id, v_wd.amount_usd_cents::integer, v_stars_after, 'withdraw_reject'
      );

      UPDATE public.gg_withdrawals SET
        status = 'rejected',
        admin_telegram_id = p_admin_telegram_id,
        reject_reason = p_reason,
        processed_at = now()
      WHERE id = p_withdrawal_id;

      RETURN jsonb_build_object(
        'ok', true, 'status', 'rejected',
        'profile_id', v_wd.profile_id,
        'amount_usd_cents', v_wd.amount_usd_cents,
        'asset', 'STARS',
        'stars_amount', v_wd.amount_usd_cents,
        'stars_balance', v_stars_after
      );
    ELSE
      RAISE EXCEPTION 'BAD_ACTION';
    END IF;
  END IF;

  IF p_action = 'approved' THEN
    v_balance_after := v_wallet.balance_cents - v_wd.amount_usd_cents;
    IF v_balance_after < 0 THEN
      RAISE EXCEPTION 'BALANCE_NEGATIVE';
    END IF;

    UPDATE public.gg_wallets SET
      balance_cents = v_balance_after,
      locked_cents = GREATEST(0, locked_cents - v_wd.amount_usd_cents),
      total_withdrawn_cents = total_withdrawn_cents + v_wd.amount_usd_cents
    WHERE profile_id = v_wd.profile_id;

    UPDATE public.gg_withdrawals SET
      status = 'approved',
      admin_telegram_id = p_admin_telegram_id,
      processed_at = now()
    WHERE id = p_withdrawal_id;

    INSERT INTO public.gg_ledger (
      profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
    ) VALUES (
      v_wd.profile_id, 'withdraw', -v_wd.amount_usd_cents, v_balance_after,
      'wd_' || p_withdrawal_id::text,
      jsonb_build_object(
        'withdrawal_id', p_withdrawal_id,
        'asset', v_wd.asset,
        'address', v_wd.recipient_address,
        'admin', p_admin_telegram_id
      )
    );

    RETURN jsonb_build_object(
      'ok', true, 'status', 'approved',
      'balance_cents', v_balance_after,
      'profile_id', v_wd.profile_id,
      'amount_usd_cents', v_wd.amount_usd_cents,
      'asset', v_wd.asset
    );

  ELSIF p_action = 'rejected' THEN
    UPDATE public.gg_wallets SET
      locked_cents = GREATEST(0, locked_cents - v_wd.amount_usd_cents)
    WHERE profile_id = v_wd.profile_id;

    UPDATE public.gg_withdrawals SET
      status = 'rejected',
      admin_telegram_id = p_admin_telegram_id,
      reject_reason = p_reason,
      processed_at = now()
    WHERE id = p_withdrawal_id;

    RETURN jsonb_build_object(
      'ok', true, 'status', 'rejected',
      'balance_cents', v_wallet.balance_cents,
      'profile_id', v_wd.profile_id,
      'amount_usd_cents', v_wd.amount_usd_cents,
      'asset', v_wd.asset
    );
  ELSE
    RAISE EXCEPTION 'BAD_ACTION';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gg_cancel_withdrawal(
  p_withdrawal_id uuid,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd record;
  v_wallet record;
  v_stars_after integer;
BEGIN
  SELECT * INTO v_wd
  FROM public.gg_withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
  END IF;

  IF v_wd.profile_id <> p_profile_id THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
  END IF;

  IF v_wd.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_PROCESSED', 'status', v_wd.status);
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = v_wd.profile_id
  FOR UPDATE;

  IF upper(v_wd.asset) = 'STARS' THEN
    v_stars_after := v_wallet.stars_balance + v_wd.amount_usd_cents::integer;
    UPDATE public.gg_wallets SET
      stars_balance = v_stars_after
    WHERE profile_id = v_wd.profile_id;

    INSERT INTO public.gg_star_ledger (
      profile_id, delta_stars, stars_after, reason
    ) VALUES (
      v_wd.profile_id, v_wd.amount_usd_cents::integer, v_stars_after, 'withdraw_cancel'
    );

    UPDATE public.gg_withdrawals SET
      status = 'cancelled',
      reject_reason = 'Cancelled by player',
      processed_at = now()
    WHERE id = p_withdrawal_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'cancelled',
      'asset', 'STARS',
      'stars_balance', v_stars_after,
      'amount_usd_cents', v_wd.amount_usd_cents
    );
  END IF;

  UPDATE public.gg_wallets SET
    locked_cents = GREATEST(0, locked_cents - v_wd.amount_usd_cents)
  WHERE profile_id = v_wd.profile_id;

  UPDATE public.gg_withdrawals SET
    status = 'cancelled',
    reject_reason = 'Cancelled by player',
    processed_at = now()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'cancelled',
    'balance_cents', v_wallet.balance_cents,
    'locked_cents', GREATEST(0, v_wallet.locked_cents - v_wd.amount_usd_cents),
    'amount_usd_cents', v_wd.amount_usd_cents
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gg_process_withdrawal(uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gg_cancel_withdrawal(uuid, uuid) TO service_role;
