import React, { useEffect, useRef, useState } from 'react';

interface WinPanelProps {
  /** Current tumble/spin win (without bonus accumulation) */
  currentWin: number;
  /** FS counter */
  fsLeft: number;
  fsTotal: number;
  /** Bomb multiplier for this FS round */
  multFactor: number;
  /** Accumulated total win across all FS rounds */
  bonusTotal: number;
  /** Whether we are in FS mode */
  isFs: boolean;
  currency: string;
}

function fmt(v: number, cur: string) {
  return cur === 'USD' ? `$${v.toFixed(2)}` : `${v.toFixed(2)} ${cur}`;
}

export const WinPanel: React.FC<WinPanelProps> = ({
  currentWin,
  fsLeft,
  fsTotal,
  multFactor,
  bonusTotal,
  isFs,
  currency,
}) => {
  const [multKey, setMultKey] = useState(0);
  const prevMult = useRef(0);

  // Re-trigger mult animation when it changes
  useEffect(() => {
    if (multFactor !== prevMult.current) {
      prevMult.current = multFactor;
      setMultKey(k => k + 1);
    }
  }, [multFactor]);

  const showPanel = currentWin > 0 || isFs;
  if (!showPanel) return null;

  return (
    <div
      className="pointer-events-none w-full max-w-xs mx-auto"
    >
      <div
        className="rounded-2xl border overflow-hidden text-center"
        style={{
          background: 'linear-gradient(160deg, rgba(20,5,10,0.97) 0%, rgba(12,3,7,0.97) 100%)',
          borderColor: isFs ? 'rgba(251,191,36,0.35)' : 'rgba(225,29,72,0.25)',
          boxShadow: isFs
            ? '0 0 20px rgba(251,191,36,0.12)'
            : '0 0 14px rgba(225,29,72,0.1)',
        }}
      >
        {/* FS header */}
        {isFs && (
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-amber-900/30">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
              Free Spins
            </span>
            <span className="text-[11px] font-display font-black text-amber-300">
              {fsLeft}/{fsTotal}
            </span>
          </div>
        )}

        <div className="px-4 py-2 flex flex-col gap-1">
          {/* Current win */}
          {currentWin > 0 && (
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">WIN</div>
              <div
                className="font-display font-black text-xl sm:text-2xl text-rose-400 leading-tight"
                style={{ textShadow: '0 0 16px rgba(225,29,72,0.5)' }}
              >
                {fmt(currentWin, currency)}
              </div>
            </div>
          )}

          {/* Bomb multiplier */}
          {isFs && multFactor > 1 && (
            <div
              key={multKey}
              className="win-panel-mult-anim"
            >
              <div className="text-[9px] text-amber-700 uppercase tracking-widest font-mono">Multiplier</div>
              <div
                className="font-display font-black text-lg sm:text-xl text-amber-400 leading-tight"
                style={{ textShadow: '0 0 14px rgba(251,191,36,0.5)' }}
              >
                ×{multFactor}
              </div>
            </div>
          )}

          {/* FS bonus total */}
          {isFs && bonusTotal > 0 && (
            <div className="border-t border-amber-900/25 pt-1 mt-0.5">
              <div className="text-[9px] text-amber-700 uppercase tracking-widest font-mono">Bonus Total</div>
              <div className="font-display font-black text-base sm:text-lg text-amber-300 leading-tight tabular-nums">
                {fmt(bonusTotal, currency)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
