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
} from './banditConfig';

export type Rng = () => number;

export interface SpinResult {
  /** Full 3×3 grid (col-major: index = col * VISIBLE_ROWS + row) */
  grid: BanditSymbol[];
  /** Center payline symbols [reel0, reel1, reel2] */
  line: [BanditSymbol, BanditSymbol, BanditSymbol];
  multiplier: number;
  payoutUSD: number;
  kind: 'triple' | 'pair' | 'lose';
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
  kind: 'triple' | 'pair' | 'lose';
} {
  const [a, b, c] = line;
  if (a === b && b === c) {
    return { multiplier: TRIPLE_PAY[a], kind: 'triple' };
  }
  if (a === b && c !== a) {
    return { multiplier: PAIR_PAY, kind: 'pair' };
  }
  return { multiplier: 0, kind: 'lose' };
}

/** Build a 3×3 window with the given center payline; fillers from same weights. */
function buildGrid(
  line: [BanditSymbol, BanditSymbol, BanditSymbol],
  weights: Record<BanditSymbol, number>,
  rng: Rng,
): BanditSymbol[] {
  const grid: BanditSymbol[] = new Array(REELS * VISIBLE_ROWS);
  for (let col = 0; col < REELS; col++) {
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const idx = col * VISIBLE_ROWS + row;
      if (row === PAYLINE_ROW) {
        grid[idx] = line[col];
      } else {
        grid[idx] = pickWeighted(weights, rng);
      }
    }
  }
  return grid;
}

export function playSpin(
  betUSD: number,
  isDemo = false,
  rng: Rng = Math.random,
): SpinResult {
  const weights = isDemo ? DEMO_WEIGHTS : REAL_WEIGHTS;
  const line: [BanditSymbol, BanditSymbol, BanditSymbol] = [
    pickWeighted(weights, rng),
    pickWeighted(weights, rng),
    pickWeighted(weights, rng),
  ];
  const { multiplier, kind } = evaluateLine(line);
  const grid = buildGrid(line, weights, rng);
  return {
    grid,
    line,
    multiplier,
    payoutUSD: betUSD * multiplier,
    kind,
  };
}

/** Idle / initial grid */
export function initialGrid(rng: Rng = Math.random): BanditSymbol[] {
  return buildGrid(
    [
      pickWeighted(REAL_WEIGHTS, rng),
      pickWeighted(REAL_WEIGHTS, rng),
      pickWeighted(REAL_WEIGHTS, rng),
    ],
    REAL_WEIGHTS,
    rng,
  );
}

/** Monte-Carlo RTP estimator */
export function estimateRtp(spins: number, isDemo: boolean, rng: Rng = Math.random): number {
  let paid = 0;
  const bet = 1;
  for (let i = 0; i < spins; i++) {
    paid += playSpin(bet, isDemo, rng).payoutUSD;
  }
  return paid / spins;
}
