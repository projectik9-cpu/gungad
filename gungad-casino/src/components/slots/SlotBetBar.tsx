import React from 'react';
import { BET_PRESETS, BUY_BONUS_COST_MULT } from '../../game/slots/crimsonConfig';
import { Currency } from '../../types';
import { formatCurrency } from '../../utils/currencies';

interface SlotBetBarProps {
  betIndex: number;
  onChangeBetIndex: (idx: number) => void;
  balance: number;
  currency: Currency;
  spinning: boolean;
  onSpin: () => void;
  onBuyBonus: () => void;
  onOpenPaytable: () => void;
}

export const SlotBetBar: React.FC<SlotBetBarProps> = ({
  betIndex,
  onChangeBetIndex,
  balance,
  currency,
  spinning,
  onSpin,
  onBuyBonus,
  onOpenPaytable,
}) => {
  const bet = BET_PRESETS[betIndex];
  const bonusCost = bet * BUY_BONUS_COST_MULT;
  const canSpin = !spinning && balance >= bet;
  const canBuy = !spinning && balance >= bonusCost;

  const decBet = () => onChangeBetIndex(Math.max(0, betIndex - 1));
  const incBet = () => onChangeBetIndex(Math.min(BET_PRESETS.length - 1, betIndex + 1));

  return (
    <div
      className="relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl border border-zinc-800/60"
      style={{ background: 'linear-gradient(180deg, #111116 0%, #0d0d11 100%)' }}
    >
      {/* Balance display */}
      <div className="flex flex-col items-start min-w-0 flex-shrink-0">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono">Balance</span>
        <span className="text-[13px] font-mono font-bold text-zinc-200 tabular-nums leading-tight">
          {formatCurrency(balance, currency)}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2">
        {/* Bet - */}
        <button
          onClick={decBet}
          disabled={spinning || betIndex === 0}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-zinc-700 bg-zinc-900 hover:border-rose-700 hover:bg-zinc-800 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4 fill-zinc-300"><rect x="4" y="9" width="12" height="2" rx="1" /></svg>
        </button>

        {/* Bet display */}
        <div className="flex flex-col items-center min-w-[56px]">
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono">Bet</span>
          <span className="text-sm sm:text-base font-display font-black text-white tabular-nums leading-tight">
            {formatCurrency(bet, currency)}
          </span>
        </div>

        {/* Bet + */}
        <button
          onClick={incBet}
          disabled={spinning || betIndex === BET_PRESETS.length - 1}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-zinc-700 bg-zinc-900 hover:border-rose-700 hover:bg-zinc-800 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4 fill-zinc-300">
            <rect x="9" y="4" width="2" height="12" rx="1" />
            <rect x="4" y="9" width="12" height="2" rx="1" />
          </svg>
        </button>
      </div>

      {/* SPIN button — round, no text */}
      <button
        onClick={onSpin}
        disabled={!canSpin}
        className="relative flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: canSpin
            ? 'radial-gradient(circle at 35% 35%, #f43f5e, #9f1239)'
            : 'radial-gradient(circle at 35% 35%, #52525b, #27272a)',
          boxShadow: canSpin
            ? '0 0 0 3px rgba(225,29,72,0.3), 0 4px 20px rgba(225,29,72,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 0 0 2px rgba(82,82,91,0.3)',
        }}
        aria-label="Spin"
      >
        {spinning ? (
          /* Spinning indicator */
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6 sm:w-7 sm:h-7 animate-spin"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
          >
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : (
          /* Static arrow icon */
          <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-9-9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 3v9h-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {/* Shine */}
        <div className="absolute top-1 left-2 w-5 h-2 rounded-full bg-white/20 blur-[2px] rotate-[-20deg] pointer-events-none" />
      </button>

      {/* Right side: Buy Bonus + Paytable */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {/* Buy Bonus */}
        <button
          onClick={onBuyBonus}
          disabled={!canBuy}
          className="flex flex-col items-center px-2.5 py-1 rounded-lg border border-amber-800/60 bg-amber-950/40 hover:border-amber-600 hover:bg-amber-900/30 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="text-[9px] font-black tracking-wider uppercase text-amber-400">BUY BONUS</span>
          <span className="text-[10px] font-mono font-bold text-amber-300 tabular-nums">
            {formatCurrency(bonusCost, currency)}
          </span>
        </button>

        {/* Paytable */}
        <button
          onClick={onOpenPaytable}
          className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-900 hover:border-rose-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center"
          title="Paytable"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <text x="10" y="14.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="currentColor">i</text>
          </svg>
        </button>
      </div>
    </div>
  );
};
