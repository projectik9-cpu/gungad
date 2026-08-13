/**
 * Poker cash-game API. All money/cards are resolved on the server.
 */
import express from 'express';
import { assertProfileOwnership } from './telegramAuth.js';
import logger from '../../utils/logger.js';
import {
  buyin,
  chatMessages,
  createTable,
  handHistory,
  leaveTable,
  listLobby,
  listSpectators,
  loadState,
  maybeStartHand,
  personalizedState,
  playerAction,
  postChat,
  rebuy,
  sitOut,
  spectate,
} from '../../poker/tableService.js';
import { logBetPlaced, logBetOutcome } from '../../services/telegramLog.js';

const router = express.Router();

async function auth(req, res) {
  const profileId = req.body?.profile_id || req.query?.profile_id;
  const init = req.body?.initData || req.query?.initData;
  const result = await assertProfileOwnership(profileId, init);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, code: result.code });
    return null;
  }
  return result.profileId;
}

function sendPokerError(res, err) {
  const code = err.code || 'error';
  const map = {
    insufficient: 402,
    seated: 409,
    full: 409,
    in_hand: 409,
    leave_queued: 409,
    not_seated: 404,
    not_found: 404,
    illegal: 400,
    buyin: 400,
    rate: 429,
    stale: 409,
  };
  const status = map[code] || 500;
  if (status >= 500) logger.warn('[poker] %s', err.message);
  return res.status(status).json({ error: err.message, code });
}

const lobbyHandler = async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const data = await listLobby();
    return res.json({ ok: true, ...data });
  } catch (err) {
    return sendPokerError(res, err);
  }
};

router.get('/lobby', lobbyHandler);
router.post('/lobby', lobbyHandler);

router.post('/tables', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const table = await createTable({
      profileId,
      stakeId: req.body.stake_id,
      maxSeats: req.body.max_seats,
      sbCents: req.body.sb_cents,
      bbCents: req.body.bb_cents,
      anteCents: req.body.ante_cents,
      timeoutSec: req.body.action_timeout_sec,
    });
    return res.json({ ok: true, table });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/join', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const amount = Number(req.body.amount_cents);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount_cents required', code: 'buyin' });
    }
    const data = await buyin({
      profileId,
      tableId: req.body.table_id,
      seatNo: req.body.seat_no ?? null,
      amountCents: amount,
      username: req.body.username,
      firstName: req.body.first_name,
    });
    void logBetPlaced({
      profileId,
      gameId: 'poker',
      betCents: amount,
      betId: data?.table_id,
      balanceCents: data?.balance_cents,
      lockedCents: data?.locked_cents,
      idempotent: Boolean(data?.idempotent),
    });
    const state = await loadState(req.body.table_id);
    return res.json({
      ok: true,
      ...data,
      state: personalizedState(state, profileId),
    });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/leave', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const data = await leaveTable({ profileId, tableId: req.body.table_id });
    void logBetOutcome({
      profileId,
      gameId: 'poker',
      betCents: data?.cashed_cents || 0,
      payoutCents: data?.cashed_cents || 0,
      multiplier: 1,
      status: 'cashed_out',
      phase: 'settle',
      balanceCents: data?.balance_cents,
      lockedCents: data?.locked_cents,
    });
    return res.json({ ok: true, ...data });
  } catch (err) {
    if (err.code === 'leave_queued') {
      return res.json({ ok: true, queued: true, error: err.message, code: err.code });
    }
    return sendPokerError(res, err);
  }
});

router.post('/rebuy', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const amount = Number(req.body.amount_cents);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount_cents required', code: 'buyin' });
    }
    const data = await rebuy({ profileId, tableId: req.body.table_id, amountCents: amount });
    return res.json({ ok: true, ...data });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/sit-out', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    await sitOut({
      profileId,
      tableId: req.body.table_id,
      sittingOut: req.body.sitting_out !== false,
    });
    const state = await loadState(req.body.table_id);
    return res.json({ ok: true, state: personalizedState(state, profileId) });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/sit-in', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    await sitOut({ profileId, tableId: req.body.table_id, sittingOut: false });
    try {
      await maybeStartHand(req.body.table_id);
    } catch {
      /* ignore */
    }
    const state = await loadState(req.body.table_id);
    return res.json({ ok: true, state: personalizedState(state, profileId) });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/action', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const type = String(req.body.type || '');
    if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(type)) {
      return res.status(400).json({ error: 'Invalid action', code: 'illegal' });
    }
    const state = await playerAction(req.body.table_id, profileId, {
      type,
      amountCents: req.body.amount_cents,
    });
    return res.json({ ok: true, state: personalizedState(state, profileId) });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

const stateHandler = async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const tableId = req.body?.table_id || req.query.table_id;
    if (!tableId) return res.status(400).json({ error: 'table_id required' });
    const light = req.body?.light === true || req.query?.light === '1';
    const state = await loadState(tableId);
    if (light) {
      return res.json({ ok: true, state: personalizedState(state, profileId) });
    }
    const [chat, spectators] = await Promise.all([
      chatMessages(tableId).catch(() => []),
      listSpectators(tableId).catch(() => []),
    ]);
    void spectate({ tableId, profileId }).catch(() => {});
    return res.json({
      ok: true,
      state: personalizedState(state, profileId, { chat, spectators }),
    });
  } catch (err) {
    return sendPokerError(res, err);
  }
};

router.get('/state', stateHandler);
router.post('/state', stateHandler);

const historyHandler = async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const tableId = req.body?.table_id || req.query.table_id;
    if (!tableId) return res.status(400).json({ error: 'table_id required' });
    const hands = await handHistory(tableId, profileId, Number(req.body?.limit || req.query.limit) || 50);
    return res.json({ ok: true, hands });
  } catch (err) {
    return sendPokerError(res, err);
  }
};

router.get('/history', historyHandler);
router.post('/history', historyHandler);

router.get('/chat', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const messages = await chatMessages(req.query.table_id);
    return res.json({ ok: true, messages });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/chat', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    const messages = await postChat({
      tableId: req.body.table_id,
      profileId,
      text: req.body.text,
    });
    return res.json({ ok: true, messages });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

router.post('/spectate', async (req, res) => {
  try {
    const profileId = await auth(req, res);
    if (!profileId) return;
    await spectate({ tableId: req.body.table_id, profileId });
    const state = await loadState(req.body.table_id);
    const chat = await chatMessages(req.body.table_id).catch(() => []);
    return res.json({ ok: true, state: personalizedState(state, profileId, { chat }) });
  } catch (err) {
    return sendPokerError(res, err);
  }
});

export default router;
