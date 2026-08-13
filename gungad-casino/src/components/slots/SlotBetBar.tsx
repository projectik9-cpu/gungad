import React from 'react';
import { BET_PRESETS } from '../../game/slots/banditConfig';
import { Currency, Language } from '../../types';
import { formatCurrency } from '../../utils/currencies';
import { t } from '../../translations';

interface SlotBetBarProps {
  betIndex: number;
  onChangeBetIndex: (idx: number) => void;
  balance: number;
  currency: Currency;
  lang: Language;
  busy: boolean;
  spinning: boolean;
  onSpin: () => void;
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
  onOpenPaytable,
}) => {
  const bet = BET_PRESETS[betIndex];
  const canStart = !busy && balance >= bet;
  const spinEnabled = busy || canStart;

  const decBet = () => onChangeBetIndex(Math.max(0, betIndex - 1));
  const incBet = () => onChangeBetIndex(Math.min(BET_PRESETS.length - 1, betIndex + 1));

  return (
    <div
      className="relative flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-2 sm:py-3 rounded-xl sm:rounded-2xl border-2 border-amber-800/50"
      style={{
        background: 'linear-gradient(180deg, #2a1810 0%, #120c0e 100%)',
        boxShadow: 'inset 0 1px 0 rgba(251,191,36,0.25), 0 8px 24px rgba(0,0,0,0.45)',
      }}
    >
      <div className="flex flex-col items-start min-w-0 shrink-0 max-w-[72px] sm:max-w-none">
        <span className="text-[8px] sm:text-[9px] text-zinc-600 uppercase tracking-widest font-mono">
          {t('slotsBalance', lang)}
        </span>
        <span className="text-[11px] sm:text-[13px] font-mono font-bold text-zinc-200 tabular-nums leading-tight truncate w-full">
          {formatCurrency(balance, currency)}
        </span>
      </div>

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
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-zinc-300"><rect x="4" y="9" width="12" height="2" rx="1" /><rect x="9" y="4" width="2" height="12" rx="1" /></svg>
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenPaytable}
        disabled={busy}
        className="hidden sm:flex px-2.5 py-2 rounded-xl border border-zinc-700 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40"
      >
        {t('slotsPaytable', lang)}
      </button>

      <button
        type="button"
        onClick={onSpin}
        disabled={!spinEnabled}
        className={[
          'shrink-0 min-w-[88px] sm:min-w-[110px] px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-display font-black text-sm sm:text-base uppercase tracking-wide transition-all active:scale-95',
          spinning
            ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            : canStart
            ? 'bg-rose-600 text-white shadow-[0_0_24px_rgba(225,29,72,0.45)] hover:bg-rose-500'
            : 'bg-zinc-800 text-zinc-500 border border-zinc-700 opacity-50',
        ].join(' ')}
      >
        {spinning ? t('slotsSpinning', lang) : t('slotsSpin', lang)}
      </button>
    </div>
  );
};
