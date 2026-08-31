/**
 * Real-money odds (Stars wallet and crypto/USD use the same formulas).
 * Demo is slightly looser so practice feels better — never used for live Stars or USD.
 *
 * Live EV is cut by reducing win *frequency*, never payout multipliers.
 */

export const DEMO_PAYOUT_FACTOR = 103 / 99; // ≈1.0404 over 1% house-edge formulas

/** Live wins are kept with probability 1/LIVE_WIN_DIVISOR (~60.6%). Payouts stay full. */
export const LIVE_WIN_DIVISOR = 1.65;
export const P_KEEP_LIVE_WIN = 1 / LIVE_WIN_DIVISOR;

/**
 * If the natural outcome is a loss, stay a loss.
 * If it is a win: demo keeps it; live keeps it only with P_KEEP_LIVE_WIN.
 */
export function keepLiveWin(
  naturalWin: boolean,
  isDemo: boolean,
  rng: () => number = Math.random,
): boolean {
  if (!naturalWin) return false;
  if (isDemo) return true;
  return rng() < P_KEEP_LIVE_WIN;
}

export function housePayoutFactor(isDemo: boolean): number {
  return isDemo ? DEMO_PAYOUT_FACTOR : 1;
}

/** Mines edge multiplier: real 0.99 → demo 1.03 */
export function minesEdgeFactor(isDemo: boolean): number {
  return isDemo ? 1.03 : 0.99;
}

/** Coin flip win mult: real 1.98 → demo 2.06 */
export function coinFlipWinMult(isDemo: boolean): number {
  return isDemo ? 2.06 : 1.98;
}

/** Blackjack natural payout: real 2.5 → demo 2.6 */
export function blackjackNaturalMult(isDemo: boolean): number {
  return isDemo ? 2.6 : 2.5;
}

/** Soften early crash buckets in demo. Live mass is shifted left (~EV / 1.65). Cashout X is never scaled. */
export function generateCrashPoint(isDemo = false, opts?: { warmup?: boolean }): number {
  if (opts?.warmup) {
    return parseFloat((2.2 + Math.random() * 1.3).toFixed(2));
  }
  const rand = Math.random();
  let point: number;
  if (isDemo) {
    if (rand < 0.04) point = 1.00 + Math.random() * 0.04;
    else if (rand < 0.45) point = 1.01 + Math.random() * 0.49;
    else if (rand < 0.68) point = 1.5 + Math.random() * 0.5;
    else if (rand < 0.86) point = 2.0 + Math.random() * 3.0;
    else if (rand < 0.95) point = 5.0 + Math.random() * 5.0;
    else point = 10.0 + Math.random() * 40.0; // cap ~50x demo
  } else if (rand < 0.13) point = 1.00 + Math.random() * 0.04;
  else if (rand < 0.68) point = 1.01 + Math.random() * 0.49;
  else if (rand < 0.86) point = 1.5 + Math.random() * 0.5;
  else if (rand < 0.95) point = 2.0 + Math.random() * 3.0;
  else if (rand < 0.99) point = 5.0 + Math.random() * 5.0;
  else point = 10.0 + Math.random() * 40.0; // cap ~50x real
  return parseFloat(Math.min(50, Math.max(1, point)).toFixed(2));
}

export function forceDiceRoll(
  mode: 'over' | 'under',
  target: number,
  win: boolean,
): number {
  const t = Math.min(98, Math.max(2, target));
  if (win) {
    if (mode === 'over') {
      const lo = t + 0.01;
      return parseFloat((lo + Math.random() * (99.99 - lo)).toFixed(2));
    }
    const hi = Math.max(0.01, t - 0.01);
    return parseFloat((Math.random() * hi).toFixed(2));
  }
  if (mode === 'over') {
    return parseFloat((Math.random() * t).toFixed(2));
  }
  return parseFloat((t + Math.random() * (99.99 - t)).toFixed(2));
}

/** Closest bucket with multiplier < 1 (center-ish cheap pockets). */
export function nearestLosingPlinkoBucket(buckets: number[], fromIndex: number): number {
  let best = Math.floor(buckets.length / 2);
  let bestDist = Infinity;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i] >= 1) continue;
    const dist = Math.abs(i - fromIndex);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Modest winning bucket for warmup (not the jackpot edge). */
export function modestWinningPlinkoBucket(buckets: number[]): number {
  const modest: number[] = [];
  const anyWin: number[] = [];
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i] <= 1) continue;
    anyWin.push(i);
    if (buckets[i] < 5) modest.push(i);
  }
  const pool = modest.length ? modest : anyWin;
  if (!pool.length) return Math.floor(buckets.length / 2);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Plinko multipliers — demo bumps mid buckets slightly. */
export function plinkoMultipliers(
  risk: 'low' | 'medium' | 'high',
  isDemo: boolean,
): number[] {
  const base: Record<string, number[]> = {
    low: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  };
  const row = base[risk];
  if (!isDemo) return row;
  return row.map((m) => parseFloat((m * 1.04).toFixed(2)));
}

/** Roulette even-money / dozen multiplier bump in demo (~+5%). */
export function roulettePayoutMult(base: number, isDemo: boolean): number {
  if (!isDemo) return base;
  return parseFloat((base * 1.05).toFixed(4));
}

/** Bias roulette away from 0 slightly in demo (re-roll 0 ~30% of the time). */
export function pickRouletteWinner(
  numbers: number[],
  isDemo: boolean,
): number {
  let idx = Math.floor(Math.random() * numbers.length);
  if (isDemo && numbers[idx] === 0 && Math.random() < 0.3) {
    idx = 1 + Math.floor(Math.random() * (numbers.length - 1));
  }
  return numbers[idx];
}
