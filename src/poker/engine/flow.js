import { randomUUID } from 'crypto';
import { draw, newServerSeed, seedHash, shuffledDeck } from './cards.js';
import { compareRanks, describeHand, evalSeven } from './eval.js';
import { applyRake, buildPots, splitPot, totalPot } from './pots.js';
import { isLegal, legalActions, minBetTo, toCall } from './legal.js';

export const NEXT_HAND_MS = 4000;
export const SHOWDOWN_MS = 3500;
export const EMPTY_STACK_KICK_HANDS = 3;

function occupied(seats) {
  return seats.filter((s) => s.profileId);
}

function livePlayers(seats) {
  return occupied(seats).filter((s) => !s.sittingOut && s.stackCents > 0);
}

function inHand(seats) {
  return occupied(seats).filter((s) => !s.sittingOut && !s.folded && (s.holeCards?.length || s.allIn || s.stackCents >= 0) && s.holeCards);
}

function contenders(seats) {
  return occupied(seats).filter((s) => !s.folded && !s.sittingOut && s.holeCards?.length);
}

function nextSeatFrom(seats, fromSeat, pred) {
  const max = Math.max(...seats.map((s) => s.seatNo), 0);
  if (!max) return null;
  for (let i = 1; i <= max; i += 1) {
    const no = ((fromSeat - 1 + i) % max) + 1;
    const s = seats.find((x) => x.seatNo === no);
    if (s && pred(s)) return no;
  }
  return null;
}

function seatByNo(seats, no) {
  return seats.find((s) => s.seatNo === no) || null;
}

function resetStreetBets(seats) {
  for (const s of seats) {
    s.betThisStreet = 0;
    s.acted = false;
  }
}

function postingAmount(seat, want) {
  return Math.min(seat.stackCents, want);
}

function postBlind(seat, amount) {
  const pay = postingAmount(seat, amount);
  seat.stackCents -= pay;
  seat.betThisStreet += pay;
  seat.investedCents += pay;
  if (seat.stackCents === 0) seat.allIn = true;
  return pay;
}

export function cloneState(state) {
  return structuredClone(state);
}

export function serializeSeat(s) {
  return {
    seat_no: s.seatNo,
    profile_id: s.profileId,
    stack_cents: s.stackCents,
    bet_this_street: s.betThisStreet || 0,
    invested_cents: s.investedCents || 0,
    folded: !!s.folded,
    all_in: !!s.allIn,
    sitting_out: !!s.sittingOut,
    pending_leave: !!s.pendingLeave,
    pending_rebuy_cents: s.pendingRebuyCents || 0,
    hole_cards: s.holeCards || null,
    shown: !!s.shown,
    empty_stack_hands: s.emptyStackHands || 0,
    username: s.username || null,
    first_name: s.firstName || null,
  };
}

export function deserializeSeat(row) {
  return {
    seatNo: row.seat_no,
    profileId: row.profile_id,
    stackCents: Number(row.stack_cents) || 0,
    betThisStreet: Number(row.bet_this_street) || 0,
    investedCents: Number(row.invested_cents) || 0,
    folded: !!row.folded,
    allIn: !!row.all_in,
    sittingOut: !!row.sitting_out,
    pendingLeave: !!row.pending_leave,
    pendingRebuyCents: Number(row.pending_rebuy_cents) || 0,
    holeCards: row.hole_cards || null,
    shown: !!row.shown,
    emptyStackHands: row.empty_stack_hands || 0,
    username: row.username || null,
    firstName: row.first_name || null,
    acted: false,
  };
}

function engineFrom(row) {
  return row.engine && typeof row.engine === 'object' ? { ...row.engine } : {};
}

export function hydrateTable(tableRow, seatRows, secretsRow) {
  const seats = (seatRows || []).map(deserializeSeat);
  const engine = engineFrom(tableRow);
  for (const s of seats) {
    if (engine.acted && engine.acted[String(s.seatNo)]) s.acted = true;
  }
  return {
    id: tableRow.id,
    code: tableRow.code,
    version: tableRow.version,
    status: tableRow.status,
    street: tableRow.street,
    handNo: tableRow.hand_no,
    dealerSeat: tableRow.dealer_seat,
    sbSeat: tableRow.sb_seat,
    bbSeat: tableRow.bb_seat,
    actorSeat: tableRow.actor_seat,
    actionDeadlineAt: tableRow.action_deadline_at,
    nextHandAt: tableRow.next_hand_at,
    board: tableRow.board || [],
    pots: tableRow.pots || [],
    sbCents: Number(tableRow.sb_cents),
    bbCents: Number(tableRow.bb_cents),
    anteCents: Number(tableRow.ante_cents) || 0,
    maxSeats: tableRow.max_seats,
    rakeBps: tableRow.rake_bps,
    rakeCapCents: Number(tableRow.rake_cap_cents) || 0,
    actionTimeoutSec: tableRow.action_timeout_sec || 20,
    minBuyinCents: Number(tableRow.min_buyin_cents),
    maxBuyinCents: Number(tableRow.max_buyin_cents),
    stakeId: tableRow.stake_id,
    currentBet: engine.currentBet || 0,
    minRaise: engine.minRaise || Number(tableRow.bb_cents),
    lastAggressorSeat: engine.lastAggressorSeat ?? null,
    handStartStacks: engine.handStartStacks || {},
    settled: !!engine.settled,
    serverSeedHash: engine.serverSeedHash || null,
    handId: engine.handId || null,
    actions: engine.actions || [],
    winners: engine.winners || null,
    flopSeen: !!engine.flopSeen,
    rakeCents: engine.rakeCents || 0,
    seats,
    deck: secretsRow?.deck ? [...secretsRow.deck] : [],
    serverSeed: secretsRow?.server_seed || null,
  };
}

export function snapshotPayload(state) {
  const acted = {};
  for (const s of state.seats) {
    if (s.acted) acted[String(s.seatNo)] = true;
  }
  return {
    table: {
      status: state.status,
      street: state.street,
      hand_no: state.handNo,
      dealer_seat: state.dealerSeat,
      sb_seat: state.sbSeat,
      bb_seat: state.bbSeat,
      actor_seat: state.actorSeat,
      action_deadline_at: state.actionDeadlineAt,
      next_hand_at: state.nextHandAt,
      board: state.board,
      pots: state.pots,
      engine: {
        currentBet: state.currentBet,
        minRaise: state.minRaise,
        lastAggressorSeat: state.lastAggressorSeat,
        handStartStacks: state.handStartStacks,
        settled: state.settled,
        serverSeedHash: state.serverSeedHash,
        handId: state.handId,
        actions: state.actions,
        winners: state.winners,
        flopSeen: state.flopSeen,
        rakeCents: state.rakeCents || 0,
        acted,
      },
    },
    seats: state.seats.map(serializeSeat),
    deck: state.deck || [],
    serverSeed: state.serverSeed,
  };
}

function refreshPots(state) {
  state.pots = buildPots(
    occupied(state.seats).map((s) => ({
      seatNo: s.seatNo,
      invested: s.investedCents || 0,
      folded: s.folded,
    })),
  );
}

function firstToActPostflop(state) {
  return nextSeatFrom(state.seats, state.dealerSeat, (s) => !s.folded && !s.allIn && !s.sittingOut && s.holeCards);
}

function firstToActPreflop(state) {
  const live = livePlayers(state.seats);
  if (live.length === 2) {
    return state.dealerSeat; // HU: dealer/SB acts first preflop
  }
  return nextSeatFrom(state.seats, state.bbSeat, (s) => !s.folded && !s.allIn && !s.sittingOut && s.holeCards);
}

function bettingRoundDone(state) {
  const live = contenders(state.seats);
  if (live.length <= 1) return 'uncontested';
  const canAct = live.filter((s) => !s.allIn);
  if (canAct.length === 0) return 'runout';
  if (canAct.length === 1 && canAct[0].betThisStreet >= state.currentBet && canAct[0].acted) {
    const othersAllIn = live.every((s) => s.seatNo === canAct[0].seatNo || s.allIn);
    if (othersAllIn) return 'runout';
  }
  const unmatched = canAct.some((s) => !s.acted || s.betThisStreet < state.currentBet);
  if (unmatched) return 'continue';
  if (canAct.length === 1) return 'runout';
  return 'next';
}

function nextActor(state) {
  if (!state.actorSeat) return null;
  return nextSeatFrom(
    state.seats,
    state.actorSeat,
    (s) => !s.folded && !s.allIn && !s.sittingOut && s.holeCards,
  );
}

function setActor(state, seatNo) {
  state.actorSeat = seatNo;
  if (seatNo) {
    const ms = (state.actionTimeoutSec || 20) * 1000;
    state.actionDeadlineAt = new Date(Date.now() + ms).toISOString();
  } else {
    state.actionDeadlineAt = null;
  }
}

function dealBoard(state, n) {
  draw(state.deck, 1); // burn
  const cards = draw(state.deck, n);
  state.board = [...state.board, ...cards];
}

function advanceStreet(state) {
  if (state.street === 'preflop') {
    state.street = 'flop';
    state.flopSeen = true;
    dealBoard(state, 3);
  } else if (state.street === 'flop') {
    state.street = 'turn';
    dealBoard(state, 1);
  } else if (state.street === 'turn') {
    state.street = 'river';
    dealBoard(state, 1);
  } else if (state.street === 'river') {
    finishShowdown(state);
    return;
  } else {
    return;
  }
  resetStreetBets(state.seats);
  state.currentBet = 0;
  state.minRaise = state.bbCents;
  state.lastAggressorSeat = null;
  refreshPots(state);
  const actor = firstToActPostflop(state);
  const status = bettingRoundDone(state);
  if (status === 'runout' || status === 'uncontested') {
    runOutAndFinish(state);
    return;
  }
  setActor(state, actor);
}

function runOutAndFinish(state) {
  while (state.board.length < 5 && state.street !== 'showdown') {
    if (state.board.length === 0) {
      state.street = 'flop';
      state.flopSeen = true;
      dealBoard(state, 3);
    } else if (state.board.length === 3) {
      state.street = 'turn';
      dealBoard(state, 1);
    } else if (state.board.length === 4) {
      state.street = 'river';
      dealBoard(state, 1);
    } else break;
  }
  finishShowdown(state);
}

function awardUncontested(state) {
  const winner = contenders(state.seats)[0];
  const pots = buildPots(
    occupied(state.seats).map((s) => ({
      seatNo: s.seatNo,
      invested: s.investedCents || 0,
      folded: s.folded,
    })),
  );
  const rakeBps = state.flopSeen ? state.rakeBps : 0;
  const { pots: raked, rake } = applyRake(pots, rakeBps, state.rakeCapCents);
  const total = totalPot(raked);
  if (winner) winner.stackCents += total;
  state.pots = raked;
  state.rakeCents = rake;
  state.street = 'showdown';
  state.status = 'in_hand';
  state.actorSeat = null;
  state.actionDeadlineAt = null;
  state.winners = winner
    ? [{ seatNo: winner.seatNo, amount: total, handName: null }]
    : [];
  state.nextHandAt = new Date(Date.now() + SHOWDOWN_MS).toISOString();
  if (winner) winner.shown = false;
}

function finishShowdown(state) {
  const live = contenders(state.seats);
  if (live.length <= 1) {
    awardUncontested(state);
    return;
  }
  const pots = buildPots(
    occupied(state.seats).map((s) => ({
      seatNo: s.seatNo,
      invested: s.investedCents || 0,
      folded: s.folded,
    })),
  );
  const { pots: raked, rake } = applyRake(pots, state.rakeBps, state.rakeCapCents);
  const evals = new Map();
  for (const s of live) {
    const cards = [...(s.holeCards || []), ...state.board];
    const ev = evalSeven(cards);
    evals.set(s.seatNo, {
      rank: ev.rank,
      handName: describeHand(ev.rank, 'en'),
      handNameRu: describeHand(ev.rank, 'ru'),
    });
    s.shown = true;
  }

  const awards = {};
  const winnerNotes = [];
  for (const pot of raked) {
    const eligible = pot.eligibleSeats.filter((n) => evals.has(n));
    if (!eligible.length) continue;
    let best = null;
    const winners = [];
    for (const n of eligible) {
      const r = evals.get(n).rank;
      if (!best || compareRanks(r, best) > 0) {
        best = r;
        winners.length = 0;
        winners.push(n);
      } else if (compareRanks(r, best) === 0) {
        winners.push(n);
      }
    }
    const split = splitPot(pot.amount, winners, state.dealerSeat || 1, state.maxSeats);
    for (const [seat, amt] of Object.entries(split)) {
      const no = Number(seat);
      awards[no] = (awards[no] || 0) + amt;
    }
    winnerNotes.push({ eligible, winners, amount: pot.amount });
  }

  for (const s of state.seats) {
    if (awards[s.seatNo]) s.stackCents += awards[s.seatNo];
  }

  state.pots = raked;
  state.rakeCents = rake;
  state.street = 'showdown';
  state.actorSeat = null;
  state.actionDeadlineAt = null;
  state.winners = live.map((s) => ({
    seatNo: s.seatNo,
    amount: awards[s.seatNo] || 0,
    handName: evals.get(s.seatNo)?.handName || null,
    handNameRu: evals.get(s.seatNo)?.handNameRu || null,
    holeCards: s.holeCards,
  }));
  state.nextHandAt = new Date(Date.now() + SHOWDOWN_MS).toISOString();
}

export function canStartHand(state) {
  return livePlayers(state.seats).length >= 2 && (state.street === 'idle' || state.status === 'waiting');
}

export function startHand(state) {
  const live = livePlayers(state.seats);
  if (live.length < 2) return state;

  for (const s of state.seats) {
    s.folded = false;
    s.allIn = false;
    s.betThisStreet = 0;
    s.investedCents = 0;
    s.holeCards = null;
    s.shown = false;
    s.acted = false;
  }

  const max = state.maxSeats;
  const prevDealer = state.dealerSeat || live[0].seatNo;
  const dealer = nextSeatFrom(state.seats, prevDealer, (s) => !s.sittingOut && s.stackCents > 0);
  state.dealerSeat = dealer;
  const hu = live.length === 2;
  if (hu) {
    state.sbSeat = dealer;
    state.bbSeat = nextSeatFrom(state.seats, dealer, (s) => !s.sittingOut && s.stackCents > 0);
  } else {
    state.sbSeat = nextSeatFrom(state.seats, dealer, (s) => !s.sittingOut && s.stackCents > 0);
    state.bbSeat = nextSeatFrom(state.seats, state.sbSeat, (s) => !s.sittingOut && s.stackCents > 0);
  }

  const seed = newServerSeed();
  state.serverSeed = seed;
  state.serverSeedHash = seedHash(seed);
  state.deck = shuffledDeck(seed);
  state.board = [];
  state.pots = [];
  state.handNo = (state.handNo || 0) + 1;
  state.handId = randomUUID();
  state.settled = false;
  state.winners = null;
  state.actions = [];
  state.flopSeen = false;
  state.rakeCents = 0;
  state.status = 'in_hand';
  state.street = 'preflop';
  state.nextHandAt = null;
  state.handStartStacks = {};
  for (const s of occupied(state.seats)) {
    state.handStartStacks[String(s.seatNo)] = s.stackCents;
  }

  if (state.anteCents > 0) {
    for (const s of livePlayers(state.seats)) {
      postBlind(s, state.anteCents);
    }
  }
  const sb = seatByNo(state.seats, state.sbSeat);
  const bb = seatByNo(state.seats, state.bbSeat);
  if (sb) postBlind(sb, state.sbCents);
  if (bb) postBlind(bb, state.bbCents);

  for (const s of livePlayers(state.seats)) {
    s.holeCards = draw(state.deck, 2);
  }

  state.currentBet = state.bbCents;
  state.minRaise = state.bbCents;
  state.lastAggressorSeat = state.bbSeat;
  refreshPots(state);

  const actor = firstToActPreflop(state);
  setActor(state, actor);
  return state;
}

function putChips(seat, addThisStreet) {
  const pay = Math.min(seat.stackCents, addThisStreet);
  seat.stackCents -= pay;
  seat.betThisStreet += pay;
  seat.investedCents += pay;
  if (seat.stackCents === 0) seat.allIn = true;
  return pay;
}

function reopen(state, actor, raiseBy, isFullRaise) {
  state.currentBet = actor.betThisStreet;
  if (isFullRaise && raiseBy > 0) {
    state.minRaise = raiseBy;
    state.lastAggressorSeat = actor.seatNo;
    for (const s of state.seats) {
      if (s.seatNo !== actor.seatNo && !s.folded && !s.allIn) s.acted = false;
    }
  }
}

export function applyAction(state, action, { timeout = false } = {}) {
  if (state.street === 'showdown' || state.street === 'idle') {
    throw new Error('No action now');
  }
  const actor = seatByNo(state.seats, state.actorSeat);
  if (!actor) throw new Error('No actor');
  if (action.seatNo && action.seatNo !== actor.seatNo) throw new Error('Not your turn');

  let act = { ...action };
  if (timeout) {
    const call = toCall(state, actor);
    act = call > 0 ? { type: 'fold' } : { type: 'check' };
  }

  if (act.type === 'allin') {
    const to = actor.betThisStreet + actor.stackCents;
    act = { type: state.currentBet > 0 && toCall(state, actor) > 0 ? (to > state.currentBet ? 'raise' : 'call') : 'bet', amountCents: to, allin: true };
  }

  if (!timeout && !act.allin && !isLegal(state, actor, act) && act.type !== 'fold') {
    // fold is always allowed if facing a bet; check legal list
    if (!(act.type === 'fold' && toCall(state, actor) > 0)) {
      throw new Error('Illegal action');
    }
  }

  if (act.type === 'fold') {
    actor.folded = true;
    actor.acted = true;
    actor.holeCards = actor.holeCards; // keep for HH but hide
  } else if (act.type === 'check') {
    if (toCall(state, actor) > 0) throw new Error('Cannot check');
    actor.acted = true;
  } else if (act.type === 'call') {
    const need = toCall(state, actor);
    putChips(actor, need);
    actor.acted = true;
  } else if (act.type === 'bet' || act.type === 'raise') {
    const target = Number(act.amountCents);
    const add = target - actor.betThisStreet;
    if (add <= 0 && !act.allin) throw new Error('Invalid raise');
    putChips(actor, add);
    const raiseBy = actor.betThisStreet - state.currentBet;
    const minTo = minBetTo(state);
    const isFull = actor.allIn ? raiseBy >= (state.minRaise || state.bbCents) : actor.betThisStreet >= minTo || actor.allIn;
    reopen(state, actor, raiseBy, actor.allIn ? raiseBy >= (state.minRaise || 0) : true);
    if (!actor.allIn && actor.betThisStreet < minTo && act.type === 'raise') {
      // short bet shouldn't happen if legal(); ignore
    }
    void isFull;
    actor.acted = true;
  } else {
    throw new Error(`Unknown action ${act.type}`);
  }

  state.actions.push({
    seatNo: actor.seatNo,
    type: timeout ? `timeout_${act.type}` : act.type,
    amountCents: actor.betThisStreet,
    at: new Date().toISOString(),
  });

  refreshPots(state);

  const round = bettingRoundDone(state);
  if (round === 'uncontested') {
    awardUncontested(state);
    return state;
  }
  if (round === 'runout') {
    runOutAndFinish(state);
    return state;
  }
  if (round === 'next') {
    if (state.street === 'river') finishShowdown(state);
    else advanceStreet(state);
    return state;
  }

  const nxt = nextActor(state);
  setActor(state, nxt);
  return state;
}

export function timeoutAction(state) {
  return applyAction(state, { type: 'timeout' }, { timeout: true });
}

export function settleDeltas(state) {
  const deltas = [];
  for (const s of occupied(state.seats)) {
    const start = state.handStartStacks?.[String(s.seatNo)];
    if (start == null) continue;
    deltas.push({
      profile_id: s.profileId,
      net_cents: s.stackCents - start,
      invested_cents: s.investedCents || 0,
      seat_no: s.seatNo,
    });
  }
  return { deltas, rake_cents: state.rakeCents || 0 };
}

export function prepareNextHand(state) {
  const leaves = [];
  for (const s of occupied(state.seats)) {
    if (s.stackCents <= 0) {
      s.emptyStackHands = (s.emptyStackHands || 0) + 1;
      s.sittingOut = true;
    } else {
      s.emptyStackHands = 0;
    }
    s.holeCards = null;
    s.folded = false;
    s.allIn = false;
    s.betThisStreet = 0;
    s.investedCents = 0;
    s.shown = false;
    s.acted = false;
    if (s.pendingLeave || (s.stackCents <= 0 && s.emptyStackHands >= EMPTY_STACK_KICK_HANDS)) {
      leaves.push(s.profileId);
    }
  }
  state.street = 'idle';
  state.status = 'waiting';
  state.board = [];
  state.pots = [];
  state.actorSeat = null;
  state.actionDeadlineAt = null;
  state.settled = true;
  state.serverSeed = null;
  state.deck = [];
  state.winners = null;
  const still = livePlayers(state.seats).filter((s) => !leaves.includes(s.profileId));
  state.nextHandAt = still.length >= 2 ? new Date(Date.now() + NEXT_HAND_MS).toISOString() : null;
  return { leaves, canStart: still.length >= 2 };
}

export { legalActions, toCall, minBetTo };
