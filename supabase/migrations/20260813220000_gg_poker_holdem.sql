-- Texas Hold'em cash tables: schema, money RPCs, public view (no hole cards / deck).
-- Requires 20260813215900_gg_poker_enums.sql (poker game_id + ledger kinds).

ALTER TABLE public.gg_casino_stats
  ADD COLUMN IF NOT EXISTS poker_rake_cents bigint NOT NULL DEFAULT 0 CHECK (poker_rake_cents >= 0);

-- ---------------------------------------------------------------------------
-- Stakes / tables / seats
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gg_poker_stakes (
  id text PRIMARY KEY,
  label text NOT NULL,
  sb_cents bigint NOT NULL CHECK (sb_cents > 0),
  bb_cents bigint NOT NULL CHECK (bb_cents >= sb_cents),
  ante_cents bigint NOT NULL DEFAULT 0 CHECK (ante_cents >= 0),
  min_buyin_cents bigint NOT NULL CHECK (min_buyin_cents > 0),
  max_buyin_cents bigint NOT NULL CHECK (max_buyin_cents >= min_buyin_cents),
  max_seats int NOT NULL CHECK (max_seats BETWEEN 2 AND 9),
  rake_bps int NOT NULL DEFAULT 500 CHECK (rake_bps BETWEEN 0 AND 1000),
  rake_cap_bb numeric(8, 2) NOT NULL DEFAULT 3 CHECK (rake_cap_bb >= 0),
  action_timeout_sec int NOT NULL DEFAULT 20 CHECK (action_timeout_sec BETWEEN 10 AND 60),
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO public.gg_poker_stakes (
  id, label, sb_cents, bb_cents, ante_cents,
  min_buyin_cents, max_buyin_cents, max_seats,
  rake_bps, rake_cap_bb, action_timeout_sec, sort_order
) VALUES
  ('micro', 'Micro', 1, 2, 0, 200, 1000, 6, 500, 3, 20, 1),
  ('low',   'Low',   5, 10, 0, 1000, 4000, 6, 500, 3, 20, 2),
  ('mid',   'Mid',   25, 50, 0, 2500, 10000, 9, 500, 3, 20, 3),
  ('high',  'High',  100, 200, 0, 10000, 40000, 9, 400, 3, 25, 4)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gg_poker_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.gg_profiles(id) ON DELETE SET NULL,
  stake_id text REFERENCES public.gg_poker_stakes(id),
  sb_cents bigint NOT NULL CHECK (sb_cents > 0),
  bb_cents bigint NOT NULL CHECK (bb_cents >= sb_cents),
  ante_cents bigint NOT NULL DEFAULT 0 CHECK (ante_cents >= 0),
  min_buyin_cents bigint NOT NULL CHECK (min_buyin_cents > 0),
  max_buyin_cents bigint NOT NULL CHECK (max_buyin_cents >= min_buyin_cents),
  max_seats int NOT NULL CHECK (max_seats BETWEEN 2 AND 9),
  rake_bps int NOT NULL DEFAULT 500 CHECK (rake_bps BETWEEN 0 AND 1000),
  rake_cap_cents bigint NOT NULL DEFAULT 0 CHECK (rake_cap_cents >= 0),
  action_timeout_sec int NOT NULL DEFAULT 20 CHECK (action_timeout_sec BETWEEN 10 AND 60),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_hand', 'paused', 'closed')),
  street text NOT NULL DEFAULT 'idle' CHECK (street IN ('idle', 'preflop', 'flop', 'turn', 'river', 'showdown')),
  hand_no int NOT NULL DEFAULT 0,
  dealer_seat int,
  sb_seat int,
  bb_seat int,
  actor_seat int,
  action_deadline_at timestamptz,
  next_hand_at timestamptz,
  board jsonb NOT NULL DEFAULT '[]'::jsonb,
  pots jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gg_poker_tables_status_idx ON public.gg_poker_tables (status);
CREATE INDEX IF NOT EXISTS gg_poker_tables_deadline_idx ON public.gg_poker_tables (action_deadline_at)
  WHERE action_deadline_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS gg_poker_tables_next_hand_idx ON public.gg_poker_tables (next_hand_at)
  WHERE next_hand_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gg_poker_seats (
  table_id uuid NOT NULL REFERENCES public.gg_poker_tables(id) ON DELETE CASCADE,
  seat_no int NOT NULL CHECK (seat_no BETWEEN 1 AND 9),
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  stack_cents bigint NOT NULL CHECK (stack_cents >= 0),
  bet_this_street bigint NOT NULL DEFAULT 0 CHECK (bet_this_street >= 0),
  invested_cents bigint NOT NULL DEFAULT 0 CHECK (invested_cents >= 0),
  folded boolean NOT NULL DEFAULT false,
  all_in boolean NOT NULL DEFAULT false,
  sitting_out boolean NOT NULL DEFAULT false,
  pending_leave boolean NOT NULL DEFAULT false,
  pending_rebuy_cents bigint NOT NULL DEFAULT 0 CHECK (pending_rebuy_cents >= 0),
  hole_cards jsonb,
  shown boolean NOT NULL DEFAULT false,
  empty_stack_hands int NOT NULL DEFAULT 0,
  username text,
  first_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, seat_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS gg_poker_seats_profile_unique
  ON public.gg_poker_seats (profile_id);

CREATE INDEX IF NOT EXISTS gg_poker_seats_table_idx ON public.gg_poker_seats (table_id);

CREATE TABLE IF NOT EXISTS public.gg_poker_secrets (
  table_id uuid PRIMARY KEY REFERENCES public.gg_poker_tables(id) ON DELETE CASCADE,
  deck jsonb NOT NULL DEFAULT '[]'::jsonb,
  server_seed text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gg_poker_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.gg_poker_tables(id) ON DELETE CASCADE,
  hand_no int NOT NULL,
  server_seed_hash text,
  server_seed text,
  board jsonb NOT NULL DEFAULT '[]'::jsonb,
  pots jsonb NOT NULL DEFAULT '[]'::jsonb,
  rake_cents bigint NOT NULL DEFAULT 0,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (table_id, hand_no)
);

CREATE INDEX IF NOT EXISTS gg_poker_hands_table_idx
  ON public.gg_poker_hands (table_id, hand_no DESC);

CREATE TABLE IF NOT EXISTS public.gg_poker_hand_players (
  hand_id uuid NOT NULL REFERENCES public.gg_poker_hands(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  seat_no int NOT NULL,
  hole_cards jsonb,
  invested_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL DEFAULT 0,
  showed boolean NOT NULL DEFAULT false,
  hand_rank text,
  hand_name text,
  PRIMARY KEY (hand_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.gg_poker_chat (
  id bigserial PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES public.gg_poker_tables(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gg_poker_chat_table_idx
  ON public.gg_poker_chat (table_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gg_poker_spectators (
  table_id uuid NOT NULL REFERENCES public.gg_poker_tables(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, profile_id)
);

DROP TRIGGER IF EXISTS gg_poker_tables_updated_at ON public.gg_poker_tables;
CREATE TRIGGER gg_poker_tables_updated_at
BEFORE UPDATE ON public.gg_poker_tables
FOR EACH ROW EXECUTE FUNCTION public.gg_set_updated_at();

-- Tables are created by players from the Mini App lobby. Do not seed empty tables.

-- Public snapshot (no secrets, no hole cards)
CREATE OR REPLACE VIEW public.v_gg_poker_table_public
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.code,
  t.stake_id,
  t.status,
  t.street,
  t.hand_no,
  t.board,
  t.pots,
  t.actor_seat,
  t.action_deadline_at,
  t.next_hand_at,
  t.sb_cents,
  t.bb_cents,
  t.ante_cents,
  t.max_seats,
  t.dealer_seat,
  t.version,
  t.updated_at
FROM public.gg_poker_tables t
WHERE t.status <> 'closed';

-- ---------------------------------------------------------------------------
-- RLS: money/cards only via service role RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE public.gg_poker_stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_hand_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_poker_spectators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gg_poker_stakes_read ON public.gg_poker_stakes;
CREATE POLICY gg_poker_stakes_read ON public.gg_poker_stakes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS gg_poker_tables_read ON public.gg_poker_tables;
CREATE POLICY gg_poker_tables_read ON public.gg_poker_tables
  FOR SELECT TO anon, authenticated USING (status <> 'closed');

GRANT SELECT ON public.gg_poker_stakes TO anon, authenticated;
GRANT SELECT ON public.gg_poker_tables TO anon, authenticated;
GRANT SELECT ON public.v_gg_poker_table_public TO anon, authenticated;

-- Realtime: table row changes as a signal (engine jsonb has no deck/seed)
DO $$
BEGIN
  ALTER TABLE public.gg_poker_tables REPLICA IDENTITY FULL;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gg_poker_tables;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Buy-in
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gg_poker_buyin(
  p_profile_id uuid,
  p_table_id uuid,
  p_seat_no int,
  p_amount_cents bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table record;
  v_wallet record;
  v_available bigint;
  v_seat_no int;
  v_profile record;
  v_existing uuid;
  v_result jsonb;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'buyin must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = p_idempotency_key) THEN
      SELECT jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'balance_cents', w.balance_cents,
        'locked_cents', w.locked_cents,
        'stack_cents', s.stack_cents,
        'seat_no', s.seat_no,
        'table_id', s.table_id
      )
      INTO v_result
      FROM public.gg_wallets w
      LEFT JOIN public.gg_poker_seats s ON s.profile_id = p_profile_id
      WHERE w.profile_id = p_profile_id
      LIMIT 1;
      RETURN v_result;
    END IF;
  END IF;

  SELECT * INTO v_table
  FROM public.gg_poker_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;
  IF v_table.status = 'closed' THEN
    RAISE EXCEPTION 'Table is closed';
  END IF;
  IF p_amount_cents < v_table.min_buyin_cents OR p_amount_cents > v_table.max_buyin_cents THEN
    RAISE EXCEPTION 'Buy-in must be between % and % cents',
      v_table.min_buyin_cents, v_table.max_buyin_cents;
  END IF;

  SELECT table_id INTO v_existing
  FROM public.gg_poker_seats
  WHERE profile_id = p_profile_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Already seated at a poker table';
  END IF;

  v_seat_no := p_seat_no;
  IF v_seat_no IS NULL THEN
    SELECT gs INTO v_seat_no
    FROM generate_series(1, v_table.max_seats) gs
    WHERE NOT EXISTS (
      SELECT 1 FROM public.gg_poker_seats s
      WHERE s.table_id = p_table_id AND s.seat_no = gs
    )
    ORDER BY gs
    LIMIT 1;
    IF v_seat_no IS NULL THEN
      RAISE EXCEPTION 'Table is full';
    END IF;
  ELSE
    IF v_seat_no < 1 OR v_seat_no > v_table.max_seats THEN
      RAISE EXCEPTION 'Invalid seat';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.gg_poker_seats
      WHERE table_id = p_table_id AND seat_no = v_seat_no
    ) THEN
      RAISE EXCEPTION 'Seat taken';
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
  IF v_available < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents',
      v_available, p_amount_cents;
  END IF;

  SELECT username, first_name INTO v_profile
  FROM public.gg_profiles WHERE id = p_profile_id;

  UPDATE public.gg_wallets SET
    locked_cents = locked_cents + p_amount_cents
  WHERE profile_id = p_profile_id;

  INSERT INTO public.gg_poker_seats (
    table_id, seat_no, profile_id, stack_cents, username, first_name
  ) VALUES (
    p_table_id, v_seat_no, p_profile_id, p_amount_cents,
    v_profile.username, v_profile.first_name
  );

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    idempotency_key, meta
  ) VALUES (
    p_profile_id,
    'poker_buyin',
    0,
    v_wallet.balance_cents,
    p_idempotency_key,
    jsonb_build_object(
      'table_id', p_table_id,
      'seat_no', v_seat_no,
      'buyin_cents', p_amount_cents
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'table_id', p_table_id,
    'seat_no', v_seat_no,
    'stack_cents', p_amount_cents,
    'balance_cents', v_wallet.balance_cents,
    'locked_cents', v_wallet.locked_cents + p_amount_cents
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Rebuy / top-up (between hands or sitting out)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gg_poker_rebuy(
  p_profile_id uuid,
  p_table_id uuid,
  p_amount_cents bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table record;
  v_seat record;
  v_wallet record;
  v_available bigint;
  v_new_stack bigint;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'rebuy must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = p_idempotency_key) THEN
      RETURN (
        SELECT jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'balance_cents', w.balance_cents,
          'locked_cents', w.locked_cents,
          'stack_cents', s.stack_cents
        )
        FROM public.gg_wallets w
        JOIN public.gg_poker_seats s ON s.profile_id = w.profile_id
        WHERE w.profile_id = p_profile_id AND s.table_id = p_table_id
      );
    END IF;
  END IF;

  SELECT * INTO v_table
  FROM public.gg_poker_tables
  WHERE id = p_table_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  SELECT * INTO v_seat
  FROM public.gg_poker_seats
  WHERE table_id = p_table_id AND profile_id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not seated at this table';
  END IF;

  IF v_table.status = 'in_hand' AND v_seat.sitting_out = false AND v_seat.folded = false THEN
    RAISE EXCEPTION 'Cannot rebuy during an active hand';
  END IF;

  v_new_stack := v_seat.stack_cents + p_amount_cents;
  IF v_new_stack > v_table.max_buyin_cents THEN
    RAISE EXCEPTION 'Rebuy would exceed max buy-in';
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance: have % cents available, need % cents',
      v_available, p_amount_cents;
  END IF;

  UPDATE public.gg_wallets SET
    locked_cents = locked_cents + p_amount_cents
  WHERE profile_id = p_profile_id;

  UPDATE public.gg_poker_seats SET
    stack_cents = v_new_stack,
    sitting_out = CASE WHEN v_new_stack > 0 THEN false ELSE sitting_out END,
    empty_stack_hands = 0,
    pending_rebuy_cents = 0
  WHERE table_id = p_table_id AND profile_id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    idempotency_key, meta
  ) VALUES (
    p_profile_id, 'poker_buyin', 0, v_wallet.balance_cents, p_idempotency_key,
    jsonb_build_object('table_id', p_table_id, 'rebuy_cents', p_amount_cents)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'stack_cents', v_new_stack,
    'balance_cents', v_wallet.balance_cents,
    'locked_cents', v_wallet.locked_cents + p_amount_cents
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cashout / leave
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gg_poker_cashout(
  p_profile_id uuid,
  p_table_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table record;
  v_seat record;
  v_wallet record;
  v_stack bigint;
  v_locked bigint;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = p_idempotency_key) THEN
      RETURN (
        SELECT jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'balance_cents', w.balance_cents,
          'locked_cents', w.locked_cents,
          'cashed_cents', 0
        )
        FROM public.gg_wallets w WHERE w.profile_id = p_profile_id
      );
    END IF;
  END IF;

  SELECT * INTO v_table
  FROM public.gg_poker_tables
  WHERE id = p_table_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  SELECT * INTO v_seat
  FROM public.gg_poker_seats
  WHERE table_id = p_table_id AND profile_id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not seated at this table';
  END IF;

  IF v_table.status = 'in_hand'
     AND v_seat.folded = false
     AND v_seat.sitting_out = false
     AND v_table.street <> 'idle'
     AND v_table.street <> 'showdown' THEN
    RAISE EXCEPTION 'Cannot leave during an active hand';
  END IF;

  v_stack := v_seat.stack_cents;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = p_profile_id
  FOR UPDATE;

  v_locked := GREATEST(0, v_wallet.locked_cents - v_stack);
  IF v_wallet.balance_cents < v_locked THEN
    RAISE EXCEPTION 'Cashout would break lock constraint';
  END IF;

  UPDATE public.gg_wallets SET
    locked_cents = v_locked
  WHERE profile_id = p_profile_id;

  DELETE FROM public.gg_poker_seats
  WHERE table_id = p_table_id AND profile_id = p_profile_id;

  INSERT INTO public.gg_ledger (
    profile_id, kind, amount_cents, balance_after_cents,
    idempotency_key, meta
  ) VALUES (
    p_profile_id, 'poker_cashout', 0, v_wallet.balance_cents, p_idempotency_key,
    jsonb_build_object('table_id', p_table_id, 'cashed_cents', v_stack)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'cashed_cents', v_stack,
    'balance_cents', v_wallet.balance_cents,
    'locked_cents', v_locked
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Settle a finished hand against wallets (nets sum to -rake)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gg_poker_settle_hand(
  p_table_id uuid,
  p_hand_id uuid,
  p_deltas jsonb,
  p_rake_cents bigint,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta jsonb;
  v_profile uuid;
  v_net bigint;
  v_invested bigint;
  v_wallet record;
  v_balance bigint;
  v_locked bigint;
  v_status public.gg_bet_status;
  v_payout bigint;
  v_bet_id uuid;
  v_rake bigint;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.gg_ledger WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;
  END IF;

  PERFORM 1 FROM public.gg_poker_tables WHERE id = p_table_id FOR UPDATE;

  v_rake := COALESCE(p_rake_cents, 0);
  IF v_rake < 0 THEN
    RAISE EXCEPTION 'rake cannot be negative';
  END IF;

  FOR v_profile IN
    SELECT (d->>'profile_id')::uuid
    FROM jsonb_array_elements(p_deltas) d
    ORDER BY 1
  LOOP
    PERFORM 1 FROM public.gg_wallets WHERE profile_id = v_profile FOR UPDATE;
  END LOOP;

  FOR v_delta IN SELECT * FROM jsonb_array_elements(p_deltas)
  LOOP
    v_profile := (v_delta->>'profile_id')::uuid;
    v_net := COALESCE((v_delta->>'net_cents')::bigint, 0);
    v_invested := COALESCE((v_delta->>'invested_cents')::bigint, 0);

    SELECT * INTO v_wallet FROM public.gg_wallets WHERE profile_id = v_profile;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Wallet not found for profile %', v_profile;
    END IF;

    v_balance := v_wallet.balance_cents + v_net;
    v_locked := v_wallet.locked_cents + v_net;
    IF v_balance < 0 OR v_locked < 0 THEN
      RAISE EXCEPTION 'Settle would make balance/lock negative for %', v_profile;
    END IF;
    IF v_balance < v_locked THEN
      RAISE EXCEPTION 'Settle would break lock constraint for %', v_profile;
    END IF;

    UPDATE public.gg_wallets SET
      balance_cents = v_balance,
      locked_cents = v_locked,
      total_wagered_cents = total_wagered_cents + GREATEST(v_invested, 0),
      total_won_cents = total_won_cents + CASE WHEN v_net > 0 THEN v_net ELSE 0 END,
      total_lost_cents = total_lost_cents + CASE WHEN v_net < 0 THEN abs(v_net) ELSE 0 END
    WHERE profile_id = v_profile;

    IF v_invested > 0 THEN
      v_payout := GREATEST(0, v_invested + v_net);
      v_status := CASE
        WHEN v_net > 0 THEN 'won'::public.gg_bet_status
        WHEN v_net < 0 THEN 'lost'::public.gg_bet_status
        ELSE 'push'::public.gg_bet_status
      END;

      INSERT INTO public.gg_bets (
        profile_id, game_id, status, bet_cents, payout_cents, multiplier, result, settled_at
      ) VALUES (
        v_profile, 'poker', v_status, v_invested, v_payout,
        CASE WHEN v_invested > 0 THEN round(v_payout::numeric / v_invested, 4) ELSE 0 END,
        jsonb_build_object('hand_id', p_hand_id, 'table_id', p_table_id, 'net_cents', v_net),
        now()
      ) RETURNING id INTO v_bet_id;

      UPDATE public.gg_profiles SET
        vip_xp = vip_xp + GREATEST(1, (v_invested / 100)::int),
        last_seen_at = now()
      WHERE id = v_profile;

      INSERT INTO public.gg_ledger (
        profile_id, kind, amount_cents, balance_after_cents, bet_id, meta
      ) VALUES (
        v_profile,
        'poker_hand',
        v_net,
        v_balance,
        v_bet_id,
        jsonb_build_object('hand_id', p_hand_id, 'invested_cents', v_invested)
      );
    END IF;
  END LOOP;

  IF v_rake > 0 THEN
    UPDATE public.gg_casino_stats SET
      poker_rake_cents = poker_rake_cents + v_rake,
      updated_at = now()
    WHERE id = 1;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.gg_ledger (
      profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
    )
    SELECT
      (p_deltas->0->>'profile_id')::uuid,
      'poker_rake',
      0,
      (SELECT balance_cents FROM public.gg_wallets WHERE profile_id = (p_deltas->0->>'profile_id')::uuid),
      p_idempotency_key,
      jsonb_build_object('hand_id', p_hand_id, 'rake_cents', v_rake, 'table_id', p_table_id)
    WHERE jsonb_array_length(p_deltas) > 0;
  END IF;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'rake_cents', v_rake);
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic table snapshot (optimistic version)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gg_poker_save_snapshot(
  p_table_id uuid,
  p_expected_version int,
  p_table jsonb,
  p_seats jsonb,
  p_deck jsonb DEFAULT NULL,
  p_server_seed text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version int;
  v_seat jsonb;
  v_keep int[];
BEGIN
  SELECT version INTO v_version
  FROM public.gg_poker_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'stale_version: have %, expected %', v_version, p_expected_version;
  END IF;

  UPDATE public.gg_poker_tables SET
    status              = COALESCE(p_table->>'status', status),
    street              = COALESCE(p_table->>'street', street),
    hand_no             = COALESCE((p_table->>'hand_no')::int, hand_no),
    dealer_seat         = CASE WHEN p_table ? 'dealer_seat' THEN (p_table->>'dealer_seat')::int ELSE dealer_seat END,
    sb_seat             = CASE WHEN p_table ? 'sb_seat' THEN (p_table->>'sb_seat')::int ELSE sb_seat END,
    bb_seat             = CASE WHEN p_table ? 'bb_seat' THEN (p_table->>'bb_seat')::int ELSE bb_seat END,
    actor_seat          = CASE WHEN p_table ? 'actor_seat' THEN (p_table->>'actor_seat')::int ELSE actor_seat END,
    action_deadline_at  = CASE WHEN p_table ? 'action_deadline_at' THEN (p_table->>'action_deadline_at')::timestamptz ELSE action_deadline_at END,
    next_hand_at        = CASE WHEN p_table ? 'next_hand_at' THEN (p_table->>'next_hand_at')::timestamptz ELSE next_hand_at END,
    board               = COALESCE(p_table->'board', board),
    pots                = COALESCE(p_table->'pots', pots),
    engine              = COALESCE(p_table->'engine', engine),
    version             = version + 1
  WHERE id = p_table_id;

  v_keep := ARRAY[]::int[];
  IF p_seats IS NOT NULL THEN
    FOR v_seat IN SELECT * FROM jsonb_array_elements(p_seats)
    LOOP
      v_keep := array_append(v_keep, (v_seat->>'seat_no')::int);
      INSERT INTO public.gg_poker_seats (
        table_id, seat_no, profile_id, stack_cents, bet_this_street, invested_cents,
        folded, all_in, sitting_out, pending_leave, pending_rebuy_cents,
        hole_cards, shown, empty_stack_hands, username, first_name
      ) VALUES (
        p_table_id,
        (v_seat->>'seat_no')::int,
        (v_seat->>'profile_id')::uuid,
        COALESCE((v_seat->>'stack_cents')::bigint, 0),
        COALESCE((v_seat->>'bet_this_street')::bigint, 0),
        COALESCE((v_seat->>'invested_cents')::bigint, 0),
        COALESCE((v_seat->>'folded')::boolean, false),
        COALESCE((v_seat->>'all_in')::boolean, false),
        COALESCE((v_seat->>'sitting_out')::boolean, false),
        COALESCE((v_seat->>'pending_leave')::boolean, false),
        COALESCE((v_seat->>'pending_rebuy_cents')::bigint, 0),
        v_seat->'hole_cards',
        COALESCE((v_seat->>'shown')::boolean, false),
        COALESCE((v_seat->>'empty_stack_hands')::int, 0),
        v_seat->>'username',
        v_seat->>'first_name'
      )
      ON CONFLICT (table_id, seat_no) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        stack_cents = EXCLUDED.stack_cents,
        bet_this_street = EXCLUDED.bet_this_street,
        invested_cents = EXCLUDED.invested_cents,
        folded = EXCLUDED.folded,
        all_in = EXCLUDED.all_in,
        sitting_out = EXCLUDED.sitting_out,
        pending_leave = EXCLUDED.pending_leave,
        pending_rebuy_cents = EXCLUDED.pending_rebuy_cents,
        hole_cards = EXCLUDED.hole_cards,
        shown = EXCLUDED.shown,
        empty_stack_hands = EXCLUDED.empty_stack_hands,
        username = COALESCE(EXCLUDED.username, gg_poker_seats.username),
        first_name = COALESCE(EXCLUDED.first_name, gg_poker_seats.first_name),
        updated_at = now();
    END LOOP;

    DELETE FROM public.gg_poker_seats
    WHERE table_id = p_table_id
      AND NOT (seat_no = ANY (v_keep));
  END IF;

  IF p_deck IS NOT NULL OR p_server_seed IS NOT NULL THEN
    INSERT INTO public.gg_poker_secrets (table_id, deck, server_seed)
    VALUES (p_table_id, COALESCE(p_deck, '[]'::jsonb), p_server_seed)
    ON CONFLICT (table_id) DO UPDATE SET
      deck = COALESCE(EXCLUDED.deck, gg_poker_secrets.deck),
      server_seed = COALESCE(EXCLUDED.server_seed, gg_poker_secrets.server_seed),
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_version + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.gg_poker_buyin(uuid, uuid, int, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gg_poker_rebuy(uuid, uuid, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gg_poker_cashout(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gg_poker_settle_hand(uuid, uuid, jsonb, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gg_poker_save_snapshot(uuid, int, jsonb, jsonb, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.gg_poker_buyin(uuid, uuid, int, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gg_poker_rebuy(uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gg_poker_cashout(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gg_poker_settle_hand(uuid, uuid, jsonb, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gg_poker_save_snapshot(uuid, int, jsonb, jsonb, jsonb, text) TO service_role;
