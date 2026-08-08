/** Demo play bias — target ~103% effective RTP vs real house edge. */

export const DEMO_PAYOUT_FACTOR = 103 / 99; // ≈1.0404 over 1% house-edge formulas

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

/** Soften early crash buckets in demo (~103% feel vs ~5% edge). */
export function generateCrashPoint(isDemo = false): number {
  const rand = Math.random();
  if (isDemo) {
    if (rand < 0.04) return parseFloat((1.00 + Math.random() * 0.04).toFixed(2));
    if (rand < 0.45) return parseFloat((1.01 + Math.random() * 0.49).toFixed(2));
    if (rand < 0.68) return parseFloat((1.5 + Math.random() * 0.5).toFixed(2));
    if (rand < 0.86) return parseFloat((2.0 + Math.random() * 3.0).toFixed(2));
    if (rand < 0.95) return parseFloat((5.0 + Math.random() * 5.0).toFixed(2));
    return parseFloat((10.0 + Math.random() * 90.0).toFixed(2));
  }
  if (rand < 0.08) return parseFloat((1.00 + Math.random() * 0.04).toFixed(2));
  if (rand < 0.55) return parseFloat((1.01 + Math.random() * 0.49).toFixed(2));
  if (rand < 0.75) return parseFloat((1.5 + Math.random() * 0.5).toFixed(2));
  if (rand < 0.90) return parseFloat((2.0 + Math.random() * 3.0).toFixed(2));
  if (rand < 0.97) return parseFloat((5.0 + Math.random() * 5.0).toFixed(2));
  return parseFloat((10.0 + Math.random() * 90.0).toFixed(2));
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
