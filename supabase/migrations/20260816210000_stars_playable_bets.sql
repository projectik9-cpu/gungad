-- Playable Stars wallet: store star-cents (1 Telegram Star = 100),
-- and settle/place/resolve bets against stars_balance when p_wallet = 'STARS'.

CREATE TABLE IF NOT EXISTS public.gg_internal_flags (
  key text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.gg_internal_flags WHERE key = 'stars_as_cents') THEN
    UPDATE public.gg_wallets
      SET stars_balance = stars_balance * 100;

    UPDATE public.gg_star_ledger
      SET delta_stars = delta_stars * 100,
          stars_after = stars_after * 100;

    UPDATE public.gg_withdrawals
      SET amount_usd_cents = amount_usd_cents * 100
      WHERE upper(asset) = 'STARS';

    INSERT INTO public.gg_internal_flags (key) VALUES ('stars_as_cents');
  END IF;
END $$;

ALTER TABLE public.gg_bets
  ADD COLUMN IF NOT EXISTS wallet_asset text NOT NULL DEFAULT 'USD';

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
  v_credit       integer;
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
        'idempotent', true
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
      'idempotent', true
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

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'balance_cents', v_wallet.balance_cents,
    'stars_balance', v_stars_after,
    'idempotent', false
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
  v_cents integer;
BEGIN
  IF p_stars IS NULL OR p_stars < 1 THEN
    RAISE EXCEPTION 'MIN_WITHDRAW';
  END IF;
  IF p_address IS NULL OR length(trim(p_address)) < 3 THEN
    RAISE EXCEPTION 'BAD_ADDRESS';
  END IF;

  v_cents := p_stars * 100;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_wallet.stars_balance < v_cents THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;

  UPDATE public.gg_wallets SET stars_balance = stars_balance - v_cents WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason)
  VALUES (p_profile_id, -v_cents, v_wallet.stars_balance - v_cents, 'withdraw_request');

  INSERT INTO public.gg_withdrawals (profile_id, amount_usd_cents, asset, recipient_address)
  VALUES (p_profile_id, v_cents, 'STARS', trim(p_address))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'withdrawal_id', v_id,
    'stars_balance', v_wallet.stars_balance - v_cents,
    'stars_amount', p_stars
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_request_star_withdrawal(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_request_star_withdrawal(uuid, integer, text) TO service_role;

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
  p_server_seed      text       DEFAULT NULL,
  p_wallet           text       DEFAULT 'USD'
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
  v_stars_after    integer;
  v_available      bigint;
  v_ledger_kind    public.gg_ledger_kind;
  v_net_cents      bigint;
  v_xp_gain        int;
  v_asset          text;
BEGIN
  v_asset := upper(COALESCE(p_wallet, 'USD'));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT bet_id INTO v_bet_id FROM public.gg_ledger WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_bet_id IS NOT NULL THEN
      RETURN (
        SELECT jsonb_build_object(
          'bet_id', v_bet_id,
          'balance_cents', w.balance_cents,
          'locked_cents', w.locked_cents,
          'stars_balance', w.stars_balance,
          'idempotent', true
        )
        FROM public.gg_wallets w WHERE profile_id = p_profile_id
      );
    END IF;
  END IF;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id; END IF;

  v_net_cents := p_payout_cents - p_bet_cents;
  v_ledger_kind := CASE WHEN p_payout_cents > 0 THEN 'win'::public.gg_ledger_kind ELSE 'bet'::public.gg_ledger_kind END;
  v_xp_gain := GREATEST(1, (p_bet_cents / 100)::int);

  IF v_asset = 'STARS' THEN
    IF v_wallet.stars_balance < p_bet_cents THEN
      RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents', v_wallet.stars_balance, p_bet_cents;
    END IF;
    v_stars_after := v_wallet.stars_balance + v_net_cents;
    IF v_stars_after < 0 THEN
      RAISE EXCEPTION 'Balance would go negative';
    END IF;

    INSERT INTO public.gg_bets (
      profile_id, game_id, status, bet_cents, payout_cents, multiplier,
      client_seed, server_seed_hash, server_seed, result, settled_at, wallet_asset
    ) VALUES (
      p_profile_id, p_game_id, p_status, p_bet_cents, p_payout_cents, p_multiplier,
      p_client_seed, p_server_seed_hash, p_server_seed,
      COALESCE(p_result, '{}'::jsonb) || jsonb_build_object('wallet', 'STARS'),
      now(), 'STARS'
    ) RETURNING id INTO v_bet_id;

    UPDATE public.gg_wallets SET stars_balance = v_stars_after WHERE profile_id = p_profile_id;
    UPDATE public.gg_profiles SET vip_xp = vip_xp + v_xp_gain, last_seen_at = now() WHERE id = p_profile_id;

    INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, meta)
    VALUES (p_profile_id, v_net_cents::integer, v_stars_after, 'bet', jsonb_build_object('bet_id', v_bet_id, 'game_id', p_game_id));

    INSERT INTO public.gg_ledger (
      profile_id, kind, amount_cents, balance_after_cents, bet_id, idempotency_key, meta
    ) VALUES (
      p_profile_id, v_ledger_kind, v_net_cents, v_wallet.balance_cents, v_bet_id, p_idempotency_key,
      jsonb_build_object('game_id', p_game_id, 'bet_cents', p_bet_cents, 'payout_cents', p_payout_cents, 'multiplier', p_multiplier, 'wallet', 'STARS')
    );

    RETURN jsonb_build_object(
      'bet_id', v_bet_id,
      'balance_cents', v_wallet.balance_cents,
      'locked_cents', v_wallet.locked_cents,
      'stars_balance', v_stars_after,
      'payout_cents', p_payout_cents,
      'net_cents', v_net_cents,
      'idempotent', false
    );
  END IF;

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_bet_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents', v_available, p_bet_cents;
  END IF;

  v_balance_after := v_wallet.balance_cents + v_net_cents;
  IF v_balance_after < v_wallet.locked_cents THEN
    RAISE EXCEPTION 'Balance would go below locked: % + % = %, locked %',
      v_wallet.balance_cents, v_net_cents, v_balance_after, v_wallet.locked_cents;
  END IF;

  INSERT INTO public.gg_bets (
    profile_id, game_id, status, bet_cents, payout_cents, multiplier,
    client_seed, server_seed_hash, server_seed, result, settled_at, wallet_asset
  ) VALUES (
    p_profile_id, p_game_id, p_status, p_bet_cents, p_payout_cents, p_multiplier,
    p_client_seed, p_server_seed_hash, p_server_seed, p_result, now(), 'USD'
  ) RETURNING id INTO v_bet_id;

  UPDATE public.gg_wallets SET
    balance_cents = v_balance_after,
    total_wagered_cents = total_wagered_cents + p_bet_cents,
    total_won_cents = total_won_cents + CASE WHEN p_payout_cents > 0 THEN p_payout_cents ELSE 0 END,
    total_lost_cents = total_lost_cents + CASE WHEN p_payout_cents = 0 THEN p_bet_cents ELSE 0 END
  WHERE profile_id = p_profile_id;

  UPDATE public.gg_profiles SET vip_xp = vip_xp + v_xp_gain, last_seen_at = now() WHERE id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents, bet_id, idempotency_key, meta
  ) VALUES (
    p_profile_id, v_ledger_kind, v_net_cents, v_balance_after, v_bet_id, p_idempotency_key,
    jsonb_build_object('game_id', p_game_id, 'bet_cents', p_bet_cents, 'payout_cents', p_payout_cents, 'multiplier', p_multiplier)
  );

  RETURN jsonb_build_object(
    'bet_id', v_bet_id,
    'balance_cents', v_balance_after,
    'locked_cents', v_wallet.locked_cents,
    'stars_balance', v_wallet.stars_balance,
    'payout_cents', p_payout_cents,
    'net_cents', v_net_cents,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gg_settle_bet(uuid, public.gg_game_id, bigint, bigint, numeric, public.gg_bet_status, jsonb, text, text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.gg_settle_bet(uuid, public.gg_game_id, bigint, bigint, numeric, public.gg_bet_status, jsonb, text, text, text, text);

CREATE OR REPLACE FUNCTION public.gg_place_bet(
  p_profile_id      uuid,
  p_game_id         public.gg_game_id,
  p_bet_cents       bigint,
  p_idempotency_key text DEFAULT NULL,
  p_wallet          text DEFAULT 'USD'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet        record;
  v_bet_id        uuid;
  v_available     bigint;
  v_balance_after bigint;
  v_stars_after   integer;
  v_xp_gain       int;
  v_asset         text;
BEGIN
  v_asset := upper(COALESCE(p_wallet, 'USD'));
  IF p_bet_cents IS NULL OR p_bet_cents <= 0 THEN
    RAISE EXCEPTION 'bet_cents must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT bet_id INTO v_bet_id FROM public.gg_ledger WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_bet_id IS NOT NULL THEN
      RETURN (
        SELECT jsonb_build_object(
          'bet_id', b.id,
          'balance_cents', w.balance_cents,
          'locked_cents', w.locked_cents,
          'stars_balance', w.stars_balance,
          'bet_cents', b.bet_cents,
          'status', b.status,
          'idempotent', true
        )
        FROM public.gg_bets b
        JOIN public.gg_wallets w ON w.profile_id = b.profile_id
        WHERE b.id = v_bet_id
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gg_bets
    WHERE profile_id = p_profile_id AND game_id = p_game_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Open bet already exists for this game';
  END IF;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id; END IF;

  v_xp_gain := GREATEST(1, (p_bet_cents / 100)::int);

  IF v_asset = 'STARS' THEN
    IF v_wallet.stars_balance < p_bet_cents THEN
      RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents', v_wallet.stars_balance, p_bet_cents;
    END IF;
    v_stars_after := v_wallet.stars_balance - p_bet_cents::integer;

    INSERT INTO public.gg_bets (profile_id, game_id, status, bet_cents, payout_cents, multiplier, result, wallet_asset)
    VALUES (p_profile_id, p_game_id, 'pending', p_bet_cents, 0, 0, jsonb_build_object('wallet', 'STARS'), 'STARS')
    RETURNING id INTO v_bet_id;

    UPDATE public.gg_wallets SET stars_balance = v_stars_after, updated_at = now() WHERE profile_id = p_profile_id;
    UPDATE public.gg_profiles SET vip_xp = vip_xp + v_xp_gain, last_seen_at = now() WHERE id = p_profile_id;

    INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, meta)
    VALUES (p_profile_id, -p_bet_cents::integer, v_stars_after, 'bet_place', jsonb_build_object('bet_id', v_bet_id));

    INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, bet_id, idempotency_key, meta)
    VALUES (p_profile_id, 'bet'::public.gg_ledger_kind, -p_bet_cents, v_wallet.balance_cents, v_bet_id, p_idempotency_key,
      jsonb_build_object('game_id', p_game_id, 'bet_cents', p_bet_cents, 'phase', 'place', 'wallet', 'STARS'));

    RETURN jsonb_build_object(
      'bet_id', v_bet_id,
      'balance_cents', v_wallet.balance_cents,
      'locked_cents', v_wallet.locked_cents,
      'stars_balance', v_stars_after,
      'bet_cents', p_bet_cents,
      'status', 'pending',
      'idempotent', false
    );
  END IF;

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_bet_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents', v_available, p_bet_cents;
  END IF;

  v_balance_after := v_wallet.balance_cents - p_bet_cents;

  INSERT INTO public.gg_bets (profile_id, game_id, status, bet_cents, payout_cents, multiplier, result, wallet_asset)
  VALUES (p_profile_id, p_game_id, 'pending', p_bet_cents, 0, 0, '{}'::jsonb, 'USD')
  RETURNING id INTO v_bet_id;

  UPDATE public.gg_wallets SET
    balance_cents = v_balance_after,
    total_wagered_cents = total_wagered_cents + p_bet_cents,
    updated_at = now()
  WHERE profile_id = p_profile_id;

  UPDATE public.gg_profiles SET vip_xp = vip_xp + v_xp_gain, last_seen_at = now() WHERE id = p_profile_id;

  INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, bet_id, idempotency_key, meta)
  VALUES (p_profile_id, 'bet'::public.gg_ledger_kind, -p_bet_cents, v_balance_after, v_bet_id, p_idempotency_key,
    jsonb_build_object('game_id', p_game_id, 'bet_cents', p_bet_cents, 'phase', 'place'));

  RETURN jsonb_build_object(
    'bet_id', v_bet_id,
    'balance_cents', v_balance_after,
    'locked_cents', v_wallet.locked_cents,
    'stars_balance', v_wallet.stars_balance,
    'bet_cents', p_bet_cents,
    'status', 'pending',
    'idempotent', false
  );
END;
$$;

DROP FUNCTION IF EXISTS public.gg_place_bet(uuid, public.gg_game_id, bigint, text);
GRANT EXECUTE ON FUNCTION public.gg_place_bet(uuid, public.gg_game_id, bigint, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.gg_resolve_bet(
  p_profile_id uuid,
  p_bet_id     uuid,
  p_status     public.gg_bet_status,
  p_multiplier numeric DEFAULT 0,
  p_result     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet           record;
  v_wallet        record;
  v_payout_cents  bigint;
  v_balance_after bigint;
  v_stars_after   integer;
  v_mult          numeric;
  v_asset         text;
BEGIN
  IF p_status NOT IN ('lost', 'cashed_out', 'won', 'push', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid resolve status: %', p_status;
  END IF;

  SELECT * INTO v_bet FROM public.gg_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet % not found', p_bet_id; END IF;
  IF v_bet.profile_id <> p_profile_id THEN RAISE EXCEPTION 'Bet does not belong to profile'; END IF;

  v_asset := upper(COALESCE(v_bet.wallet_asset, 'USD'));

  IF v_bet.status <> 'pending' THEN
    SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'bet_id', v_bet.id,
      'balance_cents', v_wallet.balance_cents,
      'locked_cents', v_wallet.locked_cents,
      'stars_balance', v_wallet.stars_balance,
      'payout_cents', v_bet.payout_cents,
      'multiplier', v_bet.multiplier,
      'status', v_bet.status,
      'idempotent', true
    );
  END IF;

  SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id; END IF;

  IF v_asset = 'STARS' THEN
    IF p_status = 'cancelled' THEN
      v_payout_cents := v_bet.bet_cents;
      v_stars_after := v_wallet.stars_balance + v_bet.bet_cents::integer;
      UPDATE public.gg_bets SET status = 'cancelled', payout_cents = v_payout_cents, multiplier = 1,
        result = COALESCE(p_result, '{}'::jsonb), settled_at = now() WHERE id = p_bet_id;
      UPDATE public.gg_wallets SET stars_balance = v_stars_after, updated_at = now() WHERE profile_id = p_profile_id;
      INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, meta)
      VALUES (p_profile_id, v_bet.bet_cents::integer, v_stars_after, 'bet_cancel', jsonb_build_object('bet_id', p_bet_id));
      RETURN jsonb_build_object(
        'bet_id', p_bet_id, 'balance_cents', v_wallet.balance_cents, 'locked_cents', v_wallet.locked_cents,
        'stars_balance', v_stars_after, 'payout_cents', v_payout_cents, 'multiplier', 1, 'status', 'cancelled', 'idempotent', false
      );
    END IF;

    IF p_status = 'lost' THEN
      UPDATE public.gg_bets SET status = 'lost', payout_cents = 0, multiplier = 0,
        result = COALESCE(p_result, '{}'::jsonb), settled_at = now() WHERE id = p_bet_id;
      RETURN jsonb_build_object(
        'bet_id', p_bet_id, 'balance_cents', v_wallet.balance_cents, 'locked_cents', v_wallet.locked_cents,
        'stars_balance', v_wallet.stars_balance, 'payout_cents', 0, 'multiplier', 0, 'status', 'lost', 'idempotent', false
      );
    END IF;

    v_mult := COALESCE(p_multiplier, 0);
    IF p_status = 'push' THEN v_mult := 1; END IF;
    IF v_mult < 1 OR v_mult > 1000 THEN RAISE EXCEPTION 'Invalid multiplier: %', v_mult; END IF;
    v_payout_cents := round(v_bet.bet_cents * v_mult)::bigint;
    v_stars_after := v_wallet.stars_balance + v_payout_cents::integer;

    UPDATE public.gg_bets SET status = p_status, payout_cents = v_payout_cents, multiplier = v_mult,
      result = COALESCE(p_result, '{}'::jsonb), settled_at = now() WHERE id = p_bet_id;
    UPDATE public.gg_wallets SET stars_balance = v_stars_after, updated_at = now() WHERE profile_id = p_profile_id;
    INSERT INTO public.gg_star_ledger (profile_id, delta_stars, stars_after, reason, meta)
    VALUES (p_profile_id, v_payout_cents::integer, v_stars_after, 'bet_win', jsonb_build_object('bet_id', p_bet_id));

    RETURN jsonb_build_object(
      'bet_id', p_bet_id, 'balance_cents', v_wallet.balance_cents, 'locked_cents', v_wallet.locked_cents,
      'stars_balance', v_stars_after, 'payout_cents', v_payout_cents, 'multiplier', v_mult, 'status', p_status, 'idempotent', false
    );
  END IF;

  IF p_status = 'cancelled' THEN
    v_payout_cents := v_bet.bet_cents;
    v_balance_after := v_wallet.balance_cents + v_bet.bet_cents;
    UPDATE public.gg_bets SET status = 'cancelled', payout_cents = v_payout_cents, multiplier = 1,
      result = COALESCE(p_result, '{}'::jsonb), settled_at = now() WHERE id = p_bet_id;
    UPDATE public.gg_wallets SET
      balance_cents = v_balance_after,
      total_wagered_cents = GREATEST(0, total_wagered_cents - v_bet.bet_cents),
      updated_at = now()
    WHERE profile_id = p_profile_id;
    INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, bet_id, meta)
    VALUES (p_profile_id, 'refund'::public.gg_ledger_kind, v_bet.bet_cents, v_balance_after, p_bet_id,
      jsonb_build_object('game_id', v_bet.game_id, 'bet_cents', v_bet.bet_cents, 'phase', 'cancel_refund'));
    RETURN jsonb_build_object(
      'bet_id', p_bet_id, 'balance_cents', v_balance_after, 'locked_cents', v_wallet.locked_cents,
      'stars_balance', v_wallet.stars_balance, 'payout_cents', v_payout_cents, 'multiplier', 1, 'status', 'cancelled', 'idempotent', false
    );
  END IF;

  IF p_status = 'lost' THEN
    UPDATE public.gg_bets SET status = 'lost', payout_cents = 0, multiplier = 0,
      result = COALESCE(p_result, '{}'::jsonb), settled_at = now() WHERE id = p_bet_id;
    UPDATE public.gg_wallets SET total_lost_cents = total_lost_cents + v_bet.bet_cents, updated_at = now()
    WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'bet_id', p_bet_id, 'balance_cents', v_wallet.balance_cents, 'locked_cents', v_wallet.locked_cents,
      'stars_balance', v_wallet.stars_balance, 'payout_cents', 0, 'multiplier', 0, 'status', 'lost', 'idempotent', false
    );
  END IF;

  v_mult := COALESCE(p_multiplier, 0);
  IF p_status = 'push' THEN v_mult := 1; END IF;
  IF v_mult < 1 OR v_mult > 1000 THEN RAISE EXCEPTION 'Invalid multiplier: %', v_mult; END IF;
  v_payout_cents := round(v_bet.bet_cents * v_mult)::bigint;
  v_balance_after := v_wallet.balance_cents + v_payout_cents;

  UPDATE public.gg_bets SET status = p_status, payout_cents = v_payout_cents, multiplier = v_mult,
    result = COALESCE(p_result, '{}'::jsonb), settled_at = now() WHERE id = p_bet_id;
  UPDATE public.gg_wallets SET balance_cents = v_balance_after, total_won_cents = total_won_cents + v_payout_cents, updated_at = now()
  WHERE profile_id = p_profile_id;
  INSERT INTO public.gg_ledger (profile_id, kind, amount_cents, balance_after_cents, bet_id, meta)
  VALUES (p_profile_id, 'win'::public.gg_ledger_kind, v_payout_cents, v_balance_after, p_bet_id,
    jsonb_build_object('game_id', v_bet.game_id, 'bet_cents', v_bet.bet_cents, 'payout_cents', v_payout_cents, 'multiplier', v_mult, 'phase', 'resolve'));

  RETURN jsonb_build_object(
    'bet_id', p_bet_id, 'balance_cents', v_balance_after, 'locked_cents', v_wallet.locked_cents,
    'stars_balance', v_wallet.stars_balance, 'payout_cents', v_payout_cents, 'multiplier', v_mult, 'status', p_status, 'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gg_resolve_bet(uuid, uuid, public.gg_bet_status, numeric, jsonb) TO service_role;


