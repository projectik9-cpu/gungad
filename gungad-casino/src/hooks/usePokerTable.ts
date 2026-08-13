import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { pokerFetch } from '../game/pokerApi';

export function usePokerTable(
  tableId: string | null,
  profileId: string | null,
  enabled: boolean,
) {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const acting = useRef(false);
  const pollInflight = useRef(false);

  const refresh = useCallback(async (light = true) => {
    if (!tableId || !profileId || acting.current) return;
    if (light && pollInflight.current) return;
    if (light) pollInflight.current = true;
    try {
      const json = await pokerFetch('/state', {
        profile_id: profileId,
        table_id: tableId,
        light,
      });
      if (mounted.current && json.state && !acting.current) setState(json.state);
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e.message || 'Failed to load table');
    } finally {
      if (light) pollInflight.current = false;
    }
  }, [tableId, profileId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !tableId || !profileId) return;
    void refresh(false);
    const poll = setInterval(() => { void refresh(true); }, 700);
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`poker:${tableId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gg_poker_tables', filter: `id=eq.${tableId}` },
          () => { void refresh(true); },
        )
        .subscribe();
    }
    return () => {
      clearInterval(poll);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [enabled, tableId, profileId, refresh]);

  const act = useCallback(async (type: string, amountCents?: number) => {
    if (!tableId || !profileId || acting.current) return;
    acting.current = true;
    setBusy(true);
    try {
      const json = await pokerFetch('/action', {
        profile_id: profileId,
        table_id: tableId,
        type,
        amount_cents: amountCents,
      });
      if (json.state) setState(json.state);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }, [tableId, profileId]);

  return { state, error, busy, refresh, act, setState };
}
