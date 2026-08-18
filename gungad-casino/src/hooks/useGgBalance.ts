/**
 * useGgBalance — wraps balance mutations (bet settle, place, resolve, refill).
 * Real money goes through the server API.
 * Demo mode is local-only (opt-in via playMode).
 */
import { useCallback } from 'react';
import { GgSessionData } from './useGgSession';
import type { GgGameId } from '../types/database';
import { usdToCents, centsToUsd } from '../types/database';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

export interface SettleBetParams {
  game_id: GgGameId;
  betUSD: number;
  payoutUSD: number;
  multiplier: number;
  status: 'won' | 'lost' | 'push' | 'cashed_out';
  result?: Record<string, unknown>;
  client_seed?: string;
  server_seed_hash?: string;
}

export interface SettleBetResult {
  ok: boolean;
  balance_cents: number;
  locked_cents?: number;
  bet_id?: string;
  error?: string;
}

export interface PlaceBetParams {
  game_id: GgGameId;
  betUSD: number;
}

export interface PlaceBetResult {
  ok: boolean;
  bet_id?: string;
  balance_cents: number;
  locked_cents?: number;
  bet_cents?: number;
  error?: string;
}

export interface ResolveBetParams {
  bet_id: string;
  status: 'won' | 'lost' | 'push' | 'cashed_out' | 'cancelled';
  multiplier?: number;
  result?: Record<string, unknown>;
}

export interface ResolveBetResult {
  ok: boolean;
  balance_cents: number;
  locked_cents?: number;
  payout_cents?: number;
  multiplier?: number;
  status?: string;
  error?: string;
}

export interface GgBalanceOpts {
  playMode: 'real' | 'demo';
  /** Current displayed balance (demo or real) for local settle math */
  balanceCents: number;
  wallet?: 'USD' | 'STARS';
}

let _idempotencyCounter = 0;
function newIdempotencyKey(gameId: string): string {
  return `${gameId}_${Date.now()}_${++_idempotencyCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

let _walletMutationSeq = 0;
let _walletAppliedSeq = 0;
function beginWalletMutation(): number {
  return ++_walletMutationSeq;
}
function applyWalletIfLatest(seq: number, apply: () => void): boolean {
  if (seq < _walletAppliedSeq) return false;
  _walletAppliedSeq = seq;
  apply();
  return true;
}

function getInitData(): string | null {
  try {
    const early = (window as any).__GG_INIT_DATA;
    if (early && String(early).length > 10) return String(early);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && String(tg.initData).length > 10) return String(tg.initData);
  } catch {
    /* ignore */
  }
  return null;
}

export function useGgBalance(
  session: GgSessionData | null,
  status: 'loading' | 'demo' | 'live' | 'error',
  onBalanceUpdate: (newCents: number, lockedCents?: number, starsBalance?: number) => void,
  opts: GgBalanceOpts,
) {
  const { playMode, balanceCents, wallet = 'USD' } = opts;

  const settleBet = useCallback(async (params: SettleBetParams): Promise<SettleBetResult> => {
    const useServer = playMode === 'real' && status === 'live' && Boolean(session?.profile_id);

    if (!useServer) {
      const seq = beginWalletMutation();
      const betCents = usdToCents(params.betUSD);
      const payoutCents = usdToCents(params.payoutUSD);
      const newCents = balanceCents - betCents + payoutCents;
      const next = Math.max(0, newCents);
      applyWalletIfLatest(seq, () => onBalanceUpdate(next));
      return { ok: true, balance_cents: next };
    }

    const initData = getInitData();
    if (!initData) {
      return { ok: false, balance_cents: session!.balance_cents, error: 'Missing initData' };
    }

    const seq = beginWalletMutation();
    try {
      const body = {
        profile_id:        session!.profile_id,
        initData,
        game_id:           params.game_id,
        bet_cents:         usdToCents(params.betUSD),
        payout_cents:      usdToCents(params.payoutUSD),
        multiplier:        params.multiplier,
        status:            params.status,
        result:            params.result ?? {},
        idempotency_key:   newIdempotencyKey(params.game_id),
        client_seed:       params.client_seed ?? null,
        server_seed_hash:  params.server_seed_hash ?? null,
        wallet,
      };

      const res = await fetch(`${API_BASE}/api/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        console.warn('[ggBalance] settleBet failed:', json.error, res.status);
        return { ok: false, balance_cents: session!.balance_cents, error: json.error ?? 'Bet failed' };
      }

      applyWalletIfLatest(seq, () => onBalanceUpdate(json.balance_cents, json.locked_cents, json.stars_balance));
      return {
        ok: true,
        balance_cents: json.balance_cents,
        locked_cents: json.locked_cents,
        bet_id: json.bet_id,
      };
    } catch (err) {
      console.error('[ggBalance] settleBet network error:', err);
      return { ok: false, balance_cents: session?.balance_cents ?? 0, error: 'Network error' };
    }
  }, [session, status, onBalanceUpdate, playMode, balanceCents, wallet]);

  const placeBet = useCallback(async (params: PlaceBetParams): Promise<PlaceBetResult> => {
    const useServer = playMode === 'real' && status === 'live' && Boolean(session?.profile_id);

    if (!useServer) {
      const seq = beginWalletMutation();
      const betCents = usdToCents(params.betUSD);
      if (betCents <= 0 || betCents > balanceCents) {
        return { ok: false, balance_cents: balanceCents, error: 'Insufficient balance' };
      }
      const next = balanceCents - betCents;
      applyWalletIfLatest(seq, () => onBalanceUpdate(next));
      return {
        ok: true,
        bet_id: `demo_${Date.now()}`,
        balance_cents: next,
        bet_cents: betCents,
      };
    }

    const initData = getInitData();
    if (!initData) {
      return { ok: false, balance_cents: session!.balance_cents, error: 'Missing initData' };
    }

    const seq = beginWalletMutation();
    const body = {
      profile_id: session!.profile_id,
      initData,
      game_id: params.game_id,
      bet_cents: usdToCents(params.betUSD),
      idempotency_key: newIdempotencyKey(`${params.game_id}_place`),
      wallet,
    };
    try {
      const post = () => fetch(`${API_BASE}/api/bet/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let res = await post();
      let json = await res.json().catch(() => ({}));
      if (!res.ok && (res.status >= 500 || res.status === 409)) {
        await new Promise((r) => setTimeout(r, 180));
        res = await post();
        json = await res.json().catch(() => ({}));
      }
      if (!res.ok || !json.ok) {
        console.warn('[ggBalance] placeBet failed:', json.error, res.status);
        return {
          ok: false,
          balance_cents: session!.balance_cents,
          locked_cents: session!.locked_cents,
          error: json.error ?? 'Place failed',
        };
      }
      applyWalletIfLatest(seq, () => onBalanceUpdate(json.balance_cents, json.locked_cents, json.stars_balance));
      return {
        ok: true,
        bet_id: json.bet_id,
        balance_cents: json.balance_cents,
        locked_cents: json.locked_cents,
        bet_cents: json.bet_cents,
      };
    } catch (err) {
      console.error('[ggBalance] placeBet network error:', err);
      return { ok: false, balance_cents: session?.balance_cents ?? 0, error: 'Network error' };
    }
  }, [session, status, onBalanceUpdate, playMode, balanceCents, wallet]);

  const resolveBet = useCallback(async (params: ResolveBetParams): Promise<ResolveBetResult> => {
    const useServer = playMode === 'real' && status === 'live' && Boolean(session?.profile_id);

    if (!useServer) {
      // Demo: stake already deducted at place
      if (params.status === 'lost') {
        return { ok: true, balance_cents: balanceCents, payout_cents: 0, status: params.status };
      }
      const stakeCents = typeof params.result?.bet_cents === 'number'
        ? Number(params.result.bet_cents)
        : 0;
      if (params.status === 'cancelled') {
        const seq = beginWalletMutation();
        const next = balanceCents + stakeCents;
        applyWalletIfLatest(seq, () => onBalanceUpdate(next));
        return {
          ok: true,
          balance_cents: next,
          payout_cents: stakeCents,
          multiplier: 1,
          status: 'cancelled',
        };
      }
      const mult = params.multiplier ?? 1;
      const payoutCents = Math.round(stakeCents * mult);
      const seq = beginWalletMutation();
      const next = balanceCents + payoutCents;
      applyWalletIfLatest(seq, () => onBalanceUpdate(next));
      return {
        ok: true,
        balance_cents: next,
        payout_cents: payoutCents,
        multiplier: mult,
        status: params.status,
      };
    }

    const initData = getInitData();
    if (!initData) {
      return { ok: false, balance_cents: session!.balance_cents, error: 'Missing initData' };
    }

    const seq = beginWalletMutation();
    try {
      const res = await fetch(`${API_BASE}/api/bet/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: session!.profile_id,
          initData,
          bet_id: params.bet_id,
          status: params.status,
          multiplier: params.multiplier ?? 0,
          result: params.result ?? {},
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        console.warn('[ggBalance] resolveBet failed:', json.error, res.status);
        return {
          ok: false,
          balance_cents: session!.balance_cents,
          locked_cents: session!.locked_cents,
          error: json.error ?? 'Resolve failed',
        };
      }
      applyWalletIfLatest(seq, () => onBalanceUpdate(json.balance_cents, json.locked_cents, json.stars_balance));
      return {
        ok: true,
        balance_cents: json.balance_cents,
        locked_cents: json.locked_cents,
        payout_cents: json.payout_cents,
        multiplier: json.multiplier,
        status: json.status,
      };
    } catch (err) {
      console.error('[ggBalance] resolveBet network error:', err);
      return { ok: false, balance_cents: session?.balance_cents ?? 0, error: 'Network error' };
    }
  }, [session, status, onBalanceUpdate, playMode, balanceCents, wallet]);

  /** Demo-only local refill (+$1000). Never credits the live wallet. */
  const refillDemo = useCallback(async (): Promise<number> => {
    if (playMode !== 'demo') {
      return balanceCents;
    }
    const seq = beginWalletMutation();
    const newCents = balanceCents + 100000;
    applyWalletIfLatest(seq, () => onBalanceUpdate(newCents));
    return newCents;
  }, [playMode, balanceCents, onBalanceUpdate]);

  return { settleBet, placeBet, resolveBet, refillDemo };
}

export { usdToCents, centsToUsd };
