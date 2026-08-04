/**
 * useGgBalance — wraps balance mutations (bet settle, refill, refetch).
 * Real money goes through the server API → gg_settle_bet RPC.
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
  const { playMode, balanceCents } = opts;

  const settleBet = useCallback(async (params: SettleBetParams): Promise<SettleBetResult> => {
    const useServer = playMode === 'real' && status === 'live' && Boolean(session?.profile_id);

    if (!useServer) {
      // Demo — local only, no server call
      const betCents = usdToCents(params.betUSD);
      const payoutCents = usdToCents(params.payoutUSD);
      const newCents = balanceCents - betCents + payoutCents;
      const next = Math.max(0, newCents);
      onBalanceUpdate(next);
      return { ok: true, balance_cents: next };
    }

    // Real mode — always hit server (idempotency key prevents double-settle)
    try {
      const body = {
        profile_id:        session!.profile_id,
        game_id:           params.game_id,
        bet_cents:         usdToCents(params.betUSD),
        payout_cents:      usdToCents(params.payoutUSD),
        multiplier:        params.multiplier,
        status:            params.status,
        result:            params.result ?? {},
        idempotency_key:   newIdempotencyKey(params.game_id),
        client_seed:       params.client_seed ?? null,
        server_seed_hash:  params.server_seed_hash ?? null,
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

      // Server is source of truth — update balance from server response
      onBalanceUpdate(json.balance_cents);
      return { ok: true, balance_cents: json.balance_cents, bet_id: json.bet_id };
    } catch (err) {
      console.error('[ggBalance] settleBet network error:', err);
      return { ok: false, balance_cents: session?.balance_cents ?? 0, error: 'Network error' };
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
