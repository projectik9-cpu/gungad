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
import { simulatedOnlineCount } from '../../utils/simulatedOnline.js';

const router = express.Router();

router.get('/online', async (_req, res) => {
  try {
    return res.json({ ok: true, online_count: simulatedOnlineCount() });
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

    return res.json({ ok: true, online_count: simulatedOnlineCount() });
  } catch (err) {
    logger.error(`[heartbeat] Unexpected error: ${err?.message || err}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
