import React from 'react';
import { BET_PRESETS, BUY_BONUS_COST_MULT } from '../../game/slots/crimsonConfig';
import { Currency, Language } from '../../types';
import { formatCurrency } from '../../utils/currencies';
import { t } from '../../translations';

interface SlotBetBarProps {
  betIndex: number;
  onChangeBetIndex: (idx: number) => void;
  balance: number;
  currency: Currency;
  lang: Language;
  /** True while a round is running (reel / cascade / FS) */
  busy: boolean;
  /** True only while reels are physically spinning */
  spinning: boolean;
  /** Idle → start spin; busy → hurry-up / turbo */
  onSpin: () => void;
  onBuyBonus: () => void;
  onOpenPaytable: () => void;
}

export const SlotBetBar: React.FC<SlotBetBarProps> = ({
  betIndex,
  onChangeBetIndex,
  balance,
  currency,
  lang,
  busy,
  spinning,
  onSpin,
  onBuyBonus,
  onOpenPaytable,
}) => {
  const bet = BET_PRESETS[betIndex];
  const bonusCost = bet * BUY_BONUS_COST_MULT;
  const canStart = !busy && balance >= bet;
  const canBuy = !busy && balance >= bonusCost;
  // Spin always clickable when busy (turbo) or when can start
  const spinEnabled = busy || canStart;

  const decBet = () => onChangeBetIndex(Math.max(0, betIndex - 1));
  const incBet = () => onChangeBetIndex(Math.min(BET_PRESETS.length - 1, betIndex + 1));

  return (
    <div
      className="relative flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl border border-zinc-800/60"
      style={{ background: 'linear-gradient(180deg, #111116 0%, #0d0d11 100%)' }}
    >
      {/* Balance */}
      <div className="flex flex-col items-start min-w-0 shrink-0 max-w-[72px] sm:max-w-none">
        <span className="text-[8px] sm:text-[9px] text-zinc-600 uppercase tracking-widest font-mono">
          {t('slotsBalance', lang)}
        </span>
        <span className="text-[11px] sm:text-[13px] font-mono font-bold text-zinc-200 tabular-nums leading-tight truncate w-full">
          {formatCurrency(balance, currency)}
        </span>
      </div>

      {/* Bet +/- */}
      <div className="flex-1 flex items-center justify-center gap-1 sm:gap-1.5 min-w-0">
        <button
          type="button"
          onClick={decBet}
          disabled={busy || betIndex === 0}
          className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-full border border-zinc-700 bg-zinc-900 hover:border-rose-700 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-zinc-300"><rect x="4" y="9" width="12" height="2" rx="1" /></svg>
        </button>

        <div className="flex flex-col items-center min-w-[48px] sm:min-w-[64px] px-0.5">
          <span className="text-[8px] sm:text-[9px] text-zinc-600 uppercase tracking-widest font-mono">
            {t('slotsBet', lang)}
          </span>
          <span className="text-xs sm:text-base font-display font-black text-white tabular-nums leading-tight">
            {formatCurrency(bet, currency)}
          </span>
        </div>

        <button
          type="button"
          onClick={incBet}
          disabled={busy || betIndex === BET_PRESETS.length - 1}
          className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-full border border-zinc-700 bg-zinc-900 hover:border-rose-700 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-zinc-300">
            <rect x="9" y="4" width="2" height="12" rx="1" />
            <rect x="4" y="9" width="12" height="2" rx="1" />
          </svg>
        </button>
      </div>

      {/* Spin — smaller on mobile so it fits above safe area */}
      <button
        type="button"
        onClick={onSpin}
        disabled={!spinEnabled}
        className="relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center active:scale-95 transition-all duration-150 disabled:opacity-40"
        style={{
          background: spinEnabled
            ? busy
              ? 'radial-gradient(circle at 35% 35%, #fbbf24, #d97706)'
              : 'radial-gradient(circle at 35% 35%, #f43f5e, #9f1239)'
            : 'radial-gradient(circle at 35% 35%, #52525b, #27272a)',
          boxShadow: spinEnabled
            ? busy
              ? '0 0 0 2px rgba(251,191,36,0.35), 0 3px 14px rgba(251,191,36,0.4)'
              : '0 0 0 2px rgba(225,29,72,0.3), 0 3px 14px rgba(225,29,72,0.45)'
            : 'none',
        }}
        aria-label={busy ? t('slotsSpeedUp', lang) : t('slotsSpin', lang)}
      >
        {spinning ? (
          <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : busy ? (
          <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-9-9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 3v9h-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Buy + info */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          type="button"
          onClick={onBuyBonus}
          disabled={!canBuy}
          className="flex flex-col items-center px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-amber-800/60 bg-amber-950/40 hover:border-amber-600 active:scale-95 transition-all disabled:opacity-30"
        >
          <span className="text-[8px] sm:text-[9px] font-black tracking-wider uppercase text-amber-400">
            {t('slotsBuyBonus', lang)}
          </span>
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-amber-300 tabular-nums">
            {formatCurrency(bonusCost, currency)}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenPaytable}
          className="w-7 h-7 rounded-lg border border-zinc-700 bg-zinc-900 hover:border-rose-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center"
          title={t('slotsPaytable', lang)}
        >
          <span className="text-[11px] font-bold">i</span>
        </button>
      </div>
    </div>
  );
};
