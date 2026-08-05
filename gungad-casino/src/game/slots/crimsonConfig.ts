/** Crimson Cascade — config, weights, paytable (10-symbol Bonanza-style) */

export const COLS = 6;
export const ROWS = 5;
export const GRID_SIZE = COLS * ROWS;

/** Min cluster = 8, like Bonanza */
export const MIN_CLUSTER = 8;
export const MAX_WIN_MULT = 5000;
export const MAX_FREE_SPINS_CAP = 100;

/** Buy Bonus: costs 100× current bet, awards 10 free spins immediately */
export const BUY_BONUS_COST_MULT = 100;
export const BUY_BONUS_FS = 10;

/** Retrigger: 3+ scatters in FS → +5 FS (rare) */
export const RETRIGGER_SCATTERS_NEEDED = 3;
export const RETRIGGER_FS_AWARDED = 5;

/**
 * Active paying symbols: 1 (black chip G), 2 (red chip), 4 (ace card),
 * 6 (black diamond), 7 (bullet), 8 (revolver cylinder), 9 (revolver), 10 (crown)
 * Specials: 11 (scatter/retrigger), 12 (bomb multiplier)
 * REMOVED: 3 (giltsa), 5 (rubin), 13 (wild)
 */
export type SymbolId = 1 | 2 | 4 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const SCATTER: SymbolId = 11;
export const MULT: SymbolId = 12;

export const PAYING: SymbolId[] = [1, 2, 4, 6, 7, 8, 9, 10];

export const SYMBOL_SRC: Record<SymbolId, string> = {
  1: '/games/slots/crimson/1.png',
  2: '/games/slots/crimson/2.png',
  4: '/games/slots/crimson/4.png',
  6: '/games/slots/crimson/6.png',
  7: '/games/slots/crimson/7.png',
  8: '/games/slots/crimson/8.png',
  9: '/games/slots/crimson/9.png',
  10: '/games/slots/crimson/10.png',
  11: '/games/slots/crimson/11.png',
  12: '/games/slots/crimson/12.png',
};

/** Cluster size tiers: 8–9 / 10–11 / 12+ */
const SIZE_TIERS = [
  { min: 8,  key: 's8'  as const },
  { min: 10, key: 's10' as const },
  { min: 12, key: 's12' as const },
];
type SizeKey = 's8' | 's10' | 's12';

/** Pay in bet-multiples for each symbol × cluster-size tier (~96% RTP target) */
export const PAYTABLE: Record<number, Record<SizeKey, number>> = {
  1:  { s8: 0.85, s10:  2.1,  s12:  4.2  },
  2:  { s8: 0.85, s10:  2.1,  s12:  4.2  },
  4:  { s8: 1.25, s10:  3.0,  s12:  6.3  },
  6:  { s8: 1.8,  s10:  4.2,  s12:  9.5  },
  7:  { s8: 2.6,  s10:  5.8,  s12: 13.5  },
  8:  { s8: 4.2,  s10:  9.5,  s12: 22.0  },
  9:  { s8: 6.3,  s10: 14.5,  s12: 37.0  },
  10: { s8: 10.5, s10: 24.0,  s12: 63.0  },
};

export function payForCluster(symbol: number, size: number): number {
  const row = PAYTABLE[symbol];
  if (!row) return 0;
  let key: SizeKey = 's8';
  for (const tier of SIZE_TIERS) {
    if (size >= tier.min) key = tier.key;
  }
  return row[key];
}

/** Base game — scatter very rare so natural FS are uncommon */
export const BASE_WEIGHTS: { id: SymbolId; w: number }[] = [
  { id: 1,  w: 32 },  // heavily common → clusters of 8+ form reliably
  { id: 2,  w: 32 },
  { id: 4,  w: 16 },
  { id: 6,  w: 10 },
  { id: 7,  w: 6  },
  { id: 8,  w: 3.5},
  { id: 9,  w: 1.8},
  { id: 10, w: 0.8},
  { id: 11, w: 0.5}, // scatter — extremely rare natural FS trigger
];

/** Free spins — juicier than base but buy-bonus EV target ~55–70% of cost */
export const FS_WEIGHTS: { id: SymbolId; w: number }[] = [
  { id: 1,  w: 16 },
  { id: 2,  w: 16 },
  { id: 4,  w: 14 },
  { id: 6,  w: 12 },
  { id: 7,  w: 10 },
  { id: 8,  w: 7  },
  { id: 9,  w: 4.5},
  { id: 10, w: 2.5},
  { id: 11, w: 1.0},
  { id: 12, w: 4.2}, // bombs present but not flooding
];

/** Bomb multiplier values and their rarity weights */
export const MULT_VALUE_WEIGHTS: { value: number; w: number }[] = [
  { value: 2,   w: 42 },
  { value: 5,   w: 28 },
  { value: 10,  w: 14 },
  { value: 25,  w:  9 },
  { value: 50,  w:  5 },
  { value: 100, w:  2 },
];

/** Natural FS from base game: 4/5/6+ scatters */
export function freeSpinsForScatters(count: number): number {
  if (count >= 6) return 15;
  if (count === 5) return 12;
  if (count >= 4) return 10;
  return 0;
}

/** Pragmatic-style bet presets in USD */
export const BET_PRESETS = [
  0.20, 0.40, 0.60, 0.80, 1.00,
  2.00, 4.00, 6.00, 8.00, 10.00,
  20.00, 40.00, 60.00, 100.00, 200.00,
];

export const DEFAULT_BET_INDEX = 4; // starts at $1.00
