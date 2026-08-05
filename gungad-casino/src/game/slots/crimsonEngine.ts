/** Crimson Cascade — cluster / tumble / free-spins engine */

import {
  COLS,
  ROWS,
  GRID_SIZE,
  MIN_CLUSTER,
  MAX_WIN_MULT,
  MAX_FREE_SPINS_CAP,
  SymbolId,
  SCATTER,
  MULT,
  WILD,
  PAYING,
  BASE_WEIGHTS,
  FS_WEIGHTS,
  MULT_VALUE_WEIGHTS,
  payForCluster,
  freeSpinsForScatters,
} from './crimsonConfig';

export type Rng = () => number; // [0, 1)

export interface CellState {
  symbol: SymbolId;
  /** Present when symbol === MULT */
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
  /** Grid after all tumbles settle */
  finalGrid: CellState[];
  scatterCount: number;
  freeSpinsAwarded: number;
  roundPay: number;
  /** Sum of mult bombs on final grid (FS only); 0 or 1 means no extra mult */
  multTotal: number;
  appliedPay: number;
}

export interface FullSpinResult {
  betUSD: number;
  base: SpinRound;
  freeSpins: SpinRound[];
  totalPayoutUSD: number;
  multiplier: number;
  totalFreeSpinsPlayed: number;
}

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
    const mv = pickWeighted(MULT_VALUE_WEIGHTS, rng).value;
    return { symbol: MULT, multValue: mv };
  }
  return { symbol: id };
}

export function emptyGrid(): CellState[] {
  return Array.from({ length: GRID_SIZE }, () => ({ symbol: 1 as SymbolId }));
}

export function fillGrid(rng: Rng, freeSpin: boolean): CellState[] {
  const weights = freeSpin ? FS_WEIGHTS : BASE_WEIGHTS;
  const grid = Array.from({ length: GRID_SIZE }, () => rollSymbol(weights, rng, freeSpin));
  // Clump pass: copy a neighbor into empty-feeling distribution so clusters form
  const smears = freeSpin ? 10 : 8;
  for (let s = 0; s < smears; s++) {
    const i = Math.floor(rng() * GRID_SIZE);
    const nbs = neighbors(i);
    if (!nbs.length) continue;
    const j = nbs[Math.floor(rng() * nbs.length)];
    const src = grid[i];
    // Don't smear specials onto everything too aggressively
    if (src.symbol === SCATTER || src.symbol === MULT) continue;
    if (grid[j].symbol === SCATTER || grid[j].symbol === MULT) continue;
    if (rng() < 0.55) {
      grid[j] = src.symbol === MULT ? { ...src } : { symbol: src.symbol };
    }
  }
  return grid;
}

function idx(c: number, r: number) {
  return r * COLS + c;
}

function neighbors(i: number): number[] {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const out: number[] = [];
  if (c > 0) out.push(idx(c - 1, r));
  if (c < COLS - 1) out.push(idx(c + 1, r));
  if (r > 0) out.push(idx(c, r - 1));
  if (r < ROWS - 1) out.push(idx(c, r + 1));
  return out;
}

function matchesSymbol(cell: CellState, target: SymbolId): boolean {
  if (cell.symbol === target) return true;
  if (cell.symbol === WILD && PAYING.includes(target)) return true;
  return false;
}

/** Find non-overlapping clusters; higher-pay symbols win conflicts on shared wilds */
export function findClusters(grid: CellState[]): ClusterWin[] {
  const claimed = new Set<number>();
  const candidates: ClusterWin[] = [];

  // Evaluate high → low so premium symbols claim wilds first
  const order = [...PAYING].sort((a, b) => b - a);

  for (const sym of order) {
    const visited = new Set<number>();
    for (let i = 0; i < GRID_SIZE; i++) {
      if (visited.has(i) || claimed.has(i)) continue;
      if (!matchesSymbol(grid[i], sym)) continue;
      // Seed must include at least one real (non-wild) of this symbol eventually
      const stack = [i];
      const component: number[] = [];
      let hasReal = false;
      visited.add(i);

      while (stack.length) {
        const cur = stack.pop()!;
        component.push(cur);
        if (grid[cur].symbol === sym) hasReal = true;
        for (const n of neighbors(cur)) {
          if (visited.has(n) || claimed.has(n)) continue;
          if (!matchesSymbol(grid[n], sym)) continue;
          visited.add(n);
          stack.push(n);
        }
      }

      if (!hasReal || component.length < MIN_CLUSTER) continue;

      const payMult = payForCluster(sym, component.length);
      candidates.push({ symbol: sym, cells: component, size: component.length, payMult });
      for (const c of component) claimed.add(c);
    }
  }

  return candidates;
}

function removeAndTumble(grid: CellState[], removeSet: Set<number>, rng: Rng, freeSpin: boolean): CellState[] {
  const weights = freeSpin ? FS_WEIGHTS : BASE_WEIGHTS;
  const next = grid.map(c => ({ ...c }));

  for (let c = 0; c < COLS; c++) {
    const survivorsBottomFirst: CellState[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = idx(c, r);
      if (!removeSet.has(i)) survivorsBottomFirst.push(grid[i]);
    }
    const need = ROWS - survivorsBottomFirst.length;
    const newTop: CellState[] = [];
    for (let k = 0; k < need; k++) {
      newTop.push(rollSymbol(weights, rng, freeSpin));
    }
    // top → bottom: new symbols, then survivors (topmost survivor first)
    const topToBottom = [...newTop, ...survivorsBottomFirst.reverse()];
    for (let r = 0; r < ROWS; r++) {
      next[idx(c, r)] = topToBottom[r];
    }
  }
  return next;
}

function countScatters(grid: CellState[]): number {
  return grid.reduce((n, c) => n + (c.symbol === SCATTER ? 1 : 0), 0);
}

function sumMultOrbs(grid: CellState[]): number {
  return grid.reduce((n, c) => {
    if (c.symbol === MULT && c.multValue) return n + c.multValue;
    return n;
  }, 0);
}

/** Resolve one paid or free spin (grid fill + cascades) */
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
    // Multiplier orbs and scatters are never part of paying clusters; keep them
    const removeSet = new Set(removed);

    tumbles.push({
      grid: grid.map(c => ({ ...c })),
      wins,
      stepPay,
      removed: [...removeSet],
    });

    grid = removeAndTumble(grid, removeSet, rng, freeSpin);
  }

  const multTotal = freeSpin ? sumMultOrbs(grid) : 0;
  // Cap per-spin multiplier to keep RTP stable (orbs still feel juicy)
  const multFactor = multTotal > 1 ? Math.min(multTotal, 50) : 1;
  const appliedPay = roundPay * multFactor;
  const freeSpinsAwarded = freeSpinsForScatters(initialScatters);

  return {
    tumbles,
    finalGrid: grid,
    scatterCount: initialScatters,
    freeSpinsAwarded,
    roundPay,
    multTotal,
    appliedPay,
  };
}

export function playFullSpin(betUSD: number, rng: Rng = Math.random): FullSpinResult {
  const base = resolveRound(rng, betUSD, false);
  const freeSpins: SpinRound[] = [];
  let fsLeft = Math.min(base.freeSpinsAwarded, MAX_FREE_SPINS_CAP);
  let totalFsPlayed = 0;

  while (fsLeft > 0 && totalFsPlayed < MAX_FREE_SPINS_CAP) {
    const round = resolveRound(rng, betUSD, true);
    freeSpins.push(round);
    totalFsPlayed++;
    fsLeft--;
    if (round.freeSpinsAwarded > 0) {
      fsLeft = Math.min(fsLeft + round.freeSpinsAwarded, MAX_FREE_SPINS_CAP - totalFsPlayed);
    }
  }

  let total = base.appliedPay + freeSpins.reduce((s, r) => s + r.appliedPay, 0);
  const maxPayout = betUSD * MAX_WIN_MULT;
  if (total > maxPayout) total = maxPayout;

  const multiplier = betUSD > 0 ? total / betUSD : 0;

  return {
    betUSD,
    base,
    freeSpins,
    totalPayoutUSD: total,
    multiplier,
    totalFreeSpinsPlayed: totalFsPlayed,
  };
}

/** Quick Monte-Carlo for RTP tuning */
export function simulateRtp(spins: number, betUSD = 1, seedRng?: Rng): { rtp: number; hitRate: number; avgWin: number; fsRate: number } {
  const rng = seedRng ?? Math.random;
  let wagered = 0;
  let paid = 0;
  let hits = 0;
  let fsTriggers = 0;

  for (let i = 0; i < spins; i++) {
    wagered += betUSD;
    const res = playFullSpin(betUSD, rng);
    paid += res.totalPayoutUSD;
    if (res.totalPayoutUSD > 0) hits++;
    if (res.base.freeSpinsAwarded > 0) fsTriggers++;
  }

  return {
    rtp: paid / wagered,
    hitRate: hits / spins,
    avgWin: paid / spins,
    fsRate: fsTriggers / spins,
  };
}
