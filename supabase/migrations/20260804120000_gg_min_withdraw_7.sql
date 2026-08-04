-- Raise minimum withdrawal to $7 (700 cents)
CREATE OR REPLACE FUNCTION public.gg_request_withdrawal(
  p_profile_id uuid,
  p_amount_cents bigint,
  p_asset text,
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
  v_available bigint;
BEGIN
  IF p_amount_cents < 700 THEN
    RAISE EXCEPTION 'MIN_WITHDRAW';
  END IF;
  IF p_address IS NULL OR length(trim(p_address)) < 10 THEN
    RAISE EXCEPTION 'BAD_ADDRESS';
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_wallet.total_wagered_cents <= 0 THEN
    RAISE EXCEPTION 'WAGER_REQUIRED';
  END IF;

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_amount_cents THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  UPDATE public.gg_wallets SET
    locked_cents = locked_cents + p_amount_cents
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_withdrawals (
    profile_id, amount_usd_cents, asset, recipient_address
  ) VALUES (
    p_profile_id, p_amount_cents, upper(p_asset), trim(p_address)
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'withdrawal_id', v_id,
    'locked_cents', p_amount_cents,
    'balance_cents', v_wallet.balance_cents
  );
END;
$$;
