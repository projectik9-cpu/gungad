import React from 'react';
import { BUY_BONUS_COST_MULT, BUY_BONUS_FS } from '../../game/slots/crimsonConfig';
import { Currency, Language } from '../../types';
import { formatCurrency } from '../../utils/currencies';
import { t } from '../../translations';

export type BuyBonusStep = 'none' | 'confirm' | 'congrats';

interface BuyBonusModalProps {
  step: BuyBonusStep;
  betUSD: number;
  currency: Currency;
  lang: Language;
  onConfirm: () => void;
  onCancel: () => void;
  onContinue: () => void;
}

export const BuyBonusModal: React.FC<BuyBonusModalProps> = ({
  step,
  betUSD,
  currency,
  lang,
  onConfirm,
  onCancel,
  onContinue,
}) => {
  if (step === 'none') return null;

  const cost = betUSD * BUY_BONUS_COST_MULT;

  if (step === 'confirm') {
    return (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center px-4"
        style={{ background: 'rgba(0,0,0,0.8)' }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-amber-900/50 overflow-hidden text-center"
          style={{ background: 'linear-gradient(160deg, #16090a 0%, #0d0608 100%)' }}
        >
          <div className="px-6 pt-6 pb-2">
            <div className="font-display font-black text-lg text-white uppercase tracking-wider mb-2">
              {t('slotsBuyBonusConfirm', lang)}
            </div>
            <p className="text-zinc-300 text-sm leading-relaxed">
              {t('slotsBuyBonusBody', lang)
                .replace('{n}', String(BUY_BONUS_FS))
                .replace('{cost}', formatCurrency(cost, currency))}
            </p>
            <p className="text-zinc-500 text-[10px] mt-1">
              {BUY_BONUS_COST_MULT}× {formatCurrency(betUSD, currency)}
            </p>
          </div>

          <div className="flex gap-2 px-4 pb-5 pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 font-bold text-sm active:scale-95"
            >
              {t('slotsCancel', lang)}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl font-black text-sm text-white active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                boxShadow: '0 0 20px rgba(245,158,11,0.35)',
              }}
            >
              {t('slotsBuyNow', lang)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4 cursor-pointer"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onContinue}
    >
      <div className="text-center select-none">
        <div
          className="font-display font-black text-2xl sm:text-3xl text-white uppercase tracking-wider mb-2"
          style={{ textShadow: '0 0 20px rgba(225,29,72,0.5)' }}
        >
          {t('slotsCongrats', lang)}
        </div>
        <div
          className="font-display font-black text-3xl sm:text-4xl text-amber-400 uppercase tracking-wider mb-4"
          style={{ textShadow: '0 0 30px rgba(251,191,36,0.8)' }}
        >
          {BUY_BONUS_FS} {t('slotsFreeSpins', lang)}!
        </div>
        <p className="text-zinc-400 text-sm tracking-wider animate-pulse">
          {t('slotsCongratsHint', lang)}
        </p>
      </div>
    </div>
  );
};
