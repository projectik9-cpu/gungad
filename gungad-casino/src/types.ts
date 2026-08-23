export type Currency = 'USD' | 'RUB' | 'UAH' | 'STARS';

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  name: string;
  flag: string;
  rateToUSD: number; // multiplier from USD
}

export type Language = 'en' | 'ru' | 'uk' | 'kk';

export interface LanguageConfig {
  code: Language;
  name: string;
  flag: string;
}

export type GameId = 'crash' | 'roulette' | 'blackjack' | 'poker' | 'coinflip' | 'dice' | 'mines' | 'plinko' | 'slots';

export interface GameInfo {
  id: GameId;
  name: string;
  category: 'crash' | 'table' | 'cards' | 'instant' | 'arcade' | 'slots';
  image: string;
  badge?: string;
  rtp: string;
  minBetUSD: number;
  maxBetUSD: number;
  descriptionKey: string;
  locked?: boolean;
}

export interface UserProfile {
  username: string;
  avatar: string;
  balanceUSD: number;
  /** Separate Telegram Stars wallet — never converted to fiat/USD play money */
  starsBalance: number;
  vipLevel: number; // 1 to 6
  vipXp: number;
  vipMaxXp: number;
  totalWageredUSD: number;
  totalWageredStars: number;
  totalBetsCount: number;
}

export interface BetHistoryItem {
  id: string;
  gameId: GameId;
  gameName: string;
  timestamp: Date;
  betAmountUSD: number;
  multiplier: number;
  payoutUSD: number;
  win: boolean;
  currency: Currency;
  clientSeed?: string;
  serverSeedHash?: string;
  /** When true, money already moved via place/resolve — skip one-shot settle */
  serverSettled?: boolean;
}

export interface LiveFeedItem {
  id: string;
  player: string;
  avatar: string;
  gameId: GameId;
  gameName: string;
  betUSD: number;
  multiplier: number;
  payoutUSD: number;
  timeAgo: string;
}
