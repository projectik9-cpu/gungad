/** Classic 3-reel one-armed bandit config */

export type BanditSymbol = 'seven' | 'bar' | 'grape' | 'lemon';

export const SYMBOLS: BanditSymbol[] = ['seven', 'bar', 'grape', 'lemon'];

export const REELS = 3;
export const VISIBLE_ROWS = 3;
/** Center row index in the visible window (payline) */
export const PAYLINE_ROW = 1;

/** Bet presets in USD */
export const BET_PRESETS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 25, 50, 100];
export const DEFAULT_BET_INDEX = 3;

/** 3-of-a-kind payouts (bet multiples) */
export const TRIPLE_PAY: Record<BanditSymbol, number> = {
  seven: 50,
  bar: 20,
  grape: 8,
  lemon: 4,
};

/** 2-of-a-kind left-to-right (reel0===reel1, reel2 different) → stake return */
export const PAIR_PAY = 1;

/**
 * Reel weights — tuned for ~96–97% real RTP.
 * lemon most common → seven rarest.
 */
export const REAL_WEIGHTS: Record<BanditSymbol, number> = {
  lemon: 50,
  grape: 28,
  bar: 15,
  seven: 7,
};

/** Demo: hotter lemon hit-rate (~103–105% RTP) */
export const DEMO_WEIGHTS: Record<BanditSymbol, number> = {
  lemon: 54,
  grape: 26,
  bar: 13,
  seven: 7,
};

export const SYMBOL_LABEL: Record<BanditSymbol, string> = {
  seven: '777',
  bar: 'BAR',
  grape: '🍇',
  lemon: '🍋',
};

export const SYMBOL_COLOR: Record<BanditSymbol, string> = {
  seven: '#f43f5e',
  bar: '#fbbf24',
  grape: '#a78bfa',
  lemon: '#facc15',
};
