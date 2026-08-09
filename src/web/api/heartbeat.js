/**
 * POST /api/heartbeat
 * Updates gg_presence for online player counting.
 * Body: { profile_id, session_id, game_id? }
 * Returns { ok, online_count }
 *
 * GET /api/heartbeat/online
 * Returns current online player count.
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();

async function getOnlineCount(sb) {
  // Prefer RPC (SECURITY DEFINER) — bypasses RLS
  const { data: rpcCount, error: rpcErr } = await sb.rpc('gg_online_count');
  if (!rpcErr && rpcCount != null) return Number(rpcCount) || 0;

  // View fallback
  const { data, error } = await sb.from('v_online_players_count').select('online_count').maybeSingle();
  if (!error && data != null) return Number(data.online_count) || 0;
  if (error) logger.warn(`[heartbeat] online view error: ${error.message}`);

  // Direct table count — last resort (service_role bypasses RLS)
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { count, error: cntErr } = await sb
    .from('gg_presence')
    .select('*', { count: 'exact', head: true })
    .gt('last_heartbeat_at', since);

  if (cntErr) {
    logger.warn(`[heartbeat] online count error: ${cntErr.message}`);
    return 0;
  }
  return Number(count) || 0;
}

router.get('/online', async (_req, res) => {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
    const online_count = await getOnlineCount(sb);
    return res.json({ ok: true, online_count });
  } catch (err) {
    logger.error(`[heartbeat/online] ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { profile_id, session_id, game_id } = req.body;

    if (!profile_id || !session_id) {
      return res.status(400).json({ error: 'profile_id and session_id required' });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });

    // Only pass game_id if it's a valid enum value
    const validGames = ['crash', 'roulette', 'blackjack', 'coinflip', 'dice', 'mines', 'plinko', 'slots'];
    const safeGameId = validGames.includes(game_id) ? game_id : null;

    const { error } = await sb.rpc('gg_heartbeat', {
      p_profile_id: profile_id,
      p_session_id: session_id,
      p_game_id:    safeGameId,
    });

    if (error) {
      logger.warn(`[heartbeat] error: ${error.message}`);
      return res.status(500).json({ error: 'Heartbeat failed', detail: error.message });
    }

    const online_count = await getOnlineCount(sb);
    return res.json({ ok: true, online_count });
  } catch (err) {
    logger.error(`[heartbeat] Unexpected error: ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
