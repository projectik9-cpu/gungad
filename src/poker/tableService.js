import { getSupabaseAdmin } from '../database/supabase.js';
import logger from '../utils/logger.js';
import {
  applyAction,
  canStartHand,
  hydrateTable,
  legalActions,
  prepareNextHand,
  snapshotPayload,
  startHand,
  settleDeltas,
  timeoutAction,
} from './engine/flow.js';
import { formatCard } from './engine/cards.js';

const SAVE_RETRIES = 8;

function sb() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Supabase not configured');
  return client;
}

function rpcError(error) {
  const msg = error?.message || String(error);
  const err = new Error(msg);
  err.code = 'rpc';
  if (/stale_version/i.test(msg)) err.code = 'stale';
  if (/Insufficient balance/i.test(msg)) err.code = 'insufficient';
  if (/Already seated/i.test(msg)) err.code = 'seated';
  if (/Seat taken|Table is full/i.test(msg)) err.code = 'full';
  if (/Cannot leave/i.test(msg)) err.code = 'in_hand';
  if (/Cannot rebuy/i.test(msg)) err.code = 'in_hand';
  if (/Buy-in must|Rebuy would/i.test(msg)) err.code = 'buyin';
  if (/Not seated/i.test(msg)) err.code = 'not_seated';
  if (/Illegal action|Not your turn|No action/i.test(msg)) err.code = 'illegal';
  return err;
}

export async function loadState(tableId) {
  const client = sb();
  const { data: table, error: tErr } = await client
    .from('gg_poker_tables')
    .select('*')
    .eq('id', tableId)
    .maybeSingle();
  if (tErr) throw rpcError(tErr);
  if (!table) {
    const err = new Error('Table not found');
    err.code = 'not_found';
    throw err;
  }
  const { data: seats, error: sErr } = await client
    .from('gg_poker_seats')
    .select('*')
    .eq('table_id', tableId)
    .order('seat_no');
  if (sErr) throw rpcError(sErr);
  const { data: secrets } = await client
    .from('gg_poker_secrets')
    .select('*')
    .eq('table_id', tableId)
    .maybeSingle();
  return hydrateTable(table, seats || [], secrets);
}

async function saveState(state) {
  const snap = snapshotPayload(state);
  const { data, error } = await sb().rpc('gg_poker_save_snapshot', {
    p_table_id: state.id,
    p_expected_version: state.version,
    p_table: snap.table,
    p_seats: snap.seats,
    p_deck: snap.deck,
    p_server_seed: snap.serverSeed,
  });
  if (error) throw rpcError(error);
  state.version = data?.version ?? state.version + 1;
  return state;
}

async function mutate(tableId, fn) {
  let last;
  for (let i = 0; i < SAVE_RETRIES; i += 1) {
    const state = await loadState(tableId);
    const result = await fn(state);
    if (result?.skipSave) return result.state || state;
    try {
      await saveState(state);
      return state;
    } catch (e) {
      last = e;
      if (e.code !== 'stale') throw e;
    }
  }
  throw last || new Error('poker mutate retries exhausted');
}

async function insertHandRecord(state) {
  if (!state.handId) return;
  const { deltas, rake_cents } = settleDeltas(state);
  const client = sb();
  await client.from('gg_poker_hands').upsert({
    id: state.handId,
    table_id: state.id,
    hand_no: state.handNo,
    server_seed_hash: state.serverSeedHash,
    server_seed: state.serverSeed,
    board: state.board,
    pots: state.pots,
    rake_cents,
    actions: state.actions || [],
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  const rows = (state.seats || [])
    .filter((s) => s.profileId && state.handStartStacks?.[String(s.seatNo)] != null)
    .map((s) => {
      const win = (state.winners || []).find((w) => w.seatNo === s.seatNo);
      return {
        hand_id: state.handId,
        profile_id: s.profileId,
        seat_no: s.seatNo,
        hole_cards: s.holeCards,
        invested_cents: s.investedCents || 0,
        net_cents: s.stackCents - state.handStartStacks[String(s.seatNo)],
        showed: !!s.shown,
        hand_rank: win?.handName || null,
        hand_name: win?.handNameRu || win?.handName || null,
      };
    });
  if (rows.length) {
    await client.from('gg_poker_hand_players').upsert(rows, { onConflict: 'hand_id,profile_id' });
  }
  void deltas;
}

async function settleIfNeeded(state) {
  if (state.street !== 'showdown' || state.settled) return state;
  await insertHandRecord(state);
  const { deltas, rake_cents } = settleDeltas(state);
  if (deltas.length) {
    const { error } = await sb().rpc('gg_poker_settle_hand', {
      p_table_id: state.id,
      p_hand_id: state.handId,
      p_deltas: deltas,
      p_rake_cents: rake_cents,
      p_idempotency_key: `poker_hand_${state.handId}`,
    });
    if (error) throw rpcError(error);
  }
  state.settled = true;
  return state;
}

async function cashoutProfile(profileId, tableId) {
  const { data, error } = await sb().rpc('gg_poker_cashout', {
    p_profile_id: profileId,
    p_table_id: tableId,
    p_idempotency_key: `poker_cashout_${profileId}_${tableId}_${Date.now()}`,
  });
  if (error) throw rpcError(error);
  return data;
}

async function afterShowdownPersist(state) {
  await settleIfNeeded(state);
  await saveState(state);
  return state;
}

export async function maybeStartHand(tableId) {
  return mutate(tableId, async (state) => {
    if (state.street === 'showdown') {
      await settleIfNeeded(state);
      const due = state.nextHandAt && new Date(state.nextHandAt).getTime() <= Date.now();
      if (!due) return { skipSave: false };
      const { leaves } = prepareNextHand(state);
      const kicked = [];
      for (const pid of leaves) {
        try {
          await cashoutProfile(pid, state.id);
          kicked.push(pid);
        } catch (e) {
          logger.warn('[poker] kick cashout failed %s', e.message);
        }
      }
      state.seats = state.seats.filter((s) => s.profileId && !kicked.includes(s.profileId));
      if (canStartHand(state)) startHand(state);
      return {};
    }
    if (canStartHand(state) && (!state.nextHandAt || new Date(state.nextHandAt).getTime() <= Date.now())) {
      startHand(state);
    }
    return {};
  });
}

export async function playerAction(tableId, profileId, action) {
  const state = await mutate(tableId, async (st) => {
    const seat = st.seats.find((s) => s.profileId === profileId);
    if (!seat) {
      const err = new Error('Not seated at this table');
      err.code = 'not_seated';
      throw err;
    }
    if (st.actorSeat !== seat.seatNo) {
      const err = new Error('Not your turn');
      err.code = 'illegal';
      throw err;
    }
    applyAction(st, { ...action, seatNo: seat.seatNo });
    return {};
  });
  if (state.street === 'showdown' && !state.settled) {
    try {
      await afterShowdownPersist(state);
    } catch (e) {
      logger.warn('[poker] settle after action: %s', e.message);
    }
  }
  return loadState(tableId);
}

export async function playerTimeout(tableId) {
  const state = await mutate(tableId, async (st) => {
    if (!st.actorSeat || !st.actionDeadlineAt) return { skipSave: true, state: st };
    if (new Date(st.actionDeadlineAt).getTime() > Date.now() + 50) return { skipSave: true, state: st };
    timeoutAction(st);
    return {};
  });
  if (state.street === 'showdown' && !state.settled) {
    try {
      await afterShowdownPersist(state);
    } catch (e) {
      logger.warn('[poker] settle after timeout: %s', e.message);
    }
  }
  return state;
}

export async function buyin({ profileId, tableId, seatNo, amountCents, username, firstName }) {
  const { data, error } = await sb().rpc('gg_poker_buyin', {
    p_profile_id: profileId,
    p_table_id: tableId,
    p_seat_no: seatNo ?? null,
    p_amount_cents: amountCents,
    p_idempotency_key: `poker_buyin_${profileId}_${tableId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  if (error) throw rpcError(error);
  if (username || firstName) {
    await sb().from('gg_poker_seats').update({
      username: username || undefined,
      first_name: firstName || undefined,
    }).eq('table_id', tableId).eq('profile_id', profileId);
  }
  try {
    await maybeStartHand(tableId);
  } catch (e) {
    logger.warn('[poker] start after buyin: %s', e.message);
  }
  return data;
}

export async function rebuy({ profileId, tableId, amountCents }) {
  const { data, error } = await sb().rpc('gg_poker_rebuy', {
    p_profile_id: profileId,
    p_table_id: tableId,
    p_amount_cents: amountCents,
    p_idempotency_key: `poker_rebuy_${profileId}_${tableId}_${amountCents}_${Math.floor(Date.now() / 2000)}`,
  });
  if (error) throw rpcError(error);
  return data;
}

export async function leaveTable({ profileId, tableId }) {
  const state = await loadState(tableId);
  const seat = state.seats.find((s) => s.profileId === profileId);
  if (!seat) {
    const err = new Error('Not seated at this table');
    err.code = 'not_seated';
    throw err;
  }
  const inPot = state.status === 'in_hand'
    && state.street !== 'idle'
    && state.street !== 'showdown'
    && !seat.folded
    && !seat.sittingOut;
  if (inPot) {
    await mutate(tableId, async (st) => {
      const s = st.seats.find((x) => x.profileId === profileId);
      if (s) s.pendingLeave = true;
      return {};
    });
    const err = new Error('Leave queued until the hand ends');
    err.code = 'leave_queued';
    throw err;
  }
  const data = await cashoutProfile(profileId, tableId);
  try {
    await mutate(tableId, async (st) => {
      st.seats = st.seats.filter((s) => s.profileId !== profileId);
      if (st.status === 'in_hand' && st.street !== 'showdown') {
        const live = st.seats.filter((s) => !s.folded && !s.sittingOut && s.holeCards);
        if (live.length <= 1 && st.actorSeat) {
          // engine will award on next timeout/action; force uncontested via fold remaining? skip
        }
      }
      return {};
    });
  } catch {
    /* seat already removed by RPC */
  }
  return data;
}

export async function sitOut({ profileId, tableId, sittingOut }) {
  return mutate(tableId, async (st) => {
    const s = st.seats.find((x) => x.profileId === profileId);
    if (!s) {
      const err = new Error('Not seated at this table');
      err.code = 'not_seated';
      throw err;
    }
    if (sittingOut && st.status === 'in_hand' && !s.folded && st.street !== 'showdown') {
      s.pendingLeave = false;
      s.sittingOut = false;
      const err = new Error('Sit out after this hand');
      err.code = 'in_hand';
      throw err;
    }
    s.sittingOut = !!sittingOut;
    return {};
  });
}

export async function listLobby() {
  const client = sb();
  const { data: tables, error } = await client
    .from('gg_poker_tables')
    .select('*')
    .neq('status', 'closed')
    .order('bb_cents')
    .order('created_at');
  if (error) throw rpcError(error);
  const { data: seats } = await client.from('gg_poker_seats').select('table_id, stack_cents, profile_id');
  const byTable = new Map();
  for (const s of seats || []) {
    if (!byTable.has(s.table_id)) byTable.set(s.table_id, []);
    byTable.get(s.table_id).push(s);
  }
  const { data: stakes } = await client.from('gg_poker_stakes').select('*').order('sort_order');
  return {
    stakes: stakes || [],
    tables: (tables || []).map((t) => {
      const occ = byTable.get(t.id) || [];
      const stacks = occ.map((s) => Number(s.stack_cents) || 0);
      const avg = stacks.length ? Math.round(stacks.reduce((a, b) => a + b, 0) / stacks.length) : 0;
      return {
        id: t.id,
        code: t.code,
        stakeId: t.stake_id,
        sbCents: t.sb_cents,
        bbCents: t.bb_cents,
        anteCents: t.ante_cents,
        minBuyinCents: t.min_buyin_cents,
        maxBuyinCents: t.max_buyin_cents,
        maxSeats: t.max_seats,
        occupied: occ.length,
        status: t.status,
        street: t.street,
        avgStackCents: avg,
        actionTimeoutSec: t.action_timeout_sec,
        rakeBps: t.rake_bps,
      };
    }),
  };
}

export async function createTable({ profileId, stakeId, maxSeats, sbCents, bbCents, anteCents, timeoutSec }) {
  const client = sb();
  let stake = null;
  if (stakeId) {
    const { data } = await client.from('gg_poker_stakes').select('*').eq('id', stakeId).maybeSingle();
    stake = data;
  }
  const sbAmt = Number(sbCents || stake?.sb_cents);
  const bbAmt = Number(bbCents || stake?.bb_cents);
  if (!sbAmt || !bbAmt || bbAmt < sbAmt) {
    const err = new Error('Invalid blinds');
    err.code = 'buyin';
    throw err;
  }
  const seats = maxSeats === 9 || maxSeats === 6 ? maxSeats : (stake?.max_seats || 6);
  const minBuy = stake?.min_buyin_cents || bbAmt * 20;
  const maxBuy = stake?.max_buyin_cents || bbAmt * 200;
  const rakeBps = stake?.rake_bps ?? 500;
  const rakeCap = Math.round(Number(stake?.rake_cap_bb || 3) * bbAmt);
  const timeout = [15, 20, 30].includes(timeoutSec) ? timeoutSec : (stake?.action_timeout_sec || 20);
  const code = Math.random().toString(36).slice(2, 8);
  const { data, error } = await client.from('gg_poker_tables').insert({
    code,
    created_by: profileId,
    stake_id: stakeId || null,
    sb_cents: sbAmt,
    bb_cents: bbAmt,
    ante_cents: Number(anteCents || stake?.ante_cents || 0),
    min_buyin_cents: minBuy,
    max_buyin_cents: maxBuy,
    max_seats: seats,
    rake_bps: rakeBps,
    rake_cap_cents: rakeCap,
    action_timeout_sec: timeout,
    status: 'waiting',
  }).select('*').single();
  if (error) throw rpcError(error);
  return data;
}

export async function handHistory(tableId, profileId, limit = 50) {
  const client = sb();
  const { data: hands, error } = await client
    .from('gg_poker_hands')
    .select('*')
    .eq('table_id', tableId)
    .not('ended_at', 'is', null)
    .order('hand_no', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));
  if (error) throw rpcError(error);
  const ids = (hands || []).map((h) => h.id);
  let players = [];
  if (ids.length) {
    const { data } = await client
      .from('gg_poker_hand_players')
      .select('*')
      .in('hand_id', ids);
    players = data || [];
  }
  const byHand = new Map();
  for (const p of players) {
    if (!byHand.has(p.hand_id)) byHand.set(p.hand_id, []);
    byHand.get(p.hand_id).push(p);
  }
  return (hands || []).map((h) => {
    const hp = byHand.get(h.id) || [];
    const mine = hp.find((p) => p.profile_id === profileId);
    return {
      id: h.id,
      handNo: h.hand_no,
      board: h.board,
      pots: h.pots,
      rakeCents: h.rake_cents,
      actions: h.actions,
      endedAt: h.ended_at,
      serverSeedHash: h.server_seed_hash,
      serverSeed: h.server_seed,
      you: mine
        ? {
            holeCards: mine.hole_cards,
            investedCents: mine.invested_cents,
            netCents: mine.net_cents,
            handName: mine.hand_name,
            showed: mine.showed,
          }
        : null,
      players: hp.map((p) => ({
        profileId: p.profile_id,
        seatNo: p.seat_no,
        investedCents: p.invested_cents,
        netCents: p.net_cents,
        showed: p.showed,
        holeCards: p.showed || p.profile_id === profileId ? p.hole_cards : null,
        handName: p.hand_name,
      })),
    };
  });
}

export async function chatMessages(tableId, limit = 40) {
  const { data, error } = await sb()
    .from('gg_poker_chat')
    .select('id, profile_id, text, created_at')
    .eq('table_id', tableId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw rpcError(error);
  const rows = (data || []).reverse();
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  let names = {};
  if (ids.length) {
    const { data: profiles } = await sb()
      .from('gg_profiles')
      .select('id, username, first_name')
      .in('id', ids);
    for (const p of profiles || []) {
      names[p.id] = p.username ? `@${p.username}` : (p.first_name || 'Player');
    }
  }
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    name: names[r.profile_id] || 'Player',
    text: r.text,
    createdAt: r.created_at,
  }));
}

const lastChatAt = new Map();

export async function postChat({ tableId, profileId, text }) {
  const clean = String(text || '').trim().slice(0, 200);
  if (!clean) {
    const err = new Error('Empty message');
    err.code = 'illegal';
    throw err;
  }
  const key = `${tableId}:${profileId}`;
  const now = Date.now();
  if ((lastChatAt.get(key) || 0) + 1000 > now) {
    const err = new Error('Slow down');
    err.code = 'rate';
    throw err;
  }
  lastChatAt.set(key, now);
  const { error } = await sb().from('gg_poker_chat').insert({
    table_id: tableId,
    profile_id: profileId,
    text: clean,
  });
  if (error) throw rpcError(error);
  return chatMessages(tableId);
}

export async function spectate({ tableId, profileId }) {
  const { error } = await sb().from('gg_poker_spectators').upsert({
    table_id: tableId,
    profile_id: profileId,
    last_seen_at: new Date().toISOString(),
  });
  if (error) throw rpcError(error);
  return { ok: true };
}

export async function listSpectators(tableId) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data } = await sb()
    .from('gg_poker_spectators')
    .select('profile_id, last_seen_at')
    .eq('table_id', tableId)
    .gte('last_seen_at', since);
  return data || [];
}

export function personalizedState(state, profileId, extras = {}) {
  const mine = state.seats.find((s) => s.profileId === profileId) || null;
  const showdown = state.street === 'showdown';
  return {
    table: {
      id: state.id,
      code: state.code,
      version: state.version,
      status: state.status,
      street: state.street,
      handNo: state.handNo,
      dealerSeat: state.dealerSeat,
      sbSeat: state.sbSeat,
      bbSeat: state.bbSeat,
      actorSeat: state.actorSeat,
      actionDeadlineAt: state.actionDeadlineAt,
      nextHandAt: state.nextHandAt,
      board: state.board,
      pots: state.pots,
      sbCents: state.sbCents,
      bbCents: state.bbCents,
      anteCents: state.anteCents,
      maxSeats: state.maxSeats,
      rakeBps: state.rakeBps,
      rakeCapCents: state.rakeCapCents,
      actionTimeoutSec: state.actionTimeoutSec,
      minBuyinCents: state.minBuyinCents,
      maxBuyinCents: state.maxBuyinCents,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      serverSeedHash: state.serverSeedHash,
      serverSeed: showdown ? state.serverSeed : null,
      winners: state.winners,
      potTotal: (state.pots || []).reduce((s, p) => s + (p.amount || 0), 0),
    },
    seats: state.seats.map((s) => {
      const reveal = showdown && s.shown || s.profileId === profileId;
      return {
        seatNo: s.seatNo,
        profileId: s.profileId,
        username: s.username,
        firstName: s.firstName,
        stackCents: s.stackCents,
        betThisStreet: s.betThisStreet,
        folded: s.folded,
        allIn: s.allIn,
        sittingOut: s.sittingOut,
        pendingLeave: s.pendingLeave,
        shown: s.shown,
        holeCards: reveal ? s.holeCards : (s.holeCards?.length ? ['back', 'back'] : null),
        isActor: state.actorSeat === s.seatNo,
      };
    }),
    you: {
      seated: !!mine,
      seatNo: mine?.seatNo || null,
      holeCards: mine?.holeCards || null,
      legal: mine && state.actorSeat === mine.seatNo ? legalActions(state, mine) : [],
    },
    chat: extras.chat || [],
    spectators: extras.spectators || [],
  };
}

export function cardLabel(code) {
  if (!code || code === 'back') return null;
  try {
    return formatCard(code);
  } catch {
    return code;
  }
}

export async function processDueTables() {
  const client = sb();
  const now = new Date().toISOString();
  const { data: dueActors } = await client
    .from('gg_poker_tables')
    .select('id')
    .eq('status', 'in_hand')
    .not('action_deadline_at', 'is', null)
    .lte('action_deadline_at', now)
    .limit(25);
  for (const t of dueActors || []) {
    try {
      await playerTimeout(t.id);
    } catch (e) {
      logger.warn('[poker] timeout table %s: %s', t.id, e.message);
    }
  }
  const { data: dueHands } = await client
    .from('gg_poker_tables')
    .select('id')
    .in('status', ['waiting', 'in_hand'])
    .not('next_hand_at', 'is', null)
    .lte('next_hand_at', now)
    .limit(25);
  for (const t of dueHands || []) {
    try {
      await maybeStartHand(t.id);
    } catch (e) {
      logger.warn('[poker] next hand table %s: %s', t.id, e.message);
    }
  }
}
