/**
 * useGgSession — validates Telegram WebApp initData against the bot backend,
 * creates/loads the GunGad profile, and returns wallet + profile data.
 *
 * In non-Telegram environments (desktop browser, dev) falls back to demo mode.
 */
import { useEffect, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

export interface GgSessionData {
  profile_id: string;
  balance_cents: number;
  stars_balance: number;
  vip_level: number;
  vip_xp: number;
  username: string | null;
  first_name: string | null;
  total_wagered_cents: number;
  total_won_cents: number;
  total_lost_cents: number;
}

export type SessionStatus = 'loading' | 'demo' | 'live' | 'error';

export interface UseGgSessionResult {
  session: GgSessionData | null;
  status: SessionStatus;
  /** Refresh wallet from server */
  refreshWallet: () => Promise<void>;
  /** Update balance locally (optimistic) then re-fetch */
  updateBalance: (newCents: number) => void;
}

function getTelegramWebApp(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    return (window as any).Telegram?.WebApp ?? null;
  } catch {
    return null;
  }
}

/** Wait briefly — Telegram sometimes injects initData a tick after script load */
async function waitForInitData(maxMs = 2500): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const tg = getTelegramWebApp();
    if (tg) {
      try {
        tg.ready?.();
        tg.expand?.();
      } catch {
        // ignore
      }
      if (tg.initData && String(tg.initData).length > 0) {
        return String(tg.initData);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const tg = getTelegramWebApp();
  return tg?.initData ? String(tg.initData) : null;
}

export function useGgSession(): UseGgSessionResult {
  const [session, setSession] = useState<GgSessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const fetchWallet = useCallback(async (profileId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/wallet?profile_id=${profileId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.wallet) {
        setSession(prev => prev ? { ...prev, ...json.wallet } : null);
      }
    } catch {
      // silently fail — keep last known state
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!session?.profile_id) return;
    await fetchWallet(session.profile_id);
  }, [session?.profile_id, fetchWallet]);

  const updateBalance = useCallback((newCents: number) => {
    setSession(prev => prev ? { ...prev, balance_cents: newCents } : null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const initData = await waitForInitData();
      if (cancelled) return;

      if (!initData) {
        // Demo mode — no Telegram context (opened outside the bot)
        setStatus('demo');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        if (!res.ok) throw new Error(`auth ${res.status}`);
        const data = await res.json();
        if (!data.ok) throw new Error('auth rejected');
        if (cancelled) return;
        setSession(data);
        setStatus('live');
      } catch (err) {
        console.warn('[ggSession] auth failed, falling back to demo:', err);
        if (!cancelled) setStatus('demo');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { session, status, refreshWallet, updateBalance };
}
