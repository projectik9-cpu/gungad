-- Enum values must be committed before use in later functions (separate migration).

DO $$ BEGIN
  ALTER TYPE public.gg_game_id ADD VALUE 'poker';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.gg_ledger_kind ADD VALUE 'poker_buyin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.gg_ledger_kind ADD VALUE 'poker_cashout';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.gg_ledger_kind ADD VALUE 'poker_hand';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.gg_ledger_kind ADD VALUE 'poker_rake';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
