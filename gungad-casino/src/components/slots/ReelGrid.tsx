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
              y="62"
              textAnchor="middle"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontWeight="900"
              fontSize="34"
              fill={`url(#${gid})`}
              style={{ paintOrder: 'stroke', stroke: '#450a0a', strokeWidth: 2 }}
            >
              777
            </text>
          </>
        )}
        {symbol === 'bar' && (
          <>
            <rect x="12" y="34" width="76" height="32" rx="6" fill="#1c1917" stroke="#fbbf24" strokeWidth="3" />
            <text
              x="50"
              y="57"
              textAnchor="middle"
              fontFamily="Impact, Haettenschweiler, sans-serif"
              fontWeight="900"
              fontSize="26"
              letterSpacing="2"
              fill="#fbbf24"
            >
              BAR
            </text>
          </>
        )}
        {symbol === 'grape' && (
          <>
            <ellipse cx="50" cy="22" rx="10" ry="6" fill="#4ade80" opacity="0.9" />
            <circle cx="38" cy="42" r="11" fill="#7c3aed" />
            <circle cx="54" cy="40" r="12" fill="#8b5cf6" />
            <circle cx="46" cy="54" r="11" fill="#6d28d9" />
            <circle cx="62" cy="54" r="10" fill="#a78bfa" />
            <circle cx="38" cy="66" r="10" fill="#5b21b6" />
            <circle cx="54" cy="68" r="11" fill="#7c3aed" />
            <circle cx="70" cy="64" r="9" fill="#8b5cf6" />
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

  // Idle sync when not mid-spin
  useEffect(() => {
    if (!spinningRef.current) {
      setStrip(finalSymbols);
      stripRef.current = finalSymbols;
      setOffsetY(0);
    }
  }, [finalSymbols]);

  useEffect(() => {
    if (spinId <= 0 || cellH <= 0) return;

    let cancelled = false;
    spinningRef.current = true;
    const landingSymbols = finalsRef.current.slice();
    const fillers = Array.from({ length: STRIP_EXTRA }, () => randomSymbol());
    const full = [...fillers, ...landingSymbols];
    stripRef.current = full;
    setStrip(full);
    setLanding(false);

    const startY = -(STRIP_EXTRA * cellH);
    setOffsetY(startY);

    const duration = spinDurationMs + colIdx * staggerMs;
    const start = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const y = startY + (0 - startY) * eased;
      setOffsetY(y);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setOffsetY(0);
        setStrip(landingSymbols);
        stripRef.current = landingSymbols;
        spinningRef.current = false;
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

  const spinning = strip.length > VISIBLE_ROWS;

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
          const visibleStart = strip.length - VISIBLE_ROWS;
          const rowInWindow = i - visibleStart;
          const isPayline =
            !spinning &&
            strip.length === VISIBLE_ROWS &&
            i === PAYLINE_ROW &&
            winLine;
          const isNearPayline =
            spinning
              ? false
              : strip.length === VISIBLE_ROWS && i !== PAYLINE_ROW;

          // 3D tilt for top/bottom when idle
          let rotateX = 0;
          if (!spinning && strip.length === VISIBLE_ROWS) {
            if (rowInWindow === 0 || i === 0) rotateX = 18;
            if (rowInWindow === 2 || i === 2) rotateX = -18;
          }

          return (
            <div
              key={`${spinId}-${colIdx}-${i}`}
              style={{
                height: cellH,
                transform: rotateX ? `perspective(420px) rotateX(${rotateX}deg)` : undefined,
                transformOrigin: i === 0 ? 'center bottom' : i === 2 ? 'center top' : 'center center',
              }}
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
    <div
      className="w-full mx-auto"
      style={{ perspective: 900, maxWidth: 440 }}
    >
      <div
        ref={wrapRef}
        className="grid gap-2 sm:gap-2.5 w-full rounded-2xl p-2 sm:p-2.5 border border-zinc-700/60"
        style={{
          gridTemplateColumns: `repeat(${REELS}, 1fr)`,
          aspectRatio: `${REELS} / ${VISIBLE_ROWS}`,
          background:
            'linear-gradient(180deg, #2a1518 0%, #120a0c 40%, #0a0a0d 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(225,29,72,0.25)',
          transform: 'rotateX(8deg)',
          transformStyle: 'preserve-3d',
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
  );
};
