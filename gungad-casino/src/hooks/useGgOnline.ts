/**
 * useGgOnline — real online player count via Railway API (service_role),
 * sends heartbeat every 15s. No direct anon Supabase read (RLS broke the view).
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import type { GgGameId } from '../types/database';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';
const HEARTBEAT_INTERVAL = 15_000;
const ONLINE_POLL_INTERVAL = 15_000;

export function useGgOnline(
  profileId: string | null | undefined,
  sessionId: string,
  activeGameId: GgGameId | null,
  isLive: boolean,
): number {
  // Start at 1 when live (at least yourself), 0 until first poll otherwise
  const [onlineCount, setOnlineCount] = useState<number>(isLive ? 1 : 0);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOnline = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/heartbeat/online`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && typeof json.online_count === 'number') {
        setOnlineCount(Math.max(0, json.online_count));
      }
    } catch {
      // keep last known
    }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    if (!profileId) return;
    try {
      const res = await fetch(`${API_BASE}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          session_id: sessionId,
          game_id: activeGameId ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && typeof json.online_count === 'number') {
        setOnlineCount(Math.max(1, json.online_count));
      }
    } catch {
      // ignore transient failures
    }
  }, [profileId, sessionId, activeGameId]);

  useEffect(() => {
    if (!isLive || !profileId) {
      setOnlineCount(0);
      return;
    }

    // Immediate write + read
    sendHeartbeat();
    fetchOnline();

    pollTimer.current = setInterval(fetchOnline, ONLINE_POLL_INTERVAL);
    heartbeatTimer.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Telegram / mobile WebViews throttle timers in background — pulse on focus
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        fetchOnline();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isLive, profileId, fetchOnline, sendHeartbeat]);

  return onlineCount;
}
