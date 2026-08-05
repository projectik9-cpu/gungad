import React from 'react';
import {
  PAYING,
  SYMBOL_SRC,
  PAYTABLE,
  MULT_VALUE_WEIGHTS,
  BUY_BONUS_COST_MULT,
  BUY_BONUS_FS,
  RETRIGGER_SCATTERS_NEEDED,
  RETRIGGER_FS_AWARDED,
} from '../../game/slots/crimsonConfig';
import { Currency } from '../../types';
import { formatCurrency } from '../../utils/currencies';

interface PaytableModalProps {
  isOpen: boolean;
  onClose: () => void;
  betUSD: number;
  currency: Currency;
}

const SYMBOL_NAMES: Record<number, string> = {
  1: 'Black Chip',
  2: 'Red Chip',
  4: 'Ace Card',
  6: 'Diamond',
  7: 'Bullet',
  8: 'Cylinder',
  9: 'Revolver',
  10: 'Crown',
  11: 'Retrigger',
  12: 'Bomb',
};

export const PaytableModal: React.FC<PaytableModalProps> = ({
  isOpen,
  onClose,
  betUSD,
  currency,
}) => {
  if (!isOpen) return null;

  const fmt = (mult: number) => formatCurrency(mult * betUSD, currency);
  const fmtMult = (mult: number) => `×${mult}`;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto py-4 px-2"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-zinc-800 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #100308 0%, #0a0208 100%)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/70">
          <div className="font-display font-black text-base uppercase tracking-wider text-white">
            Paytable
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-900 hover:border-rose-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Cluster threshold note */}
        <div className="px-4 py-2 bg-rose-950/20 border-b border-rose-900/20">
          <p className="text-[10px] text-rose-300/70 text-center font-mono tracking-wide">
            Minimum cluster: <strong>8 symbols</strong> &nbsp;·&nbsp; Cascade tumble pays
          </p>
        </div>

        {/* Paying symbols */}
        <div className="px-3 py-3">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono mb-2 px-1">
            Paying Symbols (bet × multiplier)
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-1 items-center px-1 mb-1">
            <div /> {/* symbol icon placeholder */}
            <div className="text-center text-[9px] font-bold text-zinc-400 uppercase tracking-wider">8–9</div>
            <div className="text-center text-[9px] font-bold text-zinc-400 uppercase tracking-wider">10–11</div>
            <div className="text-center text-[9px] font-bold text-zinc-400 uppercase tracking-wider">12+</div>
          </div>

          {/* Rows: sorted high→low */}
          {[...PAYING].sort((a, b) => b - a).map(sym => {
            const row = PAYTABLE[sym];
            if (!row) return null;
            return (
              <div
                key={sym}
                className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-0.5 items-center px-1 py-1 rounded-lg odd:bg-white/[0.02]"
              >
                {/* Symbol */}
                <div className="flex items-center gap-1.5">
                  <img
                    src={SYMBOL_SRC[sym]}
                    alt={SYMBOL_NAMES[sym]}
                    className="w-8 h-8 object-contain rounded-md bg-black/40 p-0.5"
                  />
                  <span className="text-[10px] text-zinc-400 hidden sm:block w-16">{SYMBOL_NAMES[sym]}</span>
                </div>
                {/* Tiers */}
                {(['s8', 's10', 's12'] as const).map(key => (
                  <div key={key} className="text-center">
                    <div className="text-[11px] font-mono font-bold text-white">{fmtMult(row[key])}</div>
                    <div className="text-[9px] font-mono text-zinc-500">{fmt(row[key])}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Retrigger / Scatter */}
        <div className="px-3 py-3 border-t border-zinc-800/50">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono mb-2 px-1">Special Symbols</div>

          <div className="flex items-start gap-3 px-1 py-2 rounded-xl bg-rose-950/20 border border-rose-900/20">
            <div className="relative flex-shrink-0">
              <img
                src={SYMBOL_SRC[11]}
                alt="Retrigger"
                className="w-12 h-12 object-contain rounded-lg bg-black/40 p-1 retrigger-pulse"
              />
            </div>
            <div className="flex-1">
              <div className="font-black text-xs text-rose-400 uppercase tracking-wider mb-0.5">
                RETRIGGER (Scatter)
              </div>
              <div className="text-[10px] text-zinc-300 leading-relaxed">
                4+ in base game → <strong className="text-rose-300">10–15 Free Spins</strong>
                <br />
                {RETRIGGER_SCATTERS_NEEDED}+ in Free Spins →{' '}
                <strong className="text-rose-300">+{RETRIGGER_FS_AWARDED} Free Spins</strong>
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">
                Natural trigger is very rare. Buy Bonus recommended.
              </div>
            </div>
          </div>

          {/* Bomb */}
          <div className="flex items-start gap-3 px-1 py-2 rounded-xl bg-amber-950/20 border border-amber-900/20 mt-2">
            <div className="flex-shrink-0">
              <img
                src={SYMBOL_SRC[12]}
                alt="Bomb"
                className="w-12 h-12 object-contain rounded-lg bg-black/40 p-1"
              />
            </div>
            <div className="flex-1">
              <div className="font-black text-xs text-amber-400 uppercase tracking-wider mb-0.5">
                BOMB (Multiplier)
              </div>
              <div className="text-[10px] text-zinc-300 leading-relaxed mb-1">
                Lands in Free Spins only. All bomb values on the final grid multiply the round win.
              </div>
              <div className="flex flex-wrap gap-1">
                {MULT_VALUE_WEIGHTS.map(({ value, w }) => (
                  <span
                    key={value}
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-black text-amber-300 border border-amber-800/50"
                    style={{
                      background: 'rgba(30,15,0,0.7)',
                      fontSize: w >= 30 ? '11px' : w >= 12 ? '10px' : '9px',
                      opacity: w >= 30 ? 1 : w >= 12 ? 0.85 : 0.65,
                    }}
                  >
                    {value}×
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Buy Bonus */}
        <div className="px-3 py-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-3 px-1 py-2 rounded-xl bg-amber-900/10 border border-amber-800/20">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-950/50 border border-amber-800/40 flex items-center justify-center">
              <span className="text-lg">💰</span>
            </div>
            <div>
              <div className="font-black text-xs text-amber-400 uppercase tracking-wider mb-0.5">BUY BONUS</div>
              <div className="text-[10px] text-zinc-300">
                Cost: <strong className="text-amber-300">{BUY_BONUS_COST_MULT}× bet</strong> &nbsp;→&nbsp;{' '}
                <strong className="text-amber-300">{BUY_BONUS_FS} Free Spins</strong> guaranteed
              </div>
              <div className="text-[9px] text-zinc-500 mt-0.5">
                At current bet: {formatCurrency(betUSD * BUY_BONUS_COST_MULT, currency)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
