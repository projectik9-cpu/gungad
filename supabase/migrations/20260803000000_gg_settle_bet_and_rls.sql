-- =============================================================================
-- GunGad Casino — settle bet RPC + RLS policies
-- Migration: 20260803000000_gg_settle_bet_and_rls.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ATOMIC SETTLE BET RPC (service_role only)
--    - SELECT ... FOR UPDATE on wallet (prevents race conditions)
--    - Debit bet / credit payout atomically
--    - Writes gg_bets + gg_ledger rows
--    - idempotency_key prevents double-settle
--    - Returns JSON with new balance_cents + bet_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_settle_bet(
  p_profile_id       uuid,
  p_game_id          public.gg_game_id,
  p_bet_cents        bigint,
  p_payout_cents     bigint,    -- 0 = loss; >0 = win amount (including stake if win)
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
  v_net_cents      bigint;   -- positive = credit, negative = debit
  v_xp_gain        int;
BEGIN
  -- --- Idempotency check ---------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    SELECT bet_id INTO v_bet_id
    FROM public.gg_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_bet_id IS NOT NULL THEN
      -- Already settled — return existing result
      SELECT jsonb_build_object(
        'bet_id', v_bet_id,
        'balance_cents', w.balance_cents,
        'idempotent', true
      ) INTO v_balance_after
      FROM public.gg_wallets w WHERE profile_id = p_profile_id;

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

  -- --- Lock wallet row (prevents concurrent balance mutations) -------------
  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  -- --- Validate sufficient balance ------------------------------------------
  IF v_wallet.balance_cents < p_bet_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents, need % cents',
      v_wallet.balance_cents, p_bet_cents;
  END IF;

  -- --- Calculate net change -------------------------------------------------
  -- We debit bet_cents, then credit payout_cents.
  -- Net: payout_cents - bet_cents
  --   win:  payout > 0  → net positive (profit)
  --   loss: payout = 0  → net negative (loss = -bet)
  v_net_cents     := p_payout_cents - p_bet_cents;
  v_balance_after := v_wallet.balance_cents + v_net_cents;

  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'Balance would go negative: % + % = %',
      v_wallet.balance_cents, v_net_cents, v_balance_after;
  END IF;

  -- Ledger kind
  v_ledger_kind := CASE WHEN p_payout_cents > 0 THEN 'win'::public.gg_ledger_kind
                        ELSE 'bet'::public.gg_ledger_kind END;

  -- XP: 1 XP per $1 wagered (100 cents = 1 XP)
  v_xp_gain := GREATEST(1, (p_bet_cents / 100)::int);

  -- --- Insert bet record ----------------------------------------------------
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

  -- --- Update wallet --------------------------------------------------------
  UPDATE public.gg_wallets SET
    balance_cents       = v_balance_after,
    total_wagered_cents = total_wagered_cents + p_bet_cents,
    total_won_cents     = total_won_cents  + CASE WHEN p_payout_cents > 0 THEN p_payout_cents ELSE 0 END,
    total_lost_cents    = total_lost_cents + CASE WHEN p_payout_cents = 0 THEN p_bet_cents    ELSE 0 END
  WHERE profile_id = p_profile_id;

  -- --- Accrue XP on profile -------------------------------------------------
  UPDATE public.gg_profiles SET
    vip_xp = vip_xp + v_xp_gain,
    last_seen_at = now()
  WHERE id = p_profile_id;

  -- --- Write ledger entry ---------------------------------------------------
  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    bet_id, idempotency_key, meta
  ) VALUES (
    p_profile_id,
    v_ledger_kind,
    v_net_cents,          -- signed: negative for losses, positive for wins
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

  -- --- Return result --------------------------------------------------------
  RETURN jsonb_build_object(
    'bet_id',        v_bet_id,
    'balance_cents', v_balance_after,
    'payout_cents',  p_payout_cents,
    'net_cents',     v_net_cents,
    'idempotent',    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_settle_bet(
  uuid, public.gg_game_id, bigint, bigint, numeric,
  public.gg_bet_status, jsonb, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_settle_bet(
  uuid, public.gg_game_id, bigint, bigint, numeric,
  public.gg_bet_status, jsonb, text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. STARS CREDIT RPC (service_role only)
--    Called after Telegram successful_payment event
-- ---------------------------------------------------------------------------
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
  v_balance_after bigint;
  v_stars_after   integer;
BEGIN
  -- Idempotency by telegram_payment_charge_id
  SELECT id INTO v_payment_id
  FROM public.gg_star_payments
  WHERE telegram_payment_charge_id = p_telegram_payment_charge_id;

  IF v_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object('payment_id', v_payment_id, 'idempotent', true);
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  v_balance_after := v_wallet.balance_cents + p_usd_cents;
  v_stars_after   := v_wallet.stars_balance + p_stars_amount;

  -- Insert payment record
  INSERT INTO public.gg_star_payments (
    profile_id, telegram_payment_charge_id,
    stars_amount, usd_cents, status,
    payload, meta, completed_at
  ) VALUES (
    p_profile_id, p_telegram_payment_charge_id,
    p_stars_amount, p_usd_cents, 'paid',
    p_payload, p_meta, now()
  ) RETURNING id INTO v_payment_id;

  -- Credit wallet
  UPDATE public.gg_wallets SET
    balance_cents      = v_balance_after,
    stars_balance      = v_stars_after,
    total_deposited_cents = total_deposited_cents + p_usd_cents
  WHERE profile_id = p_profile_id;

  -- USD ledger entry
  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    star_payment_id, idempotency_key, meta
  ) VALUES (
    p_profile_id, 'star_topup', p_usd_cents, v_balance_after,
    v_payment_id,
    'stars_' || p_telegram_payment_charge_id,
    jsonb_build_object('stars', p_stars_amount, 'charge_id', p_telegram_payment_charge_id)
  );

  -- Stars ledger entry
  INSERT INTO public.gg_star_ledger (
    profile_id, delta_stars, stars_after,
    reason, star_payment_id
  ) VALUES (
    p_profile_id, p_stars_amount, v_stars_after,
    'purchase', v_payment_id
  );

  RETURN jsonb_build_object(
    'payment_id',    v_payment_id,
    'balance_cents', v_balance_after,
    'stars_balance', v_stars_after,
    'idempotent',    false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_credit_stars(uuid, integer, bigint, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_credit_stars(uuid, integer, bigint, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. DEMO REFILL RPC (service_role only) — adds $1000 demo credit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_demo_refill(
  p_profile_id uuid,
  p_amount_cents bigint DEFAULT 100000  -- $1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet record;
  v_balance_after bigint;
BEGIN
  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for profile %', p_profile_id;
  END IF;

  v_balance_after := v_wallet.balance_cents + p_amount_cents;

  UPDATE public.gg_wallets SET
    balance_cents         = v_balance_after,
    total_deposited_cents = total_deposited_cents + p_amount_cents
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents, meta
  ) VALUES (
    p_profile_id, 'bonus', p_amount_cents, v_balance_after,
    jsonb_build_object('reason', 'demo_refill')
  );

  RETURN jsonb_build_object(
    'balance_cents', v_balance_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_demo_refill(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_demo_refill(uuid, bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. GET WALLET RPC (for anon read via API proxy — not direct table access)
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
    'profile_id',         w.profile_id,
    'balance_cents',      w.balance_cents,
    'stars_balance',      w.stars_balance,
    'total_wagered_cents',w.total_wagered_cents,
    'total_won_cents',    w.total_won_cents,
    'total_lost_cents',   w.total_lost_cents,
    'vip_level',          p.vip_level,
    'vip_xp',             p.vip_xp,
    'username',           p.username,
    'first_name',         p.first_name
  ) INTO v_result
  FROM public.gg_wallets w
  JOIN public.gg_profiles p ON p.id = w.profile_id
  WHERE w.profile_id = p_profile_id;

  RETURN v_result;
END;
$$;

-- service_role only (API proxy fetches it)
REVOKE ALL ON FUNCTION public.gg_get_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_get_wallet(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. GET BET HISTORY RPC (service_role — API proxy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_get_bet_history(
  p_profile_id uuid,
  p_limit      integer DEFAULT 20,
  p_offset     integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(row_to_json(b) ORDER BY b.created_at DESC)
    FROM (
      SELECT
        id, game_id, status,
        bet_cents, payout_cents, multiplier,
        client_seed, server_seed_hash,
        result, created_at, settled_at
      FROM public.gg_bets
      WHERE profile_id = p_profile_id
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) b
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_get_bet_history(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_get_bet_history(uuid, integer, integer) TO service_role;
