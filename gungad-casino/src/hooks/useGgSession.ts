/**
 * useGgSession — validates Telegram WebApp initData against the bot backend,
 * creates/loads the GunGad profile, and returns wallet + profile data.
 *
 * In non-Telegram environments (desktop browser, dev) falls back to demo mode.
 */
import { useEffect, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://webapp-rosy-psi-26.vercel.app';

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

function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData) return tg.initData;
  } catch {
    // ignore
  }
  return null;
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
    const initData = getTelegramInitData();

    if (!initData) {
      // Demo mode — no Telegram context
      setStatus('demo');
      return;
    }

    // Authenticate with backend
    fetch(`${API_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`auth ${res.status}`);
        return res.json();
      })
      .then((data: GgSessionData & { ok: boolean }) => {
        if (!data.ok) throw new Error('auth rejected');
        setSession(data);
        setStatus('live');
      })
      .catch(err => {
        console.warn('[ggSession] auth failed, falling back to demo:', err);
        setStatus('demo');
      });
  }, []);

  return { session, status, refreshWallet, updateBalance };
}
