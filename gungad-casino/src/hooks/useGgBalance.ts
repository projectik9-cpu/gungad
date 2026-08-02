/**
 * useGgBalance — wraps balance mutations (bet settle, refill, refetch).
 * Real money goes through the server API → gg_settle_bet RPC.
 * Demo mode is local-only (opt-in via playMode).
 */
import { useCallback, useRef } from 'react';
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
  bet_id?: string;
  error?: string;
}

export interface GgBalanceOpts {
  playMode: 'real' | 'demo';
  /** Current displayed balance (demo or real) for local settle math */
  balanceCents: number;
}

let _idempotencyCounter = 0;
function newIdempotencyKey(gameId: string): string {
  return `${gameId}_${Date.now()}_${++_idempotencyCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useGgBalance(
  session: GgSessionData | null,
  status: 'loading' | 'demo' | 'live' | 'error',
  onBalanceUpdate: (newCents: number) => void,
  opts: GgBalanceOpts,
) {
  const pendingRef = useRef(false);
  const { playMode, balanceCents } = opts;

  const settleBet = useCallback(async (params: SettleBetParams): Promise<SettleBetResult> => {
    const useServer = playMode === 'real' && status === 'live' && Boolean(session?.profile_id);

    if (!useServer) {
      const betCents = usdToCents(params.betUSD);
      const payoutCents = usdToCents(params.payoutUSD);
      const newCents = balanceCents - betCents + payoutCents;
      const next = Math.max(0, newCents);
      onBalanceUpdate(next);
      return { ok: true, balance_cents: next };
    }

    if (pendingRef.current) {
      return { ok: false, balance_cents: session!.balance_cents, error: 'Bet already in progress' };
    }

    pendingRef.current = true;
    try {
      const betCents = usdToCents(params.betUSD);
      const payoutCents = usdToCents(params.payoutUSD);

      const body = {
        profile_id: session!.profile_id,
        game_id: params.game_id,
        bet_cents: betCents,
        payout_cents: payoutCents,
        multiplier: params.multiplier,
        status: params.status,
        result: params.result ?? {},
        idempotency_key: newIdempotencyKey(params.game_id),
        client_seed: params.client_seed ?? null,
        server_seed_hash: params.server_seed_hash ?? null,
      };

      const res = await fetch(`${API_BASE}/api/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        return { ok: false, balance_cents: session!.balance_cents, error: json.error ?? 'Bet failed' };
      }

      onBalanceUpdate(json.balance_cents);
      return { ok: true, balance_cents: json.balance_cents, bet_id: json.bet_id };
    } catch (err) {
      console.error('[ggBalance] settleBet error:', err);
      return { ok: false, balance_cents: session?.balance_cents ?? 0, error: 'Network error' };
    } finally {
      pendingRef.current = false;
    }
  }, [session, status, onBalanceUpdate, playMode, balanceCents]);

  /** Demo-only local refill (+$1000). Never credits the live wallet. */
  const refillDemo = useCallback(async (): Promise<number> => {
    if (playMode !== 'demo') {
      return balanceCents;
    }
    const newCents = balanceCents + 100000;
    onBalanceUpdate(newCents);
    return newCents;
  }, [playMode, balanceCents, onBalanceUpdate]);

  return { settleBet, refillDemo };
}

export { usdToCents, centsToUsd };
