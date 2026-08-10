-- Crash open-bet (place then resolve) + respect locked_cents for all settles
-- Also expose locked_cents via gg_get_wallet.

-- ---------------------------------------------------------------------------
-- 1. gg_settle_bet — available = balance - locked
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
  v_available      bigint;
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
          'locked_cents', locked_cents,
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

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_bet_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents',
      v_available, p_bet_cents;
  END IF;

  v_net_cents     := p_payout_cents - p_bet_cents;
  v_balance_after := v_wallet.balance_cents + v_net_cents;

  IF v_balance_after < v_wallet.locked_cents THEN
    RAISE EXCEPTION 'Balance would go below locked: % + % = %, locked %',
      v_wallet.balance_cents, v_net_cents, v_balance_after, v_wallet.locked_cents;
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
    'locked_cents',  v_wallet.locked_cents,
    'payout_cents',  p_payout_cents,
    'net_cents',     v_net_cents,
    'idempotent',    false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. gg_place_bet — debit available, insert pending bet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_place_bet(
  p_profile_id      uuid,
  p_game_id         public.gg_game_id,
  p_bet_cents       bigint,
  p_idempotency_key text DEFAULT NULL
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
  v_xp_gain       int;
BEGIN
  IF p_bet_cents IS NULL OR p_bet_cents <= 0 THEN
    RAISE EXCEPTION 'bet_cents must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT bet_id INTO v_bet_id
    FROM public.gg_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_bet_id IS NOT NULL THEN
      RETURN (
        SELECT jsonb_build_object(
          'bet_id', b.id,
          'balance_cents', w.balance_cents,
          'locked_cents', w.locked_cents,
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

  -- Only one open pending bet per profile+game
  IF EXISTS (
    SELECT 1 FROM public.gg_bets
    WHERE profile_id = p_profile_id
      AND game_id = p_game_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Open bet already exists for this game';
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_bet_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents',
      v_available, p_bet_cents;
  END IF;

  v_balance_after := v_wallet.balance_cents - p_bet_cents;
  v_xp_gain := GREATEST(1, (p_bet_cents / 100)::int);

  INSERT INTO public.gg_bets (
    profile_id, game_id, status,
    bet_cents, payout_cents, multiplier,
    result
  ) VALUES (
    p_profile_id, p_game_id, 'pending',
    p_bet_cents, 0, 0,
    '{}'::jsonb
  ) RETURNING id INTO v_bet_id;

  UPDATE public.gg_wallets SET
    balance_cents       = v_balance_after,
    total_wagered_cents = total_wagered_cents + p_bet_cents,
    updated_at          = now()
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
    'bet'::public.gg_ledger_kind,
    -p_bet_cents,
    v_balance_after,
    v_bet_id,
    p_idempotency_key,
    jsonb_build_object(
      'game_id', p_game_id,
      'bet_cents', p_bet_cents,
      'phase', 'place'
    )
  );

  RETURN jsonb_build_object(
    'bet_id',        v_bet_id,
    'balance_cents', v_balance_after,
    'locked_cents',  v_wallet.locked_cents,
    'bet_cents',     p_bet_cents,
    'status',        'pending',
    'idempotent',    false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. gg_resolve_bet — settle pending open bet (server computes payout)
-- ---------------------------------------------------------------------------
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
  v_mult          numeric;
BEGIN
  IF p_status NOT IN ('lost', 'cashed_out', 'won', 'push', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid resolve status: %', p_status;
  END IF;

  SELECT * INTO v_bet
  FROM public.gg_bets
  WHERE id = p_bet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet % not found', p_bet_id;
  END IF;

  IF v_bet.profile_id <> p_profile_id THEN
    RAISE EXCEPTION 'Bet does not belong to profile';
  END IF;

  -- Idempotent: already settled
  IF v_bet.status <> 'pending' THEN
    SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = p_profile_id;
    RETURN jsonb_build_object(
      'bet_id',        v_bet.id,
      'balance_cents', v_wallet.balance_cents,
      'locked_cents',  v_wallet.locked_cents,
      'payout_cents',  v_bet.payout_cents,
      'multiplier',    v_bet.multiplier,
      'status',        v_bet.status,
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

  // Cancelled: refund stake (abandon / unmount)
  IF p_status = 'cancelled' THEN
    v_payout_cents := v_bet.bet_cents;
    v_balance_after := v_wallet.balance_cents + v_bet.bet_cents;

    UPDATE public.gg_bets SET
      status = 'cancelled',
      payout_cents = v_payout_cents,
      multiplier = 1,
      result = COALESCE(p_result, '{}'::jsonb),
      settled_at = now()
    WHERE id = p_bet_id;

    UPDATE public.gg_wallets SET
      balance_cents = v_balance_after,
      total_wagered_cents = GREATEST(0, total_wagered_cents - v_bet.bet_cents),
      updated_at = now()
    WHERE profile_id = p_profile_id;

    INSERT INTO public.gg_ledger (
      profile_id, kind, amount_cents, balance_after_cents,
      bet_id, meta
    ) VALUES (
      p_profile_id,
      'refund'::public.gg_ledger_kind,
      v_bet.bet_cents,
      v_balance_after,
      p_bet_id,
      jsonb_build_object(
        'game_id', v_bet.game_id,
        'bet_cents', v_bet.bet_cents,
        'phase', 'cancel_refund'
      )
    );

    RETURN jsonb_build_object(
      'bet_id',        p_bet_id,
      'balance_cents', v_balance_after,
      'locked_cents',  v_wallet.locked_cents,
      'payout_cents',  v_payout_cents,
      'multiplier',    1,
      'status',        'cancelled',
      'idempotent',    false
    );
  END IF;

  IF p_status = 'lost' THEN
    v_balance_after := v_wallet.balance_cents;

    UPDATE public.gg_bets SET
      status = 'lost',
      payout_cents = 0,
      multiplier = 0,
      result = COALESCE(p_result, '{}'::jsonb),
      settled_at = now()
    WHERE id = p_bet_id;

    UPDATE public.gg_wallets SET
      total_lost_cents = total_lost_cents + v_bet.bet_cents,
      updated_at = now()
    WHERE profile_id = p_profile_id;

    RETURN jsonb_build_object(
      'bet_id',        p_bet_id,
      'balance_cents', v_balance_after,
      'locked_cents',  v_wallet.locked_cents,
      'payout_cents',  0,
      'multiplier',    0,
      'status',        'lost',
      'idempotent',    false
    );
  END IF;

  -- won / cashed_out / push — server computes payout from multiplier
  v_mult := COALESCE(p_multiplier, 0);
  IF p_status = 'push' THEN
    v_mult := 1;
  END IF;

  IF v_mult < 1 OR v_mult > 1000 THEN
    RAISE EXCEPTION 'Invalid multiplier: %', v_mult;
  END IF;

  v_payout_cents := round(v_bet.bet_cents * v_mult)::bigint;
  IF v_payout_cents < 0 THEN
    RAISE EXCEPTION 'Invalid payout';
  END IF;

  v_balance_after := v_wallet.balance_cents + v_payout_cents;

  UPDATE public.gg_bets SET
    status = p_status,
    payout_cents = v_payout_cents,
    multiplier = v_mult,
    result = COALESCE(p_result, '{}'::jsonb),
    settled_at = now()
  WHERE id = p_bet_id;

  UPDATE public.gg_wallets SET
    balance_cents   = v_balance_after,
    total_won_cents = total_won_cents + v_payout_cents,
    updated_at      = now()
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    bet_id, meta
  ) VALUES (
    p_profile_id,
    'win'::public.gg_ledger_kind,
    v_payout_cents,
    v_balance_after,
    p_bet_id,
    jsonb_build_object(
      'game_id', v_bet.game_id,
      'bet_cents', v_bet.bet_cents,
      'payout_cents', v_payout_cents,
      'multiplier', v_mult,
      'phase', 'resolve'
    )
  );

  RETURN jsonb_build_object(
    'bet_id',        p_bet_id,
    'balance_cents', v_balance_after,
    'locked_cents',  v_wallet.locked_cents,
    'payout_cents',  v_payout_cents,
    'multiplier',    v_mult,
    'status',        p_status,
    'idempotent',    false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. gg_get_wallet — include locked_cents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_get_wallet(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile_id',              w.profile_id,
    'balance_cents',           w.balance_cents,
    'locked_cents',            w.locked_cents,
    'stars_balance',           w.stars_balance,
    'total_wagered_cents',     w.total_wagered_cents,
    'total_won_cents',         w.total_won_cents,
    'total_lost_cents',        w.total_lost_cents,
    'vip_level',               p.vip_level,
    'vip_xp',                  p.vip_xp,
    'username',                p.username,
    'first_name',              p.first_name,
    'telegram_id',             p.telegram_id,
    'welcome_bonus_available', (p.welcome_bonus_claimed_at IS NULL)
  ) INTO v_result
  FROM public.gg_wallets w
  JOIN public.gg_profiles p ON p.id = w.profile_id
  WHERE w.profile_id = p_profile_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.gg_place_bet(uuid, public.gg_game_id, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_place_bet(uuid, public.gg_game_id, bigint, text) TO service_role;

REVOKE ALL ON FUNCTION public.gg_resolve_bet(uuid, uuid, public.gg_bet_status, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_resolve_bet(uuid, uuid, public.gg_bet_status, numeric, jsonb) TO service_role;
