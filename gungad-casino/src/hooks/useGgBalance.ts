/**
 * useGgBalance — wraps balance mutations (bet settle, refill, refetch).
 * All money mutations go through the server-side API → gg_settle_bet RPC.
 * Client NEVER computes the final balance directly.
 */
import { useCallback, useRef } from 'react';
import { GgSessionData } from './useGgSession';
import type { GgGameId } from '../types/database';
import { usdToCents, centsToUsd } from '../types/database';

const API_BASE = import.meta.env.VITE_API_URL || 'https://webapp-rosy-psi-26.vercel.app';

export interface SettleBetParams {
  game_id: GgGameId;
  /** Bet amount in USD (will be converted to cents) */
  betUSD: number;
  /** Payout in USD (0 = loss; >0 = win amount including stake) */
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

let _idempotencyCounter = 0;
function newIdempotencyKey(gameId: string): string {
  return `${gameId}_${Date.now()}_${++_idempotencyCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useGgBalance(
  session: GgSessionData | null,
  status: 'loading' | 'demo' | 'live' | 'error',
  onBalanceUpdate: (newCents: number) => void,
) {
  // Track pending bets to prevent double submit
  const pendingRef = useRef(false);

  /** Settle a bet through the server. Returns new balance_cents. */
  const settleBet = useCallback(async (params: SettleBetParams): Promise<SettleBetResult> => {
    if (status !== 'live' || !session?.profile_id) {
      // Demo mode — compute balance client-side (localStorage only, no DB)
      const betCents   = usdToCents(params.betUSD);
      const payoutCents = usdToCents(params.payoutUSD);
      const newCents   = (session?.balance_cents ?? 250000) - betCents + payoutCents;
      onBalanceUpdate(Math.max(0, newCents));
      return { ok: true, balance_cents: Math.max(0, newCents) };
    }

    if (pendingRef.current) {
      return { ok: false, balance_cents: session.balance_cents, error: 'Bet already in progress' };
    }

    pendingRef.current = true;
    try {
      const betCents    = usdToCents(params.betUSD);
      const payoutCents = usdToCents(params.payoutUSD);

      const body = {
        profile_id:        session.profile_id,
        game_id:           params.game_id,
        bet_cents:         betCents,
        payout_cents:      payoutCents,
        multiplier:        params.multiplier,
        status:            params.status,
        result:            params.result ?? {},
        idempotency_key:   newIdempotencyKey(params.game_id),
        client_seed:       params.client_seed ?? null,
        server_seed_hash:  params.server_seed_hash ?? null,
      };

      const res  = await fetch(`${API_BASE}/api/bet`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        return { ok: false, balance_cents: session.balance_cents, error: json.error ?? 'Bet failed' };
      }

      // Optimistic update with server-confirmed balance
      onBalanceUpdate(json.balance_cents);
      return { ok: true, balance_cents: json.balance_cents, bet_id: json.bet_id };
    } catch (err) {
      console.error('[ggBalance] settleBet error:', err);
      return { ok: false, balance_cents: session?.balance_cents ?? 0, error: 'Network error' };
    } finally {
      pendingRef.current = false;
    }
  }, [session, status, onBalanceUpdate]);

  /** Demo refill — only in live mode: calls /api/wallet/refill */
  const refillDemo = useCallback(async (): Promise<number> => {
    if (status !== 'live' || !session?.profile_id) {
      // Pure demo
      const newCents = (session?.balance_cents ?? 0) + 100000;
      onBalanceUpdate(newCents);
      return newCents;
    }

    try {
      const res = await fetch(`${API_BASE}/api/wallet/refill`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profile_id: session.profile_id }),
      });
      const json = await res.json();
      if (json.ok && json.balance_cents != null) {
        onBalanceUpdate(json.balance_cents);
        return json.balance_cents;
      }
    } catch (err) {
      console.error('[ggBalance] refillDemo error:', err);
    }
    return session?.balance_cents ?? 0;
  }, [session, status, onBalanceUpdate]);

  return { settleBet, refillDemo };
}

export { usdToCents, centsToUsd };
