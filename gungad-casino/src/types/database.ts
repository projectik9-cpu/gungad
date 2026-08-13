export type GgGameId =
  | 'crash'
  | 'roulette'
  | 'blackjack'
  | 'coinflip'
  | 'dice'
  | 'mines'
  | 'plinko'
  | 'slots'
  | 'poker';

export type GgLedgerKind =
  | 'deposit'
  | 'withdraw'
  | 'bet'
  | 'win'
  | 'refund'
  | 'bonus'
  | 'referral'
  | 'admin_adjust'
  | 'star_topup'
  | 'star_spend'
  | 'poker_buyin'
  | 'poker_cashout'
  | 'poker_hand'
  | 'poker_rake';

export type GgBetStatus =
  | 'pending'
  | 'won'
  | 'lost'
  | 'push'
  | 'cancelled'
  | 'cashed_out';

export type GgStarStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface GgProfile {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string;
  currency_code: string;
  avatar_url: string | null;
  vip_level: number;
  vip_xp: number;
  is_blocked: boolean;
  is_admin: boolean;
  referrer_telegram_id: number | null;
  welcome_bonus_claimed_at: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface GgWallet {
  profile_id: string;
  balance_cents: number;
  locked_cents: number;
  total_wagered_cents: number;
  total_won_cents: number;
  total_lost_cents: number;
  total_deposited_cents: number;
  total_withdrawn_cents: number;
  stars_balance: number;
  updated_at: string;
}

export interface GgBet {
  id: string;
  profile_id: string;
  game_id: GgGameId;
  status: GgBetStatus;
  bet_cents: number;
  payout_cents: number;
  multiplier: number;
  client_seed: string | null;
  server_seed_hash: string | null;
  server_seed: string | null;
  result: Record<string, unknown>;
  created_at: string;
  settled_at: string | null;
}

export interface GgLedgerRow {
  id: number;
  profile_id: string;
  kind: GgLedgerKind;
  amount_cents: number;
  balance_after_cents: number;
  bet_id: string | null;
  star_payment_id: string | null;
  idempotency_key: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface GgStarPayment {
  id: string;
  profile_id: string;
  telegram_payment_charge_id: string | null;
  stars_amount: number;
  usd_cents: number;
  status: GgStarStatus;
  payload: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      gg_profiles: { Row: GgProfile; Insert: Partial<GgProfile> & Pick<GgProfile, 'telegram_id'>; Update: Partial<GgProfile> };
      gg_wallets: { Row: GgWallet; Insert: Partial<GgWallet> & Pick<GgWallet, 'profile_id'>; Update: Partial<GgWallet> };
      gg_bets: { Row: GgBet; Insert: Partial<GgBet> & Pick<GgBet, 'profile_id' | 'game_id' | 'bet_cents'>; Update: Partial<GgBet> };
      gg_ledger: { Row: GgLedgerRow; Insert: Omit<GgLedgerRow, 'id' | 'created_at'> & { id?: number; created_at?: string }; Update: Partial<GgLedgerRow> };
      gg_star_payments: { Row: GgStarPayment; Insert: Partial<GgStarPayment> & Pick<GgStarPayment, 'profile_id' | 'stars_amount'>; Update: Partial<GgStarPayment> };
    };
    Views: {
      v_online_players_count: { Row: { online_count: number } };
    };
    Functions: {
      gg_ensure_profile: {
        Args: {
          p_telegram_id: number;
          p_username?: string | null;
          p_first_name?: string | null;
          p_last_name?: string | null;
          p_language_code?: string | null;
          p_referrer_telegram_id?: number | null;
        };
        Returns: string;
      };
      gg_claim_welcome_bonus: {
        Args: { p_profile_id: string };
        Returns: {
          already_claimed: boolean;
          amount_cents: number;
          balance_cents: number;
        };
      };
      gg_heartbeat: {
        Args: {
          p_profile_id: string;
          p_session_id: string;
          p_game_id?: GgGameId | null;
        };
        Returns: void;
      };
    };
  };
}

export function usdToCents(usd: number): number {
  return Math.round(Number(usd) * 100);
}

export function centsToUsd(cents: number): number {
  return Number(cents) / 100;
}
