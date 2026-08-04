import React from 'react';
import { Currency } from '../types';
import { t, TranslationKey } from '../translations';
import { convertCurrencyToUSD, convertUSDToCurrency, CURRENCIES } from '../utils/currencies';
import { soundFx } from '../utils/sound';
import { RotateCcw, Zap } from 'lucide-react';

interface BetControlsProps {
  betAmountUSD: number;
  onBetAmountChangeUSD: (val: number) => void;
  userBalanceUSD: number;
  currency: Currency;
  lang: any;
  disabled?: boolean;
  minBetUSD?: number;
  maxBetUSD?: number;
  lastBetUSD?: number;
  actionButtonLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionColor?: 'red' | 'green' | 'amber';
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Tighter padding for mobile game layouts */
  compact?: boolean;
}

export const BetControls: React.FC<BetControlsProps> = ({
  betAmountUSD,
  onBetAmountChangeUSD,
  userBalanceUSD,
  currency,
  lang,
  disabled = false,
  minBetUSD = 0.1,
  maxBetUSD = 1000,
  lastBetUSD,
  actionButtonLabel,
  onAction,
  actionDisabled = false,
  actionColor = 'red',
  secondaryAction,
  compact = false,
}) => {
  const currentCurrencyConfig = CURRENCIES[currency];
  const displayAmount = convertUSDToCurrency(betAmountUSD, currency);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    const usdVal = convertCurrencyToUSD(val, currency);
    onBetAmountChangeUSD(Math.max(0, usdVal));
  };

  const handleMin = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(minBetUSD);
  };

  const handleHalf = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.max(minBetUSD, betAmountUSD / 2));
  };

  const handleDouble = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, betAmountUSD * 2)));
  };

  const handle5X = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, betAmountUSD * 5)));
  };

  const handleMax = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.min(maxBetUSD, userBalanceUSD));
  };

  const handleRepeat = () => {
    soundFx.playClick();
    if (lastBetUSD && lastBetUSD > 0) {
      onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, lastBetUSD)));
    }
  };

  const buttonStyle =
    actionColor === 'red'
      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.5)] border-rose-500/50'
      : actionColor === 'green'
      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)] border-emerald-500/50'
      : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.5)] border-amber-500/50';

  return (
    <div className={`bg-[#111115] border border-rose-900/30 rounded-2xl shadow-2xl flex flex-col ${
      compact ? 'p-3 gap-2.5' : 'p-4 md:p-5 gap-4'
    }`}>
      {/* Label and Quick presets */}
      <div className="flex flex-row items-center justify-between gap-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-rose-500" />
          {t('betAmount', lang)} ({currentCurrencyConfig.symbol})
        </label>
        {lastBetUSD && lastBetUSD > 0 ? (
          <button
            onClick={handleRepeat}
            disabled={disabled}
            className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            {t('repeatBet', lang)}
          </button>
        ) : null}
      </div>

      {/* Input + Multiplier buttons */}
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-semibold">
            {currentCurrencyConfig.symbol}
          </span>
          <input
            type="number"
            step="any"
            value={displayAmount ? Number(displayAmount.toFixed(2)) : ''}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder="0.00"
            className={`w-full bg-[#0a0a0d] border border-zinc-800 focus:border-rose-600 focus:ring-1 focus:ring-rose-600 text-white font-mono font-bold rounded-xl pl-9 pr-3 outline-none transition-all disabled:opacity-50 ${
              compact ? 'text-base py-2' : 'text-lg py-2.5'
            }`}
          />
        </div>

        {/* Preset buttons */}
        <div className="grid grid-cols-5 gap-1.5 shrink-0">
          <button
            onClick={handleMin}
            disabled={disabled}
            className="px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:text-white rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {t('min', lang)}
          </button>
          <button
            onClick={handleHalf}
            disabled={disabled}
            className="px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:text-white rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {t('half', lang)}
          </button>
          <button
            onClick={handleDouble}
            disabled={disabled}
            className="px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:text-white rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {t('double', lang)}
          </button>
          <button
            onClick={handle5X}
            disabled={disabled}
            className="px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:text-white rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {t('fiveX', lang)}
          </button>
          <button
            onClick={handleMax}
            disabled={disabled}
            className="px-2 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/40 text-[11px] font-bold text-rose-400 hover:text-rose-200 rounded-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {t('max', lang)}
          </button>
        </div>
      </div>

      {/* Main Action Button */}
      {actionButtonLabel && onAction ? (
        <div className="flex gap-2">
          {secondaryAction ? (
            <button
              onClick={() => {
                soundFx.playClick();
                secondaryAction.onClick();
              }}
              disabled={secondaryAction.disabled}
              className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-display font-bold text-sm tracking-wide rounded-xl border border-zinc-700 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {secondaryAction.label}
            </button>
          ) : null}

          <button
            onClick={() => {
              soundFx.playClick();
              onAction();
            }}
            disabled={actionDisabled}
            className={`w-full font-display font-black tracking-wider uppercase rounded-xl border transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
              compact ? 'py-2.5 px-4 text-sm' : 'py-3.5 px-6 text-base'
            } ${buttonStyle}`}
          >
            {actionButtonLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
};
