-- =============================================================================
-- GunGad Casino — payments, withdrawals & support
-- Migration: 20260804000000_gg_payments_and_support.sql
--
-- 1. gg_deposit_requests  — Crypto Bot invoices + TON memo deposits
-- 2. gg_withdrawals       — manual withdrawal queue (admin approves in TG bot)
-- 3. gg_support_tickets   — support messages from Mini App
-- 4. RPCs: gg_create_deposit, gg_complete_deposit,
--          gg_request_withdrawal, gg_process_withdrawal
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.gg_deposit_provider AS ENUM ('cryptobot', 'tonkeeper');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gg_deposit_status AS ENUM ('pending', 'completed', 'expired', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gg_withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gg_deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  provider public.gg_deposit_provider NOT NULL,
  amount_usd_cents bigint NOT NULL DEFAULT 0 CHECK (amount_usd_cents >= 0),
  crypto_asset text NOT NULL DEFAULT 'USDT',
  crypto_amount numeric(30, 9),
  memo text UNIQUE,
  external_id text UNIQUE,      -- Crypto Bot invoice_id or TON tx hash
  status public.gg_deposit_status NOT NULL DEFAULT 'pending',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS gg_deposit_requests_profile_idx
  ON public.gg_deposit_requests (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gg_deposit_requests_status_idx
  ON public.gg_deposit_requests (status, provider);

CREATE TABLE IF NOT EXISTS public.gg_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.gg_profiles(id) ON DELETE CASCADE,
  amount_usd_cents bigint NOT NULL CHECK (amount_usd_cents > 0),
  asset text NOT NULL DEFAULT 'TON',           -- 'TON' | 'USDT'
  recipient_address text NOT NULL,
  status public.gg_withdrawal_status NOT NULL DEFAULT 'pending',
  admin_message_id bigint,
  admin_telegram_id bigint,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS gg_withdrawals_profile_idx
  ON public.gg_withdrawals (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gg_withdrawals_status_idx
  ON public.gg_withdrawals (status);

CREATE TABLE IF NOT EXISTS public.gg_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.gg_profiles(id) ON DELETE SET NULL,
  telegram_id bigint,
  username text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',          -- open | replied | closed
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gg_support_tickets_status_idx
  ON public.gg_support_tickets (status, created_at DESC);

-- RLS on (service_role bypasses; no anon policies)
ALTER TABLE public.gg_deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gg_support_tickets ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RPC: create deposit request (pending)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_create_deposit(
  p_profile_id uuid,
  p_provider   public.gg_deposit_provider,
  p_asset      text,
  p_amount_usd_cents bigint DEFAULT 0,
  p_memo       text DEFAULT NULL,
  p_external_id text DEFAULT NULL,
  p_meta       jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.gg_deposit_requests (
    profile_id, provider, crypto_asset, amount_usd_cents, memo, external_id, meta
  ) VALUES (
    p_profile_id, p_provider, p_asset, p_amount_usd_cents, p_memo, p_external_id, p_meta
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('deposit_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.gg_create_deposit(uuid, public.gg_deposit_provider, text, bigint, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_create_deposit(uuid, public.gg_deposit_provider, text, bigint, text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: complete deposit — credit wallet atomically (idempotent by external_id)
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
  v_dep record;
  v_wallet record;
  v_balance_after bigint;
BEGIN
  -- Lock deposit row
  SELECT * INTO v_dep
  FROM public.gg_deposit_requests
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit % not found', p_deposit_id;
  END IF;

  -- Idempotency: already completed
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

  -- Guard: same external_id must not be credited twice across rows
  IF p_external_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gg_deposit_requests
    WHERE external_id = p_external_id AND status = 'completed' AND id <> p_deposit_id
  ) THEN
    RAISE EXCEPTION 'External payment % already credited', p_external_id;
  END IF;

  -- Lock wallet + credit
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

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false,
    'balance_cents', v_balance_after,
    'profile_id', v_dep.profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gg_complete_deposit(uuid, bigint, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_complete_deposit(uuid, bigint, text, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: request withdrawal (locks funds)
-- ---------------------------------------------------------------------------
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
  IF p_amount_cents < 100 THEN
    RAISE EXCEPTION 'MIN_WITHDRAW';   -- $1 minimum
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

  -- Must have played at least once (wager requirement)
  IF v_wallet.total_wagered_cents <= 0 THEN
    RAISE EXCEPTION 'WAGER_REQUIRED';
  END IF;

  v_available := v_wallet.balance_cents - v_wallet.locked_cents;
  IF v_available < p_amount_cents THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  -- Lock funds
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

REVOKE ALL ON FUNCTION public.gg_request_withdrawal(uuid, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_request_withdrawal(uuid, bigint, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: process withdrawal (approve → debit; reject → unlock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gg_process_withdrawal(
  p_withdrawal_id uuid,
  p_action text,                    -- 'approved' | 'rejected'
  p_admin_telegram_id bigint DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd record;
  v_wallet record;
  v_balance_after bigint;
BEGIN
  SELECT * INTO v_wd
  FROM public.gg_withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND';
  END IF;

  IF v_wd.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_PROCESSED', 'status', v_wd.status);
  END IF;

  SELECT * INTO v_wallet
  FROM public.gg_wallets
  WHERE profile_id = v_wd.profile_id
  FOR UPDATE;

  IF p_action = 'approved' THEN
    v_balance_after := v_wallet.balance_cents - v_wd.amount_usd_cents;
    IF v_balance_after < 0 THEN
      RAISE EXCEPTION 'BALANCE_NEGATIVE';
    END IF;

    UPDATE public.gg_wallets SET
      balance_cents = v_balance_after,
      locked_cents = GREATEST(0, locked_cents - v_wd.amount_usd_cents),
      total_withdrawn_cents = total_withdrawn_cents + v_wd.amount_usd_cents
    WHERE profile_id = v_wd.profile_id;

    UPDATE public.gg_withdrawals SET
      status = 'approved',
      admin_telegram_id = p_admin_telegram_id,
      processed_at = now()
    WHERE id = p_withdrawal_id;

    INSERT INTO public.gg_ledger (
      profile_id, kind, amount_cents, balance_after_cents, idempotency_key, meta
    ) VALUES (
      v_wd.profile_id, 'withdraw', -v_wd.amount_usd_cents, v_balance_after,
      'wd_' || p_withdrawal_id::text,
      jsonb_build_object(
        'withdrawal_id', p_withdrawal_id,
        'asset', v_wd.asset,
        'address', v_wd.recipient_address,
        'admin', p_admin_telegram_id
      )
    );

    RETURN jsonb_build_object(
      'ok', true, 'status', 'approved',
      'balance_cents', v_balance_after,
      'profile_id', v_wd.profile_id,
      'amount_usd_cents', v_wd.amount_usd_cents
    );

  ELSIF p_action = 'rejected' THEN
    UPDATE public.gg_wallets SET
      locked_cents = GREATEST(0, locked_cents - v_wd.amount_usd_cents)
    WHERE profile_id = v_wd.profile_id;

    UPDATE public.gg_withdrawals SET
      status = 'rejected',
      admin_telegram_id = p_admin_telegram_id,
      reject_reason = p_reason,
      processed_at = now()
    WHERE id = p_withdrawal_id;

    RETURN jsonb_build_object(
      'ok', true, 'status', 'rejected',
      'balance_cents', v_wallet.balance_cents,
      'profile_id', v_wd.profile_id,
      'amount_usd_cents', v_wd.amount_usd_cents
    );
  ELSE
    RAISE EXCEPTION 'BAD_ACTION';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.gg_process_withdrawal(uuid, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_process_withdrawal(uuid, text, bigint, text) TO service_role;
