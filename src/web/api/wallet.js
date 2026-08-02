/**
 * GET /api/wallet?profile_id=...
 * Returns current wallet + profile data. Used by frontend after auth.
 *
 * POST /api/wallet/refill
 * Demo refill $1000. Body: { profile_id }
 *
 * GET /api/wallet/history?profile_id=...&limit=20&offset=0
 * Returns bet history array.
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// GET /api/wallet
router.get('/', async (req, res) => {
  try {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('gg_get_wallet', { p_profile_id: profile_id });
    if (error) {
      logger.warn('[wallet] gg_get_wallet error: %s', error.message);
      return res.status(500).json({ error: 'Failed to fetch wallet' });
    }
    return res.json({ ok: true, wallet: data });
  } catch (err) {
    logger.error('[wallet] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wallet/refill  — demo credit
router.post('/refill', async (req, res) => {
  try {
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('gg_demo_refill', {
      p_profile_id:   profile_id,
      p_amount_cents: 100000, // $1000
    });
    if (error) {
      logger.warn('[wallet/refill] error: %s', error.message);
      return res.status(500).json({ error: 'Refill failed' });
    }
    return res.json({ ok: true, ...data });
  } catch (err) {
    logger.error('[wallet/refill] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/history
router.get('/history', async (req, res) => {
  try {
    const { profile_id, limit = '20', offset = '0' } = req.query;
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('gg_get_bet_history', {
      p_profile_id: profile_id,
      p_limit:      Math.min(parseInt(limit, 10) || 20, 100),
      p_offset:     parseInt(offset, 10) || 0,
    });
    if (error) {
      logger.warn('[wallet/history] error: %s', error.message);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
    return res.json({ ok: true, bets: data ?? [] });
  } catch (err) {
    logger.error('[wallet/history] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
