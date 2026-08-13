-- Player can cancel a pending withdrawal; locked funds become available again.

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

REVOKE ALL ON FUNCTION public.gg_cancel_withdrawal(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_cancel_withdrawal(uuid, uuid) TO service_role;
