/**
 * useGgOnline — reads real online player count from v_online_players_count view,
 * sends heartbeat every 30s via /api/heartbeat (server-side → gg_heartbeat RPC).
 *
 * Falls back to fake animated count in demo mode.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchOnlinePlayersCount } from '../lib/supabase';
import type { GgGameId } from '../types/database';

const API_BASE = import.meta.env.VITE_API_URL || 'https://webapp-rosy-psi-26.vercel.app';
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const ONLINE_POLL_INTERVAL = 30_000;

// Fake animated online count for demo mode
function fakeDriftOnline(prev: number): number {
  const delta = Math.floor((Math.random() - 0.45) * 8);
  return Math.max(100, Math.min(350, prev + delta));
}

function initFakeOnline(): number {
  const saved = localStorage.getItem('gungad_online');
  if (saved) {
    const n = parseInt(saved);
    if (n >= 80 && n <= 380) {
      return Math.max(100, Math.min(350, n + Math.floor((Math.random() - 0.5) * 20)));
    }
  }
  return Math.floor(Math.random() * 150) + 150;
}

export function useGgOnline(
  profileId: string | null | undefined,
  sessionId: string,
  activeGameId: GgGameId | null,
  isLive: boolean,
): number {
  const [onlineCount, setOnlineCount] = useState<number>(initFakeOnline);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const fakeTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch real online count
  const fetchOnline = useCallback(async () => {
    const count = await fetchOnlinePlayersCount();
    if (count !== null) {
      setOnlineCount(count);
    }
  }, []);

  // Send heartbeat
  const sendHeartbeat = useCallback(async () => {
    if (!profileId) return;
    try {
      await fetch(`${API_BASE}/api/heartbeat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          profile_id: profileId,
          session_id: sessionId,
          game_id:    activeGameId ?? null,
        }),
      });
    } catch {
      // ignore heartbeat failures
    }
  }, [profileId, sessionId, activeGameId]);

  useEffect(() => {
    if (isLive && profileId) {
      // Real mode: fetch actual count + heartbeat
      fetchOnline();
      sendHeartbeat();

      pollTimer.current = setInterval(fetchOnline, ONLINE_POLL_INTERVAL);
      heartbeatTimer.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

      return () => {
        if (pollTimer.current)      clearInterval(pollTimer.current);
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      };
    } else {
      // Demo mode: animated fake online
      const tick = () => {
        setOnlineCount(prev => {
          const next = fakeDriftOnline(prev);
          localStorage.setItem('gungad_online', String(next));
          return next;
        });
        fakeTimer.current = setTimeout(tick, 2500 + Math.random() * 2000);
      };
      fakeTimer.current = setTimeout(tick, 3000);

      return () => {
        if (fakeTimer.current) clearTimeout(fakeTimer.current);
      };
    }
  }, [isLive, profileId, fetchOnline, sendHeartbeat]);

  return onlineCount;
}
