import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evalFive, evalSeven, compareRanks, CAT } from './eval.js';
import { buildPots, applyRake, splitPot } from './pots.js';
import { shuffledDeck, seedHash, parseCard } from './cards.js';
import {
  applyAction,
  startHand,
  timeoutAction,
  settleDeltas,
  hydrateTable,
} from './flow.js';

describe('eval', () => {
  it('ranks a wheel straight below 6-high', () => {
    const wheel = evalFive(['As', '2h', '3d', '4c', '5s']);
    const six = evalFive(['2h', '3d', '4c', '5s', '6h']);
    assert.equal(wheel[0], CAT.STRAIGHT);
    assert.equal(wheel[1], 3);
    assert.ok(compareRanks(six, wheel) > 0);
  });

  it('ranks quads over full house', () => {
    const quads = evalFive(['Ah', 'As', 'Ad', 'Ac', 'Kh']);
    const boat = evalFive(['Ah', 'As', 'Ad', 'Kh', 'Ks']);
    assert.equal(quads[0], CAT.QUADS);
    assert.equal(boat[0], CAT.FULL_HOUSE);
    assert.ok(compareRanks(quads, boat) > 0);
  });

  it('uses flush kickers', () => {
    const a = evalFive(['Ah', 'Kh', '9h', '4h', '2h']);
    const b = evalFive(['Ah', 'Qh', '9h', '4h', '2h']);
    assert.equal(a[0], CAT.FLUSH);
    assert.ok(compareRanks(a, b) > 0);
  });

  it('picks best 5 of 7', () => {
    const r = evalSeven(['Ah', 'Ad', 'Kh', 'Kd', '2c', '3s', '4h']);
    assert.equal(r.rank[0], CAT.TWO_PAIR);
  });
});

describe('pots', () => {
  it('builds side pots for stacked all-ins', () => {
    const pots = buildPots([
      { seatNo: 1, invested: 50, folded: false },
      { seatNo: 2, invested: 100, folded: false },
      { seatNo: 3, invested: 300, folded: false },
    ]);
    assert.equal(pots.length, 3);
    assert.equal(pots[0].amount, 150);
    assert.deepEqual(pots[0].eligibleSeats, [1, 2, 3]);
    assert.equal(pots[1].amount, 100);
    assert.deepEqual(pots[1].eligibleSeats, [2, 3]);
    assert.equal(pots[2].amount, 200);
    assert.deepEqual(pots[2].eligibleSeats, [3]);
  });

  it('folded player contributes but cannot win', () => {
    const pots = buildPots([
      { seatNo: 1, invested: 80, folded: true },
      { seatNo: 2, invested: 80, folded: false },
    ]);
    assert.equal(pots[0].amount, 160);
    assert.deepEqual(pots[0].eligibleSeats, [2]);
  });

  it('caps rake', () => {
    const a = applyRake([{ amount: 1000, eligibleSeats: [1] }], 500, 60);
    assert.equal(a.rake, 50);
    const b = applyRake([{ amount: 10000, eligibleSeats: [1] }], 500, 60);
    assert.equal(b.rake, 60);
    assert.equal(b.pots[0].amount, 9940);
  });

  it('gives odd chip after dealer', () => {
    const awards = splitPot(5, [1, 3], 1, 6);
    assert.equal(awards[3] + awards[1], 5);
    assert.equal(awards[3], 3);
    assert.equal(awards[1], 2);
  });
});

describe('cards', () => {
  it('shuffles deterministically', () => {
    const a = shuffledDeck('seed-1');
    const b = shuffledDeck('seed-1');
    const c = shuffledDeck('seed-2');
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    assert.equal(a.length, 52);
    assert.equal(new Set(a).size, 52);
    parseCard(a[0]);
    assert.equal(seedHash('x').length, 64);
  });
});

function huTable() {
  return hydrateTable(
    {
      id: 't1',
      code: 'abc123',
      version: 1,
      status: 'waiting',
      street: 'idle',
      hand_no: 0,
      dealer_seat: 1,
      sb_cents: 5,
      bb_cents: 10,
      ante_cents: 0,
      max_seats: 6,
      rake_bps: 500,
      rake_cap_cents: 30,
      action_timeout_sec: 20,
      min_buyin_cents: 200,
      max_buyin_cents: 1000,
      engine: {},
      board: [],
      pots: [],
    },
    [
      { seat_no: 1, profile_id: 'p1', stack_cents: 500, username: 'a' },
      { seat_no: 2, profile_id: 'p2', stack_cents: 500, username: 'b' },
    ],
    null,
  );
}

describe('flow', () => {
  it('starts HU hand and awards uncontested on fold', () => {
    const state = startHand(huTable());
    assert.equal(state.street, 'preflop');
    assert.equal(state.seats[0].holeCards.length, 2);
    assert.equal(state.seats[1].holeCards.length, 2);
    const actor = state.actorSeat;
    applyAction(state, { type: 'fold', seatNo: actor });
    assert.equal(state.street, 'showdown');
    const { deltas } = settleDeltas(state);
    const sum = deltas.reduce((s, d) => s + d.net_cents, 0);
    assert.equal(sum, 0); // no flop, no rake
    assert.ok(deltas.some((d) => d.net_cents > 0));
    assert.ok(deltas.some((d) => d.net_cents < 0));
  });

  it('timeout folds when facing a bet', () => {
    const state = startHand(huTable());
    timeoutAction(state);
    assert.equal(state.street, 'showdown');
  });
});
