import React from 'react';
import { BUY_BONUS_COST_MULT, BUY_BONUS_FS } from '../../game/slots/crimsonConfig';
import { Currency } from '../../types';
import { formatCurrency } from '../../utils/currencies';

export type BuyBonusStep = 'none' | 'confirm' | 'congrats';

interface BuyBonusModalProps {
  step: BuyBonusStep;
  betUSD: number;
  currency: Currency;
  onConfirm: () => void;
  onCancel: () => void;
  /** Called when user taps anywhere during congrats */
  onContinue: () => void;
}

export const BuyBonusModal: React.FC<BuyBonusModalProps> = ({
  step,
  betUSD,
  currency,
  onConfirm,
  onCancel,
  onContinue,
}) => {
  if (step === 'none') return null;

  const cost = betUSD * BUY_BONUS_COST_MULT;

  if (step === 'confirm') {
    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center px-4"
        style={{ background: 'rgba(0,0,0,0.8)' }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-amber-900/50 overflow-hidden text-center"
          style={{ background: 'linear-gradient(160deg, #16090a 0%, #0d0608 100%)' }}
        >
          <div className="px-6 pt-6 pb-2">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-2xl">
              💰
            </div>
            <div className="font-display font-black text-lg text-white uppercase tracking-wider mb-1">
              Buy Bonus?
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Purchase <strong className="text-amber-300">{BUY_BONUS_FS} Free Spins</strong> for{' '}
              <strong className="text-amber-300">{formatCurrency(cost, currency)}</strong>?
            </p>
            <p className="text-zinc-500 text-[10px] mt-1">
              {BUY_BONUS_COST_MULT}× current bet of {formatCurrency(betUSD, currency)}
            </p>
          </div>

          <div className="flex gap-2 px-4 pb-5 pt-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-zinc-500 text-zinc-300 hover:text-white font-bold text-sm transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl font-black text-sm text-white active:scale-95 transition-all"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                boxShadow: '0 0 20px rgba(245,158,11,0.35)',
              }}
            >
              BUY NOW ✓
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Congrats screen
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center px-4 cursor-pointer"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onContinue}
    >
      <div className="text-center select-none slot-fs-banner-anim">
        <div
          className="font-display font-black text-4xl sm:text-5xl text-amber-400 uppercase tracking-wider mb-3"
          style={{ textShadow: '0 0 40px rgba(251,191,36,0.7), 0 0 80px rgba(251,191,36,0.35)' }}
        >
          🎰
        </div>
        <div
          className="font-display font-black text-2xl sm:text-3xl text-white uppercase tracking-wider mb-2"
          style={{ textShadow: '0 0 20px rgba(225,29,72,0.5)' }}
        >
          Congratulations!
        </div>
        <div
          className="font-display font-black text-3xl sm:text-4xl text-amber-400 uppercase tracking-wider mb-4"
          style={{ textShadow: '0 0 30px rgba(251,191,36,0.8)' }}
        >
          {BUY_BONUS_FS} Free Spins!
        </div>
        <p className="text-zinc-400 text-sm tracking-wider animate-pulse">
          Tap anywhere to continue
        </p>
      </div>
    </div>
  );
};
