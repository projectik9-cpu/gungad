import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BanditSymbol,
  PAYLINE_ROW,
  REELS,
  SYMBOLS,
  VISIBLE_ROWS,
} from '../../game/slots/banditConfig';

const STRIP_EXTRA = 36;

interface ReelGridProps {
  /** Final 3×3 grid (col-major). Must be set BEFORE spinId increments. */
  grid: BanditSymbol[];
  /** Increment to start a spin using current `grid` as the locked landing. */
  spinId: number;
  winLine: boolean;
  spinDurationMs?: number;
  staggerMs?: number;
  onReelStop?: (col: number) => void;
  onSpinComplete?: () => void;
}

function randomSymbol(): BanditSymbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Crisp vector faces — no emoji blur */
export const SymbolFace: React.FC<{
  symbol: BanditSymbol;
  highlight?: boolean;
  dim?: boolean;
}> = ({ symbol, highlight = false, dim = false }) => {
  const gid = useRef(`sym-${Math.random().toString(36).slice(2, 9)}`).current;

  return (
    <div
      className={[
        'relative w-full h-full rounded-lg overflow-hidden flex items-center justify-center border transition-shadow',
        highlight
          ? 'border-rose-400 bg-gradient-to-b from-rose-950/70 to-[#12080c] shadow-[0_0_22px_rgba(244,63,94,0.55)]'
          : 'border-zinc-700/80 bg-gradient-to-b from-[#16161c] to-[#0a0a0e]',
        dim ? 'opacity-55' : 'opacity-100',
      ].join(' ')}
    >
      <svg viewBox="0 0 100 100" className="w-[86%] h-[86%] select-none" aria-hidden>
        {symbol === 'seven' && (
          <>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>
            </defs>
            <text
              x="50"
              y="72"
              textAnchor="middle"
              fontFamily="Impact, Haettenschweiler, sans-serif"
              fontWeight="900"
              fontSize="72"
              fill={`url(#${gid})`}
              style={{ paintOrder: 'stroke', stroke: '#450a0a', strokeWidth: 3 }}
            >
              7
            </text>
          </>
        )}
        {symbol === 'bar' && (
          <>
            <rect x="10" y="22" width="80" height="22" rx="4" fill="#78350f" stroke="#fbbf24" strokeWidth="2.5" />
            <rect x="10" y="48" width="80" height="22" rx="4" fill="#1c1917" stroke="#f59e0b" strokeWidth="2.5" />
            <text x="50" y="39" textAnchor="middle" fontFamily="Impact, sans-serif" fontWeight="900" fontSize="14" fill="#fde68a">BAR</text>
            <text x="50" y="65" textAnchor="middle" fontFamily="Impact, sans-serif" fontWeight="900" fontSize="14" fill="#fbbf24">BAR</text>
          </>
        )}
        {symbol === 'grape' && (
          <>
            <path d="M48 14 C52 18, 62 22, 58 30" fill="none" stroke="#4d7c0f" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="62" cy="24" rx="8" ry="4" fill="#65a30d" transform="rotate(20 62 24)" />
            <circle cx="36" cy="44" r="13" fill="#6d28d9" />
            <circle cx="54" cy="40" r="14" fill="#8b5cf6" />
            <circle cx="68" cy="50" r="12" fill="#7c3aed" />
            <circle cx="42" cy="60" r="13" fill="#5b21b6" />
            <circle cx="58" cy="64" r="13" fill="#7c3aed" />
            <circle cx="72" cy="66" r="10" fill="#a78bfa" />
            <circle cx="40" cy="74" r="10" fill="#4c1d95" />
            <circle cx="50" cy="48" r="6" fill="#c4b5fd" opacity="0.45" />
          </>
        )}
        {symbol === 'lemon' && (
          <>
            <ellipse cx="50" cy="52" rx="34" ry="26" fill="#facc15" stroke="#ca8a04" strokeWidth="2" />
            <ellipse cx="50" cy="52" rx="26" ry="18" fill="#fde047" opacity="0.55" />
            <path d="M50 22 C58 28, 60 34, 56 38" fill="none" stroke="#65a30d" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="56" cy="28" rx="7" ry="4" fill="#4d7c0f" transform="rotate(25 56 28)" />
          </>
        )}
      </svg>
      {highlight && (
        <div className="absolute inset-0 pointer-events-none rounded-lg ring-2 ring-rose-400/70 animate-pulse" />
      )}
    </div>
  );
};

interface ColProps {
  colIdx: number;
  finalSymbols: BanditSymbol[];
  spinId: number;
  winLine: boolean;
  spinDurationMs: number;
  staggerMs: number;
  cellH: number;
  onStopped: (col: number) => void;
}

const ReelCol: React.FC<ColProps> = ({
  colIdx,
  finalSymbols,
  spinId,
  winLine,
  spinDurationMs,
  staggerMs,
  cellH,
  onStopped,
}) => {
  const [strip, setStrip] = useState<BanditSymbol[]>(finalSymbols);
  const [offsetY, setOffsetY] = useState(0);
  const [landing, setLanding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const stripRef = useRef<BanditSymbol[]>(finalSymbols);
  const finalsRef = useRef(finalSymbols);
  finalsRef.current = finalSymbols;
  const spinningRef = useRef(false);
  const [spinning, setSpinning] = useState(false);

  // Lock spinning BEFORE the idle-sync effect can paint the final grid.
  useLayoutEffect(() => {
    if (spinId > 0) spinningRef.current = true;
  }, [spinId]);

  useEffect(() => {
    if (spinningRef.current) return;
    setStrip(finalSymbols);
    stripRef.current = finalSymbols;
    setOffsetY(0);
  }, [finalSymbols]);

  useEffect(() => {
    if (spinId <= 0 || cellH <= 0) return;

    let cancelled = false;
    spinningRef.current = true;
    setSpinning(true);
    const landingSymbols = finalsRef.current.slice();
    const fillers = Array.from({ length: STRIP_EXTRA }, () => randomSymbol());
    const full = [...fillers, ...landingSymbols];
    stripRef.current = full;
    setStrip(full);
    setLanding(false);

    // Scroll from random fillers (y=0) down onto the locked landing — never swap the strip.
    const startY = 0;
    const endY = -(STRIP_EXTRA * cellH);
    setOffsetY(startY);

    const duration = spinDurationMs + colIdx * staggerMs;
    const start = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setOffsetY(startY + (endY - startY) * eased);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setOffsetY(endY);
        spinningRef.current = false;
        setSpinning(false);
        setLanding(true);
        onStopped(colIdx);
        window.setTimeout(() => {
          if (!cancelled) setLanding(false);
        }, 380);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spinId, cellH, colIdx, spinDurationMs, staggerMs, onStopped]);

  return (
    <div
      className={[
        'relative overflow-hidden h-full rounded-xl border-2',
        'bg-gradient-to-b from-zinc-900 via-black to-zinc-900',
        'border-zinc-600/80 shadow-[inset_0_0_24px_rgba(0,0,0,0.85)]',
        landing ? 'reel-landed' : '',
      ].join(' ')}
      style={{
        transformStyle: 'preserve-3d',
        transform: 'translateZ(0)',
      }}
    >
      {/* Cylinder edge shading */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[18%] bg-gradient-to-b from-black/80 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[18%] bg-gradient-to-t from-black/80 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[10%] bg-gradient-to-r from-black/50 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-[10%] bg-gradient-to-l from-black/50 to-transparent"
        aria-hidden
      />

      <div
        className="absolute inset-x-0 will-change-transform"
        style={{
          transform: `translate3d(0, ${offsetY}px, 0)`,
        }}
      >
        {strip.map((sym, i) => {
          const visibleStart =
            strip.length > VISIBLE_ROWS ? STRIP_EXTRA : 0;
          const isVisible = i >= visibleStart && i < visibleStart + VISIBLE_ROWS;
          const rowInWindow = i - visibleStart;
          const isPayline = !spinning && isVisible && rowInWindow === PAYLINE_ROW && winLine;
          const isNearPayline = !spinning && isVisible && rowInWindow !== PAYLINE_ROW;

          return (
            <div
              key={`${spinId}-${colIdx}-${i}`}
              style={{ height: cellH }}
              className="p-1.5"
            >
              <SymbolFace
                symbol={sym}
                highlight={Boolean(isPayline)}
                dim={Boolean(isNearPayline)}
              />
            </div>
          );
        })}
      </div>

      {/* Payline window */}
      <div
        className="pointer-events-none absolute inset-x-0 z-30 border-y-2 border-rose-500/70"
        style={{
          top: PAYLINE_ROW * cellH,
          height: cellH,
          boxShadow: 'inset 0 0 28px rgba(244,63,94,0.22), 0 0 12px rgba(244,63,94,0.25)',
        }}
      />
    </div>
  );
};

export const ReelGrid: React.FC<ReelGridProps> = ({
  grid,
  spinId,
  winLine,
  spinDurationMs = 2600,
  staggerMs = 220,
  onReelStop,
  onSpinComplete,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(0);
  const stoppedRef = useRef<Set<number>>(new Set());
  const onReelStopRef = useRef(onReelStop);
  const onSpinCompleteRef = useRef(onSpinComplete);
  onReelStopRef.current = onReelStop;
  onSpinCompleteRef.current = onSpinComplete;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setCellH(el.clientHeight / VISIBLE_ROWS);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (spinId > 0) stoppedRef.current = new Set();
  }, [spinId]);

  const handleStopped = useRef((col: number) => {
    onReelStopRef.current?.(col);
    stoppedRef.current.add(col);
    if (stoppedRef.current.size >= REELS) {
      onSpinCompleteRef.current?.();
    }
  }).current;

  return (
    <div className="w-full mx-auto" style={{ maxWidth: 480 }}>
      <div
        className="rounded-[1.4rem] p-[10px] sm:p-3"
        style={{
          background:
            'linear-gradient(180deg, #6b3a12 0%, #3d220c 18%, #1a0e08 55%, #12080c 100%)',
          boxShadow:
            '0 24px 50px rgba(0,0,0,0.65), inset 0 1px 0 rgba(251,191,36,0.35), 0 0 0 2px #92400e',
        }}
      >
        <div
          className="mb-2 sm:mb-2.5 rounded-lg py-1.5 text-center border border-amber-700/50"
          style={{
            background: 'linear-gradient(90deg, #7f1d1d, #b45309, #7f1d1d)',
            boxShadow: '0 0 18px rgba(245,158,11,0.35)',
          }}
        >
          <span className="font-display font-black text-[11px] sm:text-sm tracking-[0.28em] text-amber-100 uppercase">
            GUN GAD
          </span>
        </div>
      <div
        ref={wrapRef}
        className="grid gap-1.5 sm:gap-2 w-full rounded-xl p-2 sm:p-2.5 border-2 border-zinc-800"
        style={{
          gridTemplateColumns: `repeat(${REELS}, 1fr)`,
          aspectRatio: `${REELS} / ${VISIBLE_ROWS}`,
          background: 'linear-gradient(180deg, #0a0a0e 0%, #050506 100%)',
          boxShadow: 'inset 0 0 28px rgba(0,0,0,0.85)',
        }}
      >
        {Array.from({ length: REELS }, (_, col) => {
          const finalSymbols = Array.from(
            { length: VISIBLE_ROWS },
            (_, row) => grid[col * VISIBLE_ROWS + row],
          );
          return (
            <ReelCol
              key={col}
              colIdx={col}
              finalSymbols={finalSymbols}
              spinId={spinId}
              winLine={winLine}
              spinDurationMs={spinDurationMs}
              staggerMs={staggerMs}
              cellH={cellH || 88}
              onStopped={handleStopped}
            />
          );
        })}
      </div>
      </div>
    </div>
  );
};
