export type Currency = 'USD' | 'EUR' | 'RUB' | 'UAH' | 'KZT';

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

export type GameId = 'crash' | 'roulette' | 'blackjack' | 'coinflip' | 'dice' | 'mines' | 'plinko' | 'slots';

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
}

export interface UserProfile {
  username: string;
  avatar: string;
  balanceUSD: number;
  vipLevel: number; // 1 to 6
  vipXp: number;
  vipMaxXp: number;
  totalWageredUSD: number;
  totalProfitUSD: number;
  totalBetsCount: number;
  totalWinsCount: number;
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
