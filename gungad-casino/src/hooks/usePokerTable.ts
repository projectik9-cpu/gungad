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

  const refresh = useCallback(async () => {
    if (!tableId || !profileId) return;
    try {
      const json = await pokerFetch('/state', { profile_id: profileId, table_id: tableId });
      if (mounted.current && json.state) setState(json.state);
      setError(null);
    } catch (e: any) {
      if (mounted.current) setError(e.message || 'Failed to load table');
    }
  }, [tableId, profileId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !tableId || !profileId) return;
    void refresh();
    const poll = setInterval(() => { void refresh(); }, 1200);
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      channel = supabase
        .channel(`poker:${tableId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gg_poker_tables', filter: `id=eq.${tableId}` },
          () => { void refresh(); },
        )
        .subscribe();
    }
    return () => {
      clearInterval(poll);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [enabled, tableId, profileId, refresh]);

  const act = useCallback(async (type: string, amountCents?: number) => {
    if (!tableId || !profileId) return;
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
      setBusy(false);
    }
  }, [tableId, profileId]);

  return { state, error, busy, refresh, act, setState };
}
