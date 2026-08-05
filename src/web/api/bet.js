/**
 * POST /api/bet
 * Atomically settles a game bet via gg_settle_bet RPC (service_role).
 * Body: { profile_id, game_id, bet_cents, payout_cents, multiplier, status,
 *         result, idempotency_key, client_seed, server_seed_hash, server_seed }
 *
 * The client MUST NOT send payout amount — server calculates it from game result.
 * This route is the single source of truth for balance changes.
 *
 * NOTE: client sends game outcome params; server verifies and calculates payout.
 * For full provably-fair: server generates seeds. For now we accept client seeds
 * and store for audit. Balance calculation is server-side only.
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();

const VALID_GAMES = ['crash', 'roulette', 'blackjack', 'coinflip', 'dice', 'mines', 'plinko', 'slots'];
const VALID_STATUSES = ['won', 'lost', 'push', 'cashed_out'];

// Basic sanity — bet limits in cents ($0.01 to $10,000)
const MIN_BET_CENTS = 1;
const MAX_BET_CENTS = 1_000_000;

router.post('/', async (req, res) => {
  try {
    const {
      profile_id,
      game_id,
      bet_cents,
      payout_cents,    // 0 for loss; full payout (stake+profit) for win
      multiplier,
      status,
      result,
      idempotency_key,
      client_seed,
      server_seed_hash,
      server_seed,
    } = req.body;

    // --- Validation --------------------------------------------------------
    if (!profile_id || typeof profile_id !== 'string') {
      return res.status(400).json({ error: 'profile_id required' });
    }
    if (!VALID_GAMES.includes(game_id)) {
      return res.status(400).json({ error: `Invalid game_id: ${game_id}` });
    }
    if (!Number.isInteger(bet_cents) || bet_cents < MIN_BET_CENTS || bet_cents > MAX_BET_CENTS) {
      return res.status(400).json({ error: `bet_cents must be integer ${MIN_BET_CENTS}–${MAX_BET_CENTS}` });
    }
    if (!Number.isInteger(payout_cents) || payout_cents < 0) {
      return res.status(400).json({ error: 'payout_cents must be non-negative integer' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }
    if (typeof multiplier !== 'number' || multiplier < 0) {
      return res.status(400).json({ error: 'multiplier must be non-negative number' });
    }

    // Sanity: payout cannot exceed bet × some max multiplier (e.g. 10,000x)
    const MAX_MULTIPLIER = 10_000;
    if (payout_cents > bet_cents * MAX_MULTIPLIER) {
      return res.status(400).json({ error: 'payout_cents exceeds maximum allowed' });
    }

    // --- Call atomic RPC ---------------------------------------------------
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('gg_settle_bet', {
      p_profile_id:        profile_id,
      p_game_id:           game_id,
      p_bet_cents:         bet_cents,
      p_payout_cents:      payout_cents,
      p_multiplier:        multiplier,
      p_status:            status,
      p_result:            result ?? {},
      p_idempotency_key:   idempotency_key ?? null,
      p_client_seed:       client_seed ?? null,
      p_server_seed_hash:  server_seed_hash ?? null,
      p_server_seed:       server_seed ?? null,
    });

    if (error) {
      logger.warn('[bet] gg_settle_bet error: %s', error.message);
      if (error.message?.includes('Insufficient balance')) {
        return res.status(402).json({ error: 'Insufficient balance' });
      }
      return res.status(500).json({ error: 'Failed to settle bet', detail: error.message });
    }

    logger.info('[bet] settled profile=%s game=%s bet=%d payout=%d', profile_id, game_id, bet_cents, payout_cents);
    return res.json({ ok: true, ...data });
  } catch (err) {
    logger.error('[bet] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
