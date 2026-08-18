-- Bind referrer + one-time signup bonus for invitee and referrer.

CREATE OR REPLACE FUNCTION public.gg_apply_referral_signup(
  p_profile_id uuid,
  p_referrer_telegram_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me            record;
  v_ref_id        uuid;
  v_wallet        record;
  v_ref_wallet    record;
  v_invitee_cents bigint := 100;
  v_referrer_cents bigint := 50;
  v_invitee_key   text;
  v_referrer_key  text;
  v_invitee_after bigint;
  v_referrer_after bigint;
  v_bound         boolean := false;
BEGIN
  IF p_referrer_telegram_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer');
  END IF;

  SELECT * INTO v_me FROM public.gg_profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_me.telegram_id = p_referrer_telegram_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  SELECT id INTO v_ref_id
  FROM public.gg_profiles
  WHERE telegram_id = p_referrer_telegram_id
    AND is_blocked = false
  LIMIT 1;

  IF v_ref_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_missing');
  END IF;

  IF v_me.referrer_telegram_id IS NULL THEN
    UPDATE public.gg_profiles
    SET referrer_telegram_id = p_referrer_telegram_id,
        updated_at = now()
    WHERE id = p_profile_id;
    v_bound := true;
  ELSIF v_me.referrer_telegram_id <> p_referrer_telegram_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_bound_other', 'referrer_telegram_id', v_me.referrer_telegram_id);
  END IF;

  v_invitee_key := 'ref:signup:invitee:' || p_profile_id::text;
  v_referrer_key := 'ref:signup:referrer:' || p_profile_id::text;

  IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = v_invitee_key) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'bound', v_bound,
      'paid', false,
      'idempotent', true,
      'invitee_cents', 0,
      'referrer_cents', 0,
      'referrer_profile_id', v_ref_id,
      'referrer_telegram_id', p_referrer_telegram_id
    );
  END IF;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  SELECT * INTO v_ref_wallet FROM public.gg_wallets WHERE profile_id = v_ref_id FOR UPDATE;
  IF NOT FOUND OR v_wallet IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  v_invitee_after := v_wallet.balance_cents + v_invitee_cents;
  UPDATE public.gg_wallets SET balance_cents = v_invitee_after, updated_at = now() WHERE profile_id = p_profile_id;
  INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta)
  VALUES (
    p_profile_id, 'bonus', v_invitee_cents, v_invitee_after, v_invitee_key,
    jsonb_build_object('reason', 'referral_signup', 'referrer_telegram_id', p_referrer_telegram_id)
  );

  v_referrer_after := v_ref_wallet.balance_cents + v_referrer_cents;
  UPDATE public.gg_wallets SET balance_cents = v_referrer_after, updated_at = now() WHERE profile_id = v_ref_id;
  INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta)
  VALUES (
    v_ref_id, 'referral', v_referrer_cents, v_referrer_after, v_referrer_key,
    jsonb_build_object('reason', 'signup', 'friend_profile_id', p_profile_id, 'pct', 0)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'bound', true,
    'paid', true,
    'idempotent', false,
    'invitee_cents', v_invitee_cents,
    'invitee_balance_cents', v_invitee_after,
    'referrer_cents', v_referrer_cents,
    'referrer_profile_id', v_ref_id,
    'referrer_telegram_id', p_referrer_telegram_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_apply_referral_signup(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_apply_referral_signup(uuid, bigint) TO service_role;
