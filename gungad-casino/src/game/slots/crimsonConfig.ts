/** Crimson Cascade — config, weights, paytable */

export const COLS = 6;
export const ROWS = 5;
export const GRID_SIZE = COLS * ROWS;
/** 5+ for playable hit-rate on 6×5 (8+ with independent cells ≈ dead game) */
export const MIN_CLUSTER = 5;
export const MAX_WIN_MULT = 5000;
export const MAX_FREE_SPINS_CAP = 100;

/** Paying symbols 1–10, specials 11–13 */
export type SymbolId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export const SCATTER: SymbolId = 11;
export const MULT: SymbolId = 12;
export const WILD: SymbolId = 13;

export const PAYING: SymbolId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const SYMBOL_SRC: Record<SymbolId, string> = {
  1: '/games/slots/crimson/1.png',
  2: '/games/slots/crimson/2.png',
  3: '/games/slots/crimson/3.png',
  4: '/games/slots/crimson/4.png',
  5: '/games/slots/crimson/5.png',
  6: '/games/slots/crimson/6.png',
  7: '/games/slots/crimson/7.png',
  8: '/games/slots/crimson/8.png',
  9: '/games/slots/crimson/9.png',
  10: '/games/slots/crimson/10.png',
  11: '/games/slots/crimson/11.png',
  12: '/games/slots/crimson/12.png',
  13: '/games/slots/crimson/13.png',
};

/** Cluster size tiers → pay as fraction of bet */
const SIZE_TIERS = [
  { min: 5, key: 's5' as const },
  { min: 7, key: 's7' as const },
  { min: 9, key: 's9' as const },
  { min: 12, key: 's12' as const },
];

type SizeKey = 's5' | 's7' | 's9' | 's12';

/** Pays in bet multiples for each symbol × cluster size tier (~96% RTP target) */
export const PAYTABLE: Record<number, Record<SizeKey, number>> = {
  1: { s5: 0.50, s7: 1.00, s9: 2.00, s12: 4.00 },
  2: { s5: 0.50, s7: 1.00, s9: 2.00, s12: 4.00 },
  3: { s5: 0.62, s7: 1.25, s9: 2.50, s12: 5.00 },
  4: { s5: 0.75, s7: 1.50, s9: 3.00, s12: 6.00 },
  5: { s5: 1.25, s7: 2.50, s9: 5.00, s12: 10.00 },
  6: { s5: 1.50, s7: 3.00, s9: 6.00, s12: 12.50 },
  7: { s5: 2.00, s7: 4.00, s9: 8.00, s12: 16.00 },
  8: { s5: 3.00, s7: 6.00, s9: 12.50, s12: 25.00 },
  9: { s5: 4.50, s7: 9.00, s9: 18.50, s12: 37.00 },
  10: { s5: 7.50, s7: 15.00, s9: 30.00, s12: 62.00 },
};

export function payForCluster(symbol: number, size: number): number {
  const row = PAYTABLE[symbol];
  if (!row) return 0;
  let key: SizeKey = 's5';
  for (const tier of SIZE_TIERS) {
    if (size >= tier.min) key = tier.key;
  }
  return row[key];
}

/** Weighted reel strips — base game (no mult bombs) */
export const BASE_WEIGHTS: { id: SymbolId; w: number }[] = [
  { id: 1, w: 22 },
  { id: 2, w: 22 },
  { id: 3, w: 18 },
  { id: 4, w: 16 },
  { id: 5, w: 12 },
  { id: 6, w: 10 },
  { id: 7, w: 8 },
  { id: 8, w: 5 },
  { id: 9, w: 3.5 },
  { id: 10, w: 2 },
  { id: 11, w: 4.2 }, // scatter
  { id: 13, w: 2.8 }, // wild
];

/** Free spins — more mid/high + multiplier orbs */
export const FS_WEIGHTS: { id: SymbolId; w: number }[] = [
  { id: 1, w: 14 },
  { id: 2, w: 14 },
  { id: 3, w: 12 },
  { id: 4, w: 11 },
  { id: 5, w: 11 },
  { id: 6, w: 10 },
  { id: 7, w: 9 },
  { id: 8, w: 6 },
  { id: 9, w: 4 },
  { id: 10, w: 2.5 },
  { id: 11, w: 3.8 },
  { id: 12, w: 2.8 }, // mult (kept scarce)
  { id: 13, w: 3.5 },
];

/** Multiplier orb value weights (applied in FS) */
export const MULT_VALUE_WEIGHTS: { value: number; w: number }[] = [
  { value: 2, w: 50 },
  { value: 3, w: 25 },
  { value: 4, w: 12 },
  { value: 5, w: 7 },
  { value: 8, w: 3 },
  { value: 10, w: 2 },
  { value: 15, w: 0.8 },
  { value: 25, w: 0.2 },
];

export function freeSpinsForScatters(count: number): number {
  if (count >= 6) return 15;
  if (count === 5) return 12;
  if (count === 4) return 10;
  return 0;
}
