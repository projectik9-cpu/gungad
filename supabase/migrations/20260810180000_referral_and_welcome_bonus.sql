-- Referral bind + 20% loss commission + welcome bonus wheel

-- ---------------------------------------------------------------------------
-- 1. Welcome bonus flag on profile
-- ---------------------------------------------------------------------------
ALTER TABLE public.gg_profiles
  ADD COLUMN IF NOT EXISTS welcome_bonus_claimed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. gg_ensure_profile — optional one-time referrer bind
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gg_ensure_profile(bigint, text, text, text, text);
DROP FUNCTION IF EXISTS public.gg_ensure_profile(bigint, text, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.gg_ensure_profile(
  p_telegram_id bigint,
  p_username text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_language_code text DEFAULT 'ru',
  p_referrer_telegram_id bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_ref bigint := NULL;
BEGIN
  -- Validate referrer once (exists, not self, not blocked)
  IF p_referrer_telegram_id IS NOT NULL
     AND p_referrer_telegram_id <> p_telegram_id THEN
    IF EXISTS (
      SELECT 1 FROM public.gg_profiles r
      WHERE r.telegram_id = p_referrer_telegram_id
        AND r.is_blocked = false
    ) THEN
      v_ref := p_referrer_telegram_id;
    END IF;
  END IF;

  INSERT INTO public.gg_profiles (
    telegram_id, username, first_name, last_name, language_code, referrer_telegram_id
  )
  VALUES (
    p_telegram_id, p_username, p_first_name, p_last_name,
    coalesce(p_language_code, 'ru'), v_ref
  )
  ON CONFLICT (telegram_id) DO UPDATE
    SET username = COALESCE(EXCLUDED.username, public.gg_profiles.username),
        first_name = COALESCE(EXCLUDED.first_name, public.gg_profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, public.gg_profiles.last_name),
        language_code = COALESCE(EXCLUDED.language_code, public.gg_profiles.language_code),
        -- Bind referrer only if still empty
        referrer_telegram_id = COALESCE(public.gg_profiles.referrer_telegram_id, EXCLUDED.referrer_telegram_id),
        last_seen_at = now(),
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.gg_wallets (profile_id)
  VALUES (v_id)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gg_ensure_profile(bigint, text, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_ensure_profile(bigint, text, text, text, text, bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. gg_settle_bet — credit referrer 20% on full loss (payout = 0)
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
  v_wallet            record;
  v_bet_id            uuid;
  v_balance_after     bigint;
  v_ledger_kind       public.gg_ledger_kind;
  v_net_cents         bigint;
  v_xp_gain           int;
  v_referrer_tg       bigint;
  v_referrer_id       uuid;
  v_ref_wallet        record;
  v_commission        bigint;
  v_ref_balance_after bigint;
  v_ref_key           text;
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

  -- Referral: 20% of stake only on full loss
  IF p_payout_cents = 0 AND p_bet_cents > 0 THEN
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
        v_commission := floor(p_bet_cents * 0.20)::bigint;
        IF v_commission > 0 THEN
          v_ref_key := CASE
            WHEN p_idempotency_key IS NOT NULL THEN 'ref:' || p_idempotency_key
            ELSE 'ref:bet:' || v_bet_id::text
          END;

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
                bet_id, idempotency_key, meta
              ) VALUES (
                v_referrer_id,
                'referral'::public.gg_ledger_kind,
                v_commission,
                v_ref_balance_after,
                v_bet_id,
                v_ref_key,
                jsonb_build_object(
                  'friend_profile_id', p_profile_id,
                  'bet_id', v_bet_id,
                  'bet_cents', p_bet_cents,
                  'pct', 20
                )
              );
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

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
-- 4. gg_get_wallet — include telegram_id + welcome bonus flag
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

-- ---------------------------------------------------------------------------
-- 5. gg_claim_welcome_bonus — one-time weighted wheel
--    Weights: $1 38%, $2 32%, $0.5 25%, $10 4.5%, $100 0.5%
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_claim_welcome_bonus(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   record;
  v_wallet    record;
  v_roll      int;
  v_amount    bigint;
  v_balance   bigint;
  v_idem      text;
BEGIN
  SELECT id, welcome_bonus_claimed_at
  INTO v_profile
  FROM public.gg_profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_profile.welcome_bonus_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_claimed', true,
      'amount_cents', 0,
      'balance_cents', v_wallet.balance_cents
    );
  END IF;

  v_idem := 'welcome_bonus:' || p_profile_id::text;
  IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = v_idem) THEN
    UPDATE public.gg_profiles
    SET welcome_bonus_claimed_at = coalesce(welcome_bonus_claimed_at, now()),
        updated_at = now()
    WHERE id = p_profile_id;

    RETURN jsonb_build_object(
      'already_claimed', true,
      'amount_cents', 0,
      'balance_cents', v_wallet.balance_cents
    );
  END IF;

  v_roll := floor(random() * 10000)::int; -- 0..9999
  IF v_roll < 3800 THEN
    v_amount := 100;     -- $1   38%
  ELSIF v_roll < 7000 THEN
    v_amount := 200;     -- $2   32%
  ELSIF v_roll < 9500 THEN
    v_amount := 50;      -- $0.5 25%
  ELSIF v_roll < 9950 THEN
    v_amount := 1000;    -- $10  4.5%
  ELSE
    v_amount := 10000;   -- $100 0.5%
  END IF;

  v_balance := v_wallet.balance_cents + v_amount;

  UPDATE public.gg_wallets SET
    balance_cents = v_balance,
    updated_at = now()
  WHERE profile_id = p_profile_id;

  UPDATE public.gg_profiles SET
    welcome_bonus_claimed_at = now(),
    updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
  ) VALUES (
    p_profile_id,
    'bonus'::public.gg_ledger_kind,
    v_amount,
    v_balance,
    v_idem,
    jsonb_build_object('reason', 'welcome_wheel', 'slice_cents', v_amount, 'roll', v_roll)
  );

  RETURN jsonb_build_object(
    'already_claimed', false,
    'amount_cents', v_amount,
    'balance_cents', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_claim_welcome_bonus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_claim_welcome_bonus(uuid) TO service_role;
