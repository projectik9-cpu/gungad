/**
 * POST /api/heartbeat
 * Updates gg_presence for online player counting.
 * Body: { profile_id, session_id, game_id? }
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { profile_id, session_id, game_id } = req.body;

    if (!profile_id || !session_id) {
      return res.status(400).json({ error: 'profile_id and session_id required' });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb.rpc('gg_heartbeat', {
      p_profile_id: profile_id,
      p_session_id: session_id,
      p_game_id:    game_id ?? null,
    });

    if (error) {
      logger.warn('[heartbeat] error: %s', error.message);
      return res.status(500).json({ error: 'Heartbeat failed' });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error('[heartbeat] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
