-- Additive payment and Jackpot support.
ALTER TYPE public.gg_deposit_provider ADD VALUE IF NOT EXISTS 'manual';

ALTER TABLE public.gg_withdrawals
  ADD COLUMN IF NOT EXISTS payout_tx_hash text;

CREATE OR REPLACE FUNCTION public.gg_credit_jackpot(
  p_profile_id uuid,
  p_spin_id text,
  p_amount_stars integer DEFAULT 20000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet record;
  v_after integer;
  v_key text;
BEGIN
  IF p_profile_id IS NULL OR p_spin_id IS NULL OR length(trim(p_spin_id)) < 8 THEN
    RAISE EXCEPTION 'BAD_JACKPOT_REQUEST';
  END IF;
  IF p_amount_stars <> 20000 THEN
    RAISE EXCEPTION 'BAD_JACKPOT_AMOUNT';
  END IF;
  v_key := 'jackpot:' || trim(p_spin_id);

  IF EXISTS (
    SELECT 1 FROM public.gg_ledger WHERE idempotency_key = v_key
  ) THEN
    SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'stars_balance', v_wallet.stars_balance);
  END IF;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  v_after := v_wallet.stars_balance + p_amount_stars * 100;
  UPDATE public.gg_wallets SET stars_balance = v_after, updated_at = now()
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, meta)
  VALUES (p_profile_id, p_amount_stars * 100, v_after, 'jackpot', jsonb_build_object('spin_id', p_spin_id, 'stars', p_amount_stars));

  INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta)
  VALUES (p_profile_id, 'bonus'::public.gg_ledger_kind, 0, v_wallet.balance_cents, v_key,
          jsonb_build_object('wallet', 'STARS', 'reason', 'jackpot', 'spin_id', p_spin_id, 'stars', p_amount_stars));

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'stars_balance', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.gg_credit_jackpot(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_credit_jackpot(uuid, text, integer) TO service_role;
