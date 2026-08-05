/** Crimson Cascade — cluster / tumble / free-spins engine (no Wild) */

import {
  COLS,
  ROWS,
  GRID_SIZE,
  MIN_CLUSTER,
  MAX_WIN_MULT,
  MAX_FREE_SPINS_CAP,
  BUY_BONUS_FS,
  BUY_BONUS_COST_MULT,
  RETRIGGER_SCATTERS_NEEDED,
  RETRIGGER_FS_AWARDED,
  SymbolId,
  SCATTER,
  MULT,
  PAYING,
  BASE_WEIGHTS,
  FS_WEIGHTS,
  MULT_VALUE_WEIGHTS,
  payForCluster,
  freeSpinsForScatters,
} from './crimsonConfig';

export type Rng = () => number;

export interface CellState {
  symbol: SymbolId;
  /** Only present when symbol === MULT */
  multValue?: number;
}

export interface ClusterWin {
  symbol: SymbolId;
  cells: number[];
  size: number;
  payMult: number;
}

export interface TumbleStep {
  grid: CellState[];
  wins: ClusterWin[];
  stepPay: number;
  removed: number[];
}

export interface SpinRound {
  tumbles: TumbleStep[];
  finalGrid: CellState[];
  scatterCount: number;
  /** Base game natural FS (4+ scatters) */
  freeSpinsAwarded: number;
  /** True when 3+ scatters in FS → +5 retrigger spins */
  retriggered: boolean;
  roundPay: number;
  /** Sum of all bomb values visible on the final grid (FS only) */
  multTotal: number;
  multFactor: number;
  appliedPay: number;
}

export interface FullSpinResult {
  betUSD: number;
  /** True when triggered via buy-bonus (no base spin) */
  isBought: boolean;
  base: SpinRound;
  freeSpins: SpinRound[];
  totalPayoutUSD: number;
  multiplier: number;
  totalFreeSpinsPlayed: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pickWeighted<T extends { w: number }>(items: T[], rng: Rng): T {
  let total = 0;
  for (const it of items) total += it.w;
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function rollSymbol(weights: { id: SymbolId; w: number }[], rng: Rng, allowMult: boolean): CellState {
  const pool = allowMult ? weights : weights.filter(x => x.id !== MULT);
  const { id } = pickWeighted(pool, rng);
  if (id === MULT) {
    return { symbol: MULT, multValue: pickWeighted(MULT_VALUE_WEIGHTS, rng).value };
  }
  return { symbol: id };
}

function idx(c: number, r: number) { return r * COLS + c; }

function neighbors(i: number): number[] {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const out: number[] = [];
  if (c > 0)       out.push(idx(c - 1, r));
  if (c < COLS - 1) out.push(idx(c + 1, r));
  if (r > 0)       out.push(idx(c, r - 1));
  if (r < ROWS - 1) out.push(idx(c, r + 1));
  return out;
}

// ─── grid fill ──────────────────────────────────────────────────────────────

export function fillGrid(rng: Rng, freeSpin: boolean): CellState[] {
  const weights = freeSpin ? FS_WEIGHTS : BASE_WEIGHTS;
  const grid = Array.from({ length: GRID_SIZE }, () => rollSymbol(weights, rng, freeSpin));

  // Clump pass: base ~96% RTP; FS stronger for buy-bonus ~55–70% of cost
  const smears = freeSpin ? 24 : 15;
  for (let s = 0; s < smears; s++) {
    const i = Math.floor(rng() * GRID_SIZE);
    const nbs = neighbors(i);
    if (!nbs.length) continue;
    const j = nbs[Math.floor(rng() * nbs.length)];
    const src = grid[i];
    if (src.symbol === SCATTER || src.symbol === MULT) continue;
    if (grid[j].symbol === SCATTER || grid[j].symbol === MULT) continue;
    if (rng() < (freeSpin ? 0.64 : 0.58)) {
      grid[j] = { symbol: src.symbol };
    }
  }
  return grid;
}

// ─── cluster finder ─────────────────────────────────────────────────────────

/** Find non-overlapping clusters (≥ MIN_CLUSTER). Higher-value symbols evaluated first. */
export function findClusters(grid: CellState[]): ClusterWin[] {
  const claimed = new Set<number>();
  const candidates: ClusterWin[] = [];

  const order = [...PAYING].sort((a, b) => b - a); // high-value first

  for (const sym of order) {
    const visited = new Set<number>();
    for (let i = 0; i < GRID_SIZE; i++) {
      if (visited.has(i) || claimed.has(i)) continue;
      if (grid[i].symbol !== sym) continue;

      const stack = [i];
      const component: number[] = [];
      visited.add(i);

      while (stack.length) {
        const cur = stack.pop()!;
        component.push(cur);
        for (const n of neighbors(cur)) {
          if (visited.has(n) || claimed.has(n)) continue;
          if (grid[n].symbol !== sym) continue;
          visited.add(n);
          stack.push(n);
        }
      }

      if (component.length < MIN_CLUSTER) continue;

      const payMult = payForCluster(sym, component.length);
      candidates.push({ symbol: sym, cells: component, size: component.length, payMult });
      for (const c of component) claimed.add(c);
    }
  }
  return candidates;
}

// ─── tumble ──────────────────────────────────────────────────────────────────

function removeAndTumble(grid: CellState[], removeSet: Set<number>, rng: Rng, freeSpin: boolean): CellState[] {
  const weights = freeSpin ? FS_WEIGHTS : BASE_WEIGHTS;
  const next = grid.map(c => ({ ...c }));

  for (let c = 0; c < COLS; c++) {
    const survivorsBottom: CellState[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = idx(c, r);
      if (!removeSet.has(i)) survivorsBottom.push(grid[i]);
    }
    const need = ROWS - survivorsBottom.length;
    const newTop: CellState[] = [];
    for (let k = 0; k < need; k++) {
      newTop.push(rollSymbol(weights, rng, freeSpin));
    }
    // top→bottom: new symbols, then survivors (topmost first)
    const topToBottom = [...newTop, ...survivorsBottom.reverse()];
    for (let r = 0; r < ROWS; r++) {
      next[idx(c, r)] = topToBottom[r];
    }
  }
  return next;
}

// ─── round resolver ──────────────────────────────────────────────────────────

function countScatters(grid: CellState[]): number {
  return grid.reduce((n, c) => n + (c.symbol === SCATTER ? 1 : 0), 0);
}

function sumMultOrbs(grid: CellState[]): number {
  return grid.reduce((n, c) => (c.symbol === MULT && c.multValue ? n + c.multValue : n), 0);
}

export function resolveRound(rng: Rng, betUSD: number, freeSpin: boolean): SpinRound {
  let grid = fillGrid(rng, freeSpin);
  const initialScatters = countScatters(grid);
  const tumbles: TumbleStep[] = [];
  let roundPay = 0;
  let safety = 0;

  while (safety++ < 40) {
    const wins = findClusters(grid);
    if (wins.length === 0) break;

    const stepPay = wins.reduce((s, w) => s + w.payMult * betUSD, 0);
    roundPay += stepPay;
    const removed = wins.flatMap(w => w.cells);
    const removeSet = new Set(removed);

    tumbles.push({ grid: grid.map(c => ({ ...c })), wins, stepPay, removed: [...removeSet] });
    grid = removeAndTumble(grid, removeSet, rng, freeSpin);
  }

  const multTotal = freeSpin ? sumMultOrbs(grid) : 0;
  const multFactor = multTotal > 1 ? Math.min(multTotal, 500) : 1;
  const appliedPay = roundPay * multFactor;

  const freeSpinsAwarded = freeSpin ? 0 : freeSpinsForScatters(initialScatters);
  // Retrigger: in FS, 3+ scatters → +5 FS
  const retriggered = freeSpin && initialScatters >= RETRIGGER_SCATTERS_NEEDED;

  return {
    tumbles,
    finalGrid: grid,
    scatterCount: initialScatters,
    freeSpinsAwarded,
    retriggered,
    roundPay,
    multTotal,
    multFactor,
    appliedPay,
  };
}

// ─── full spin (base game + optional FS) ────────────────────────────────────

function runFreeSpins(betUSD: number, initialFS: number, rng: Rng): {
  freeSpins: SpinRound[];
  totalFsPlayed: number;
} {
  const freeSpins: SpinRound[] = [];
  let fsLeft = Math.min(initialFS, MAX_FREE_SPINS_CAP);
  let totalFsPlayed = 0;

  while (fsLeft > 0 && totalFsPlayed < MAX_FREE_SPINS_CAP) {
    const round = resolveRound(rng, betUSD, true);
    freeSpins.push(round);
    totalFsPlayed++;
    fsLeft--;
    if (round.retriggered) {
      fsLeft = Math.min(fsLeft + RETRIGGER_FS_AWARDED, MAX_FREE_SPINS_CAP - totalFsPlayed);
    }
  }
  return { freeSpins, totalFsPlayed };
}

export function playFullSpin(betUSD: number, rng: Rng = Math.random): FullSpinResult {
  const base = resolveRound(rng, betUSD, false);

  let freeSpins: SpinRound[] = [];
  let totalFsPlayed = 0;

  if (base.freeSpinsAwarded > 0) {
    const fs = runFreeSpins(betUSD, base.freeSpinsAwarded, rng);
    freeSpins = fs.freeSpins;
    totalFsPlayed = fs.totalFsPlayed;
  }

  let total = base.appliedPay + freeSpins.reduce((s, r) => s + r.appliedPay, 0);
  if (total > betUSD * MAX_WIN_MULT) total = betUSD * MAX_WIN_MULT;

  return {
    betUSD,
    isBought: false,
    base,
    freeSpins,
    totalPayoutUSD: total,
    multiplier: betUSD > 0 ? total / betUSD : 0,
    totalFreeSpinsPlayed: totalFsPlayed,
  };
}

/** Buy-bonus: skip base spin, jump straight to 10 FS */
export function playBoughtBonus(betUSD: number, rng: Rng = Math.random): FullSpinResult {
  const { freeSpins, totalFsPlayed } = runFreeSpins(betUSD, BUY_BONUS_FS, rng);

  let total = freeSpins.reduce((s, r) => s + r.appliedPay, 0);
  if (total > betUSD * MAX_WIN_MULT) total = betUSD * MAX_WIN_MULT;

  const emptyBase: SpinRound = {
    tumbles: [],
    finalGrid: Array.from({ length: GRID_SIZE }, () => ({ symbol: PAYING[0] })),
    scatterCount: 0,
    freeSpinsAwarded: 0,
    retriggered: false,
    roundPay: 0,
    multTotal: 0,
    multFactor: 1,
    appliedPay: 0,
  };

  return {
    betUSD,
    isBought: true,
    base: emptyBase,
    freeSpins,
    totalPayoutUSD: total,
    multiplier: betUSD > 0 ? total / betUSD : 0,
    totalFreeSpinsPlayed: totalFsPlayed,
  };
}

/** Monte-Carlo RTP estimator (base game spins including rare natural FS) */
export function simulateRtp(
  spins: number,
  betUSD = 1,
  rng: Rng = Math.random,
): { rtp: number; hitRate: number; avgWin: number; fsRate: number } {
  let wagered = 0, paid = 0, hits = 0, fsTriggers = 0;
  for (let i = 0; i < spins; i++) {
    wagered += betUSD;
    const res = playFullSpin(betUSD, rng);
    paid += res.totalPayoutUSD;
    if (res.totalPayoutUSD > 0) hits++;
    if (res.base.freeSpinsAwarded > 0) fsTriggers++;
  }
  return { rtp: paid / wagered, hitRate: hits / spins, avgWin: paid / spins, fsRate: fsTriggers / spins };
}

/** Buy-bonus EV: payout / (100 × bet). Target ~0.55–0.70 */
export function simulateBuyBonus(
  buys: number,
  betUSD = 1,
  rng: Rng = Math.random,
): { meanReturn: number; medianMult: number; avgPayout: number; cost: number } {
  const cost = betUSD * BUY_BONUS_COST_MULT;
  const payouts: number[] = [];
  let paid = 0;
  for (let i = 0; i < buys; i++) {
    const res = playBoughtBonus(betUSD, rng);
    paid += res.totalPayoutUSD;
    payouts.push(res.totalPayoutUSD);
  }
  payouts.sort((a, b) => a - b);
  const median = payouts[Math.floor(payouts.length / 2)] ?? 0;
  return {
    meanReturn: paid / (buys * cost),
    medianMult: median / betUSD,
    avgPayout: paid / buys,
    cost,
  };
}
