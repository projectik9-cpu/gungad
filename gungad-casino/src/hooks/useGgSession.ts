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
  locked_cents: number;
  stars_balance: number;
  vip_level: number;
  vip_xp: number;
  username: string | null;
  first_name: string | null;
  total_wagered_cents: number;
  total_wagered_stars: number;
  total_won_cents: number;
  total_lost_cents: number;
  telegram_id?: number | null;
  welcome_bonus_available?: boolean;
}

export type SessionStatus = 'loading' | 'demo' | 'live' | 'error';

export interface UseGgSessionResult {
  session: GgSessionData | null;
  status: SessionStatus;
  /** Why demo/error — for UI badge tooltip */
  statusDetail: string | null;
  refreshWallet: () => Promise<void>;
  updateBalance: (newCents: number, lockedCents?: number) => void;
  updateStars: (stars: number) => void;
  bumpWagered: (cents: number, wallet: 'USD' | 'STARS') => void;
  setWelcomeBonusClaimed: () => void;
}

function getTelegramWebApp(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    return (window as any).Telegram?.WebApp ?? null;
  } catch {
    return null;
  }
}

async function waitForInitData(maxMs = 5000): Promise<{ initData: string | null; platform: string | null }> {
  const started = Date.now();
  let platform: string | null = null;

  // Prefer value captured in index.html before React loads
  try {
    const early = (window as any).__GG_INIT_DATA;
    if (early && String(early).length > 10) {
      return {
        initData: String(early),
        platform: (window as any).__GG_TG_PLATFORM || getTelegramWebApp()?.platform || null,
      };
    }
  } catch {
    // ignore
  }

  while (Date.now() - started < maxMs) {
    const tg = getTelegramWebApp();
    if (tg) {
      try {
        tg.ready?.();
        tg.expand?.();
        platform = tg.platform ?? null;
      } catch {
        // ignore
      }
      if (tg.initData && String(tg.initData).length > 10) {
        return { initData: String(tg.initData), platform };
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const tg = getTelegramWebApp();
  platform = tg?.platform ?? null;
  const initData = tg?.initData && String(tg.initData).length > 10 ? String(tg.initData) : null;
  return { initData, platform };
}

export function useGgSession(): UseGgSessionResult {
  const [session, setSession] = useState<GgSessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);

  const fetchWallet = useCallback(async (profileId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/wallet?profile_id=${profileId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.wallet) {
        setSession((prev) => {
          if (!prev) return null;
          const w = json.wallet;
          return {
            ...prev,
            ...w,
            // Keep optimistic stake totals if a settle is still in flight
            total_wagered_cents: Math.max(
              Number(prev.total_wagered_cents) || 0,
              Number(w.total_wagered_cents) || 0,
            ),
            total_wagered_stars: Math.max(
              Number(prev.total_wagered_stars) || 0,
              Number(w.total_wagered_stars) || 0,
            ),
          };
        });
      }
    } catch {
      // keep last known state
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!session?.profile_id) return;
    await fetchWallet(session.profile_id);
  }, [session?.profile_id, fetchWallet]);

  const updateBalance = useCallback((newCents: number, lockedCents?: number) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            balance_cents: newCents,
            ...(typeof lockedCents === 'number' ? { locked_cents: lockedCents } : {}),
          }
        : null,
    );
  }, []);

  const updateStars = useCallback((stars: number) => {
    setSession((prev) => (prev ? { ...prev, stars_balance: Math.max(0, stars) } : null));
  }, []);

  const bumpWagered = useCallback((cents: number, wallet: 'USD' | 'STARS') => {
    if (!Number.isFinite(cents) || cents <= 0) return;
    setSession((prev) => {
      if (!prev) return prev;
      if (wallet === 'STARS') {
        return { ...prev, total_wagered_stars: (prev.total_wagered_stars ?? 0) + cents };
      }
      return { ...prev, total_wagered_cents: (prev.total_wagered_cents ?? 0) + cents };
    });
  }, []);

  const setWelcomeBonusClaimed = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, welcome_bonus_available: false } : null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Diagnose API reachability first
      try {
        const ping = await fetch(`${API_BASE}/api/auth/ping`, { signal: AbortSignal.timeout(8000) });
        const pingJson = await ping.json().catch(() => ({}));
        console.info('[ggSession] api ping', API_BASE, pingJson);
        if (!pingJson.has_bot_token) {
          console.warn('[ggSession] Railway BOT_TOKEN missing');
        }
      } catch (e) {
        console.warn('[ggSession] api unreachable', API_BASE, e);
        if (!cancelled) {
          setStatus('demo');
          setStatusDetail('api↓');
        }
        return;
      }

      const { initData, platform } = await waitForInitData();
      if (cancelled) return;

      console.info('[ggSession] tg', { platform, hasInitData: Boolean(initData), len: initData?.length ?? 0 });

      if (!initData) {
        setStatus('demo');
        setStatusDetail(getTelegramWebApp() ? 'no-init' : 'no-tg');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            initData,
            ref: (window as any).__GG_REF || new URLSearchParams(window.location.search).get('ref') || localStorage.getItem('gg_ref') || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          console.warn('[ggSession] auth failed', res.status, data);
          if (!cancelled) {
            setStatus('demo');
            setStatusDetail(data.code || `auth${res.status}`);
          }
          return;
        }
        if (cancelled) return;
        setSession({
          ...data,
          locked_cents: Number(data.locked_cents) || 0,
        });
        setStatus('live');
        setStatusDetail(null);
      } catch (err) {
        console.warn('[ggSession] auth network error', err);
        if (!cancelled) {
          setStatus('demo');
          setStatusDetail('net');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { session, status, statusDetail, refreshWallet, updateBalance, updateStars, bumpWagered, setWelcomeBonusClaimed };
}
