/**
 * useGgOnline — display count is a realistic 100–150 simulation (time-of-day).
 * Heartbeat still writes real presence when the player is live.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import type { GgGameId } from '../types/database';
import { simulatedOnlineCount } from '../utils/simulatedOnline';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';
const HEARTBEAT_INTERVAL = 15_000;
const DISPLAY_TICK_MS = 2800;

export function useGgOnline(
  profileId: string | null | undefined,
  sessionId: string,
  activeGameId: GgGameId | null,
  isLive: boolean,
): number {
  const [onlineCount, setOnlineCount] = useState<number>(() => simulatedOnlineCount());
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!profileId) return;
    try {
      await fetch(`${API_BASE}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          session_id: sessionId,
          game_id: activeGameId ?? null,
        }),
      });
    } catch {
      // ignore transient failures
    }
  }, [profileId, sessionId, activeGameId]);

  useEffect(() => {
    const tick = () => {
      const target = simulatedOnlineCount();
      setOnlineCount((prev) => {
        if (prev === target) return prev;
        const dir = target > prev ? 1 : -1;
        const delta = Math.min(2, Math.abs(target - prev));
        return prev + dir * delta;
      });
    };
    tick();
    const displayTimer = setInterval(tick, DISPLAY_TICK_MS);
    return () => clearInterval(displayTimer);
  }, []);

  useEffect(() => {
    if (!isLive || !profileId) return;

    sendHeartbeat();
    heartbeatTimer.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    const onVisible = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isLive, profileId, sendHeartbeat]);

  return onlineCount;
}
