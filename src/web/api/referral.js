/**
 * GET/POST /api/referral/stats
 * Body: { profile_id, initData }
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import { assertProfileOwnership } from './telegramAuth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.post('/stats', async (req, res) => {
  try {
    const { profile_id, initData } = req.body || {};
    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error, code: auth.code });
    }

    const sb = getSupabaseAdmin();
    const { data: me, error: meErr } = await sb
      .from('gg_profiles')
      .select('id, telegram_id')
      .eq('id', auth.profileId)
      .maybeSingle();

    if (meErr || !me) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const [invited, ledger] = await Promise.all([
      sb
        .from('gg_profiles')
        .select('username, first_name, created_at, telegram_id', { count: 'exact' })
        .eq('referrer_telegram_id', me.telegram_id)
        .order('created_at', { ascending: false })
        .limit(12),
      sb
        .from('gg_ledger')
        .select('amount_cents, meta')
        .eq('profile_id', auth.profileId)
        .eq('kind', 'referral'),
    ]);

    if (invited.error) throw new Error(invited.error.message);
    if (ledger.error) throw new Error(ledger.error.message);

    let usdCents = 0;
    let starsCents = 0;
    for (const row of ledger.data || []) {
      const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
      if (String(meta.wallet || '').toUpperCase() === 'STARS') {
        starsCents += Number(meta.star_cents) || 0;
      } else {
        usdCents += Number(row.amount_cents) || 0;
      }
    }

    const friends = (invited.data || []).map((p) => ({
      name: p.username
        ? `@${p.username}`
        : (p.first_name || `ID ${p.telegram_id}`),
      joined_at: p.created_at,
    }));

    return res.json({
      ok: true,
      invited_count: invited.count ?? friends.length,
      usd_cents: usdCents,
      stars_cents: starsCents,
      friends,
    });
  } catch (err) {
    logger.error('[referral/stats] %s', err?.message || err);
    return res.status(500).json({ error: 'Failed to load referral stats' });
  }
});

export default router;
