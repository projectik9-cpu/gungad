import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import { assertProfileOwnership } from './telegramAuth.js';

const router = express.Router();

router.post('/credit', async (req, res) => {
  try {
    const { profile_id, initData, spin_id } = req.body || {};
    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error, code: auth.code });
    if (!spin_id || typeof spin_id !== 'string') return res.status(400).json({ error: 'spin_id required' });
    const sb = getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Supabase not configured' });
    const { data, error } = await sb.rpc('gg_credit_jackpot', {
      p_profile_id: profile_id,
      p_spin_id: spin_id,
      p_amount_stars: 20000,
    });
    if (error) return res.status(500).json({ error: 'Failed to credit jackpot' });
    return res.json({ ok: true, ...data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
