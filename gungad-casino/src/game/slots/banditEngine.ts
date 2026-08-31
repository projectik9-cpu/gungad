import {
  BanditSymbol,
  DEMO_WEIGHTS,
  PAIR_PAY,
  REAL_WEIGHTS,
  REELS,
  SYMBOLS,
  TRIPLE_PAY,
  VISIBLE_ROWS,
  PAYLINE_ROW,
  JACKPOT_STARS,
} from './banditConfig';
import { keepLiveWin } from '../demoOdds';

export type Rng = () => number;

export interface SpinResult {
  grid: BanditSymbol[];
  line: [BanditSymbol, BanditSymbol, BanditSymbol];
  multiplier: number;
  payoutUSD: number;
  kind: 'triple' | 'pair' | 'lose' | 'jackpot';
  jackpot: boolean;
  jackpotStars: number;
  spinId: string;
}

function pickWeighted(weights: Record<BanditSymbol, number>, rng: Rng): BanditSymbol {
  let total = 0;
  for (const s of SYMBOLS) total += weights[s];
  let r = rng() * total;
  for (const s of SYMBOLS) {
    r -= weights[s];
    if (r <= 0) return s;
  }
  return 'lemon';
}

export function evaluateLine(line: [BanditSymbol, BanditSymbol, BanditSymbol]): {
  multiplier: number;
  kind: 'triple' | 'pair' | 'lose' | 'jackpot';
  jackpot: boolean;
} {
  const [a, b, c] = line;
  if (a === 'jackpot' && b === 'jackpot' && c === 'jackpot') {
    return { multiplier: 0, kind: 'jackpot', jackpot: true };
  }
  if (a === b && b === c) return { multiplier: TRIPLE_PAY[a], kind: 'triple', jackpot: false };
  if (a === b && c !== a) return { multiplier: PAIR_PAY, kind: 'pair', jackpot: false };
  return { multiplier: 0, kind: 'lose', jackpot: false };
}

function buildGrid(line: [BanditSymbol, BanditSymbol, BanditSymbol], weights: Record<BanditSymbol, number>, rng: Rng): BanditSymbol[] {
  const grid: BanditSymbol[] = new Array(REELS * VISIBLE_ROWS);
  for (let col = 0; col < REELS; col++) {
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      grid[col * VISIBLE_ROWS + row] = row === PAYLINE_ROW ? line[col] : pickWeighted(weights, rng);
    }
  }
  return grid;
}

function breakLineToLoss(line: [BanditSymbol, BanditSymbol, BanditSymbol], rng: Rng): [BanditSymbol, BanditSymbol, BanditSymbol] {
  const others = SYMBOLS.filter((s) => s !== line[0] && s !== 'jackpot');
  const next = others[Math.floor(rng() * others.length)] ?? 'grape';
  return [line[0], next, line[2]];
}

export function playSpin(betUSD: number, isDemo = false, rng: Rng = Math.random, opts?: { warmup?: boolean }): SpinResult {
  const weights = isDemo ? DEMO_WEIGHTS : REAL_WEIGHTS;
  let line: [BanditSymbol, BanditSymbol, BanditSymbol];
  if (opts?.warmup) {
    line = ['lemon', 'lemon', 'grape'];
  } else {
    line = [pickWeighted(weights, rng), pickWeighted(weights, rng), pickWeighted(weights, rng)];
    const natural = evaluateLine(line);
    if (!natural.jackpot && natural.kind !== 'lose' && !keepLiveWin(true, isDemo, rng)) line = breakLineToLoss(line, rng);
  }
  const evaluation = evaluateLine(line);
  return {
    grid: buildGrid(line, weights, rng),
    line,
    multiplier: evaluation.multiplier,
    payoutUSD: betUSD * evaluation.multiplier,
    kind: evaluation.kind,
    jackpot: evaluation.jackpot,
    jackpotStars: evaluation.jackpot ? JACKPOT_STARS : 0,
    spinId: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function initialGrid(rng: Rng = Math.random): BanditSymbol[] {
  return buildGrid([pickWeighted(REAL_WEIGHTS, rng), pickWeighted(REAL_WEIGHTS, rng), pickWeighted(REAL_WEIGHTS, rng)], REAL_WEIGHTS, rng);
}

export function estimateRtp(spins: number, isDemo: boolean, rng: Rng = Math.random): number {
  let paid = 0;
  for (let i = 0; i < spins; i++) paid += playSpin(1, isDemo, rng).payoutUSD;
  return paid / spins;
}
