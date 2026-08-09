-- Reliable online counter (SECURITY DEFINER, service_role / authenticated callers via API)
CREATE OR REPLACE FUNCTION public.gg_online_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.gg_presence
  WHERE last_heartbeat_at > now() - interval '2 minutes';
$$;

REVOKE ALL ON FUNCTION public.gg_online_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gg_online_count() TO service_role;
GRANT EXECUTE ON FUNCTION public.gg_online_count() TO anon, authenticated;
