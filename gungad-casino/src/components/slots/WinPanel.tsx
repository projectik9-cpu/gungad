import React, { useEffect, useRef, useState } from 'react';
import { Currency, Language } from '../../types';
import { formatCurrency } from '../../utils/currencies';
import { t } from '../../translations';

interface WinPanelProps {
  currentWin: number;
  fsLeft: number;
  fsTotal: number;
  multFactor: number;
  bonusTotal: number;
  isFs: boolean;
  currency: Currency;
  lang: Language;
}

export const WinPanel: React.FC<WinPanelProps> = ({
  currentWin,
  fsLeft,
  fsTotal,
  multFactor,
  bonusTotal,
  isFs,
  currency,
  lang,
}) => {
  const [multKey, setMultKey] = useState(0);
  const prevMult = useRef(0);

  useEffect(() => {
    if (multFactor !== prevMult.current) {
      prevMult.current = multFactor;
      if (multFactor > 1) setMultKey(k => k + 1);
    }
  }, [multFactor]);

  const showPanel = currentWin > 0 || isFs;
  if (!showPanel) return null;

  return (
    <div className="pointer-events-none w-full max-w-xs mx-auto">
      <div
        className="rounded-xl border overflow-hidden text-center"
        style={{
          background: 'linear-gradient(160deg, rgba(20,5,10,0.97) 0%, rgba(12,3,7,0.97) 100%)',
          borderColor: isFs ? 'rgba(251,191,36,0.35)' : 'rgba(225,29,72,0.25)',
        }}
      >
        {isFs && (
          <div className="flex items-center justify-between px-3 py-1 border-b border-amber-900/30">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">
              {t('slotsFreeSpins', lang)}
            </span>
            <span className="text-[10px] font-display font-black text-amber-300">
              {fsLeft}/{fsTotal}
            </span>
          </div>
        )}

        <div className="px-3 py-1.5 flex flex-col gap-0.5">
          {currentWin > 0 && (
            <div>
              <div className="text-[8px] text-zinc-500 uppercase tracking-widest font-mono">
                {t('payout', lang)}
              </div>
              <div
                className="font-display font-black text-lg sm:text-xl text-rose-400 leading-tight"
                style={{ textShadow: '0 0 16px rgba(225,29,72,0.5)' }}
              >
                {formatCurrency(currentWin, currency)}
              </div>
            </div>
          )}

          {isFs && multFactor > 1 && (
            <div key={multKey} className="win-panel-mult-anim">
              <div className="text-[8px] text-amber-700 uppercase tracking-widest font-mono">
                {t('slotsMultiplier', lang)}
              </div>
              <div
                className="font-display font-black text-base sm:text-lg text-amber-400 leading-tight"
                style={{ textShadow: '0 0 14px rgba(251,191,36,0.5)' }}
              >
                ×{multFactor}
              </div>
            </div>
          )}

          {isFs && bonusTotal > 0 && (
            <div className="border-t border-amber-900/25 pt-0.5 mt-0.5">
              <div className="text-[8px] text-amber-700 uppercase tracking-widest font-mono">
                {t('slotsBonusTotal', lang)}
              </div>
              <div className="font-display font-black text-sm sm:text-base text-amber-300 leading-tight tabular-nums">
                {formatCurrency(bonusTotal, currency)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
