import React, { useEffect, useState } from 'react';
import { SYMBOL_SRC, PAYING } from '../../game/slots/crimsonConfig';

interface Props {
  onDone: () => void;
}

const LOAD_MS = 4000;

export const GunGadPlayLoader: React.FC<Props> = ({ onDone }) => {
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Preload symbol images
    PAYING.forEach(id => {
      const img = new Image();
      img.src = SYMBOL_SRC[id];
    });
    // Scatter + bomb
    [11, 12].forEach(id => {
      const img = new Image();
      img.src = `/games/slots/crimson/${id}.png`;
    });

    // Smooth progress counter
    const start = Date.now();
    const raf = (handle: { id: number }) => {
      handle.id = requestAnimationFrame(() => {
        const elapsed = Date.now() - start;
        const p = Math.min(1, elapsed / LOAD_MS);
        setProgress(p);
        if (p < 1) raf(handle);
        else {
          setDone(true);
          setTimeout(onDone, 180);
        }
      });
    };
    const handle = { id: 0 };
    raf(handle);
    return () => cancelAnimationFrame(handle.id);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#06060a] select-none"
      style={{ backgroundImage: 'radial-gradient(ellipse at center, #1a0510 0%, #06060a 70%)' }}
    >
      {/* Logo area */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="relative">
          <div
            className="w-24 h-24 rounded-full border-2 border-rose-700/50 flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(225,29,72,0.35), inset 0 0 20px rgba(225,29,72,0.1)' }}
          >
            {/* Spinning revolver icon */}
            <svg viewBox="0 0 64 64" className="w-14 h-14 opacity-90" fill="none">
              <circle cx="32" cy="32" r="28" stroke="#e11d48" strokeWidth="2" strokeOpacity="0.4" />
              <circle cx="32" cy="32" r="8" fill="#e11d48" fillOpacity="0.2" stroke="#e11d48" strokeWidth="1.5" />
              {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                <circle
                  key={i}
                  cx={32 + 18 * Math.cos((angle * Math.PI) / 180)}
                  cy={32 + 18 * Math.sin((angle * Math.PI) / 180)}
                  r="5"
                  fill="#1a0510"
                  stroke="#e11d48"
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                />
              ))}
              <line x1="32" y1="4" x2="32" y2="12" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          {/* Glow rings */}
          <div className="absolute inset-0 rounded-full animate-ping opacity-10 border border-rose-600" />
        </div>

        <div className="text-center">
          <div
            className="font-display font-black text-3xl sm:text-4xl tracking-[0.15em] uppercase"
            style={{ color: '#f1f1f1', textShadow: '0 0 30px rgba(225,29,72,0.5)' }}
          >
            GunGad
          </div>
          <div
            className="font-display font-black text-xl sm:text-2xl tracking-[0.3em] uppercase mt-0.5"
            style={{ color: '#e11d48', textShadow: '0 0 20px rgba(225,29,72,0.7)' }}
          >
            Play
          </div>
        </div>

        <div className="text-zinc-500 text-[11px] tracking-widest uppercase font-mono">
          Crimson Cascade
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-64 sm:w-80">
        <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r from-rose-900 to-rose-500 rounded-full${done ? '' : ' loader-bar'}`}
            style={{ width: done ? '100%' : undefined }}
          />
        </div>
        <div className="mt-2 text-center text-[10px] font-mono text-zinc-600">
          {Math.round(progress * 100)}%
        </div>
      </div>
    </div>
  );
};
