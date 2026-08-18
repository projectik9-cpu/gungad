/**
 * Bet API
 *   POST /api/bet         — one-shot settle (non-crash games)
 *   POST /api/bet/place   — debit + open pending bet (crash)
 *   POST /api/bet/resolve — resolve pending bet (crash cashout/loss)
 *
 * All routes require initData and verify profile ownership.
 */
import express from 'express';
import { getSupabaseAdmin } from '../../database/supabase.js';
import logger from '../../utils/logger.js';
import { assertProfileOwnership } from './telegramAuth.js';
import { logBetOutcome, logBetPlaced } from '../../services/telegramLog.js';

const router = express.Router();

const VALID_GAMES = ['crash', 'roulette', 'blackjack', 'coinflip', 'dice', 'mines', 'plinko', 'slots'];
const VALID_STATUSES = ['won', 'lost', 'push', 'cashed_out'];
const VALID_RESOLVE_STATUSES = ['won', 'lost', 'push', 'cashed_out', 'cancelled'];

const MIN_BET_CENTS = 1;
const MAX_BET_CENTS = 1_000_000;

/** POST /api/bet — one-shot settle for games that finish in one request */
router.post('/', async (req, res) => {
  try {
    const {
      profile_id,
      initData,
      game_id,
      bet_cents,
      payout_cents,
      multiplier,
      status,
      result,
      idempotency_key,
      client_seed,
      server_seed_hash,
      server_seed,
      wallet,
    } = req.body || {};

    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error, code: auth.code });
    }

    if (!VALID_GAMES.includes(game_id)) {
      return res.status(400).json({ error: `Invalid game_id: ${game_id}` });
    }
    if (game_id === 'crash') {
      return res.status(400).json({
        error: 'Crash must use /api/bet/place and /api/bet/resolve',
        code: 'use_place_resolve',
      });
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

    const MAX_MULTIPLIER = 10_000;
    if (payout_cents > bet_cents * MAX_MULTIPLIER) {
      return res.status(400).json({ error: 'payout_cents exceeds maximum allowed' });
    }

    const walletAsset = String(wallet || 'USD').toUpperCase() === 'STARS' ? 'STARS' : 'USD';

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
      p_wallet:            walletAsset,
    });

    if (error) {
      logger.warn('[bet] gg_settle_bet error: %s', error.message);
      if (error.message?.includes('Insufficient balance')) {
        return res.status(402).json({ error: 'Insufficient balance' });
      }
      return res.status(500).json({ error: 'Failed to settle bet', detail: error.message });
    }

    logger.info('[bet] settled profile=%s game=%s bet=%d payout=%d', profile_id, game_id, bet_cents, payout_cents);

    void logBetOutcome({
      profileId: profile_id,
      gameId: game_id,
      betCents: bet_cents,
      payoutCents: payout_cents,
      multiplier,
      status,
      betId: data?.bet_id,
      phase: 'settle',
      balanceCents: data?.balance_cents,
      lockedCents: data?.locked_cents,
      idempotent: Boolean(data?.idempotent),
    });

    return res.json({ ok: true, ...data });
  } catch (err) {
    logger.error('[bet] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/bet/place — debit available balance, open pending bet */
router.post('/place', async (req, res) => {
  try {
    const { profile_id, initData, game_id, bet_cents, idempotency_key, wallet } = req.body || {};

    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error, code: auth.code });
    }

    if (!VALID_GAMES.includes(game_id)) {
      return res.status(400).json({ error: `Invalid game_id: ${game_id}` });
    }
    if (!Number.isInteger(bet_cents) || bet_cents < MIN_BET_CENTS || bet_cents > MAX_BET_CENTS) {
      return res.status(400).json({ error: `bet_cents must be integer ${MIN_BET_CENTS}–${MAX_BET_CENTS}` });
    }

    const walletAsset = String(wallet || 'USD').toUpperCase() === 'STARS' ? 'STARS' : 'USD';

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('gg_place_bet', {
      p_profile_id:      profile_id,
      p_game_id:         game_id,
      p_bet_cents:       bet_cents,
      p_idempotency_key: idempotency_key ?? null,
      p_wallet:          walletAsset,
    });

    let placeData = data;
    let placeError = error;

    if (placeError?.message?.includes('Open bet already exists')) {
      const { data: pending } = await sb
        .from('gg_bets')
        .select('id')
        .eq('profile_id', profile_id)
        .eq('game_id', game_id)
        .eq('status', 'pending');
      for (const row of pending || []) {
        await sb.rpc('gg_resolve_bet', {
          p_profile_id: profile_id,
          p_bet_id: row.id,
          p_status: 'cancelled',
          p_multiplier: 0,
          p_result: { phase: 'stale_place' },
        });
      }
      const retry = await sb.rpc('gg_place_bet', {
        p_profile_id:      profile_id,
        p_game_id:         game_id,
        p_bet_cents:       bet_cents,
        p_idempotency_key: idempotency_key ?? null,
        p_wallet:          walletAsset,
      });
      placeData = retry.data;
      placeError = retry.error;
    }

    if (placeError) {
      logger.warn('[bet/place] error: %s', placeError.message);
      if (placeError.message?.includes('Insufficient balance')) {
        return res.status(402).json({ error: 'Insufficient balance', code: 'insufficient' });
      }
      if (placeError.message?.includes('Open bet already exists')) {
        return res.status(409).json({ error: 'Open bet already exists', code: 'open_bet_exists' });
      }
      return res.status(500).json({ error: 'Failed to place bet', detail: placeError.message });
    }

    logger.info('[bet/place] profile=%s game=%s bet=%d id=%s', profile_id, game_id, bet_cents, placeData?.bet_id);

    void logBetPlaced({
      profileId: profile_id,
      gameId: game_id,
      betCents: bet_cents,
      betId: placeData?.bet_id,
      balanceCents: placeData?.balance_cents,
      lockedCents: placeData?.locked_cents,
      idempotent: Boolean(placeData?.idempotent),
    });

    return res.json({ ok: true, ...placeData });
  } catch (err) {
    logger.error('[bet/place] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/bet/resolve — cashout or mark lost; server computes payout from multiplier */
router.post('/resolve', async (req, res) => {
  try {
    const { profile_id, initData, bet_id, status, multiplier, result } = req.body || {};

    const auth = await assertProfileOwnership(profile_id, initData);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error, code: auth.code });
    }

    if (!bet_id || typeof bet_id !== 'string') {
      return res.status(400).json({ error: 'bet_id required' });
    }
    if (!VALID_RESOLVE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    const mult = typeof multiplier === 'number' ? multiplier : 0;
    if (status === 'cashed_out' || status === 'won') {
      if (!(mult >= 1 && mult <= 1000)) {
        return res.status(400).json({ error: 'multiplier must be between 1 and 1000' });
      }
    }

    const sb = getSupabaseAdmin();

    let stakeCents = null;
    let gameId = 'crash';
    try {
      const { data: betRow } = await sb
        .from('gg_bets')
        .select('bet_cents, game_id')
        .eq('id', bet_id)
        .maybeSingle();
      if (betRow) {
        stakeCents = betRow.bet_cents;
        gameId = betRow.game_id || 'crash';
      }
    } catch {
      /* ignore */
    }

    const { data, error } = await sb.rpc('gg_resolve_bet', {
      p_profile_id: profile_id,
      p_bet_id:     bet_id,
      p_status:     status,
      p_multiplier: mult,
      p_result:     result ?? {},
    });

    if (error) {
      logger.warn('[bet/resolve] error: %s', error.message);
      if (error.message?.includes('not found')) {
        return res.status(404).json({ error: 'Bet not found' });
      }
      if (error.message?.includes('does not belong')) {
        return res.status(403).json({ error: 'Bet ownership mismatch' });
      }
      if (error.message?.includes('Invalid multiplier')) {
        return res.status(400).json({ error: 'Invalid multiplier' });
      }
      return res.status(500).json({ error: 'Failed to resolve bet', detail: error.message });
    }

    logger.info(
      '[bet/resolve] profile=%s bet=%s status=%s payout=%s',
      profile_id, bet_id, status, data?.payout_cents,
    );

    void logBetOutcome({
      profileId: profile_id,
      gameId,
      betCents: stakeCents ?? 0,
      payoutCents: data?.payout_cents ?? 0,
      multiplier: data?.multiplier ?? mult,
      status: data?.status ?? status,
      betId: bet_id,
      phase: 'resolve',
      balanceCents: data?.balance_cents,
      lockedCents: data?.locked_cents,
      idempotent: Boolean(data?.idempotent),
    });

    return res.json({ ok: true, ...data });
  } catch (err) {
    logger.error('[bet/resolve] Unexpected error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
