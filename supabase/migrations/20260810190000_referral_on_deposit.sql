-- Referral commission: 20% of friend deposits (not losses)

-- ---------------------------------------------------------------------------
-- 1. gg_settle_bet — remove loss-based referral commission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_settle_bet(
  p_profile_id       uuid,
  p_game_id          public.gg_game_id,
  p_bet_cents        bigint,
  p_payout_cents     bigint,
  p_multiplier       numeric,
  p_status           public.gg_bet_status,
  p_result           jsonb      DEFAULT '{}'::jsonb,
  p_idempotency_key  text       DEFAULT NULL,
  p_client_seed      text       DEFAULT NULL,
  p_server_seed_hash text       DEFAULT NULL,
  p_server_seed      text       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet         record;
  v_bet_id         uuid;
  v_balance_after  bigint;
  v_ledger_kind    public.gg_ledger_kind;
  v_net_cents      bigint;
  v_xp_gain        int;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT bet_id INTO v_bet_id
    FROM public.gg_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_bet_id IS NOT NULL THEN
      RETURN (
        SELECT jsonb_build_object(
          'bet_id', v_bet_id,
          'balance_cents', balance_cents,
          'idempotent', true
        )
        FROM public.gg_wallets WHERE profile_id = p_profile_id
      );
    END IF;
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  IF v_wallet.balance_cents < p_bet_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents, need % cents',
      v_wallet.balance_cents, p_bet_cents;
  END IF;

  v_net_cents     := p_payout_cents - p_bet_cents;
  v_balance_after := v_wallet.balance_cents + v_net_cents;

  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'Balance would go negative: % + % = %',
      v_wallet.balance_cents, v_net_cents, v_balance_after;
  END IF;

  v_ledger_kind := CASE WHEN p_payout_cents > 0 THEN 'win'::public.gg_ledger_kind
                        ELSE 'bet'::public.gg_ledger_kind END;

  v_xp_gain := GREATEST(1, (p_bet_cents / 100)::int);

  INSERT INTO public.gg_bets (
    profile_id, game_id, status,
    bet_cents, payout_cents, multiplier,
    client_seed, server_seed_hash, server_seed,
    result, settled_at
  ) VALUES (
    p_profile_id, p_game_id, p_status,
    p_bet_cents, p_payout_cents, p_multiplier,
    p_client_seed, p_server_seed_hash, p_server_seed,
    p_result, now()
  ) RETURNING id INTO v_bet_id;

  UPDATE public.gg_wallets SET
    balance_cents       = v_balance_after,
    total_wagered_cents = total_wagered_cents + p_bet_cents,
    total_won_cents     = total_won_cents  + CASE WHEN p_payout_cents > 0 THEN p_payout_cents ELSE 0 END,
    total_lost_cents    = total_lost_cents + CASE WHEN p_payout_cents = 0 THEN p_bet_cents    ELSE 0 END
  WHERE profile_id = p_profile_id;

  UPDATE public.gg_profiles SET
    vip_xp = vip_xp + v_xp_gain,
    last_seen_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    bet_id, idempotency_key, meta
  ) VALUES (
    p_profile_id,
    v_ledger_kind,
    v_net_cents,
    v_balance_after,
    v_bet_id,
    p_idempotency_key,
    jsonb_build_object(
      'game_id',    p_game_id,
      'bet_cents',  p_bet_cents,
      'payout_cents', p_payout_cents,
      'multiplier', p_multiplier
    )
  );

  RETURN jsonb_build_object(
    'bet_id',        v_bet_id,
    'balance_cents', v_balance_after,
    'payout_cents',  p_payout_cents,
    'net_cents',     v_net_cents,
    'idempotent',    false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. gg_complete_deposit — credit referrer 20% of deposit
-- ---------------------------------------------------------------------------
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

  -- Referral: 20% of friend's deposit
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
      v_commission := floor(p_amount_usd_cents * 0.20)::bigint;
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
                'pct', 20
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
