-- Close leftover empty cash tables (including the original seed).
-- Players create tables themselves; empty waiting tables should not hang in the lobby.

UPDATE public.gg_poker_tables t
SET status = 'closed'
WHERE t.status <> 'closed'
  AND NOT EXISTS (
    SELECT 1 FROM public.gg_poker_seats s WHERE s.table_id = t.id
  );

DELETE FROM public.gg_poker_secrets s
WHERE NOT EXISTS (
  SELECT 1 FROM public.gg_poker_tables t
  WHERE t.id = s.table_id AND t.status <> 'closed'
);
