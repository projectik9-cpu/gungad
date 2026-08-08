import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BanditSymbol,
  PAYLINE_ROW,
  REELS,
  SYMBOL_COLOR,
  SYMBOL_LABEL,
  SYMBOLS,
  VISIBLE_ROWS,
} from '../../game/slots/banditConfig';

const STRIP_EXTRA = 28;

interface ReelGridProps {
  grid: BanditSymbol[];
  spinning: boolean;
  stoppedCols: Set<number>;
  winLine: boolean;
  spinDurationMs?: number;
}

function randomSymbol(): BanditSymbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function SymbolFace({
  symbol,
  highlight,
}: {
  symbol: BanditSymbol;
  highlight: boolean;
}) {
  const color = SYMBOL_COLOR[symbol];
  const label = SYMBOL_LABEL[symbol];
  const isEmoji = symbol === 'grape' || symbol === 'lemon';

  return (
    <div
      className={[
        'relative w-full h-full rounded-lg overflow-hidden flex items-center justify-center border',
        highlight
          ? 'border-rose-400 bg-rose-950/40 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
          : 'border-zinc-800/80 bg-[#0c0c10]',
      ].join(' ')}
    >
      {isEmoji ? (
        <span className="text-[clamp(1.6rem,7vw,2.8rem)] leading-none select-none drop-shadow-md">
          {label}
        </span>
      ) : (
        <span
          className="font-display font-black tracking-tight select-none"
          style={{
            color,
            fontSize: symbol === 'seven' ? 'clamp(1.1rem,5vw,1.85rem)' : 'clamp(0.95rem,4.2vw,1.55rem)',
            textShadow: `0 0 14px ${color}99, 0 1px 0 #000`,
          }}
        >
          {label}
        </span>
      )}
      {highlight && (
        <div className="absolute inset-0 pointer-events-none bg-rose-400/10 rounded-lg" />
      )}
    </div>
  );
}

interface ColProps {
  colIdx: number;
  symbols: BanditSymbol[];
  isSpinning: boolean;
  isStopped: boolean;
  winLine: boolean;
  spinDurationMs: number;
  cellH: number;
}

const ReelCol: React.FC<ColProps> = ({
  colIdx,
  symbols,
  isSpinning,
  isStopped,
  winLine,
  spinDurationMs,
  cellH,
}) => {
  const [strip, setStrip] = useState<BanditSymbol[]>(symbols);
  const [offsetY, setOffsetY] = useState(0);
  const [blur, setBlur] = useState(false);
  const animating = useRef(false);

  useEffect(() => {
    if (!isSpinning || isStopped || cellH <= 0) return;
    animating.current = true;
    const fillers = Array.from({ length: STRIP_EXTRA }, () => randomSymbol());
    const full = [...fillers, ...symbols];
    setStrip(full);
    const startY = -(STRIP_EXTRA * cellH);
    setOffsetY(startY);
    setBlur(true);

    const duration = spinDurationMs + colIdx * 180;
    const el = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOffsetY(0);
      });
    });

    const clearBlur = window.setTimeout(() => setBlur(false), Math.max(0, duration - 220));
    const land = window.setTimeout(() => {
      animating.current = false;
      setStrip(symbols);
      setOffsetY(0);
    }, duration + 40);

    return () => {
      cancelAnimationFrame(el);
      clearTimeout(clearBlur);
      clearTimeout(land);
    };
  }, [isSpinning, isStopped, cellH, spinDurationMs, colIdx, symbols]);

  useEffect(() => {
    if (!isSpinning && !animating.current) {
      setStrip(symbols);
      setOffsetY(0);
      setBlur(false);
    }
  }, [symbols, isSpinning]);

  const duration = spinDurationMs + colIdx * 180;

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-black/40 h-full">
      <div
        className="absolute inset-x-0 will-change-transform"
        style={{
          transform: `translate3d(0, ${offsetY}px, 0)`,
          transition: isSpinning && !isStopped
            ? `transform ${duration}ms cubic-bezier(0.12, 0.75, 0.18, 1)`
            : 'none',
          filter: blur ? 'blur(1.5px)' : 'none',
        }}
      >
        {strip.map((sym, i) => {
          const isPaylineCell =
            !isSpinning &&
            strip.length === VISIBLE_ROWS &&
            i === PAYLINE_ROW &&
            winLine;
          return (
            <div key={`${colIdx}-${i}-${sym}`} style={{ height: cellH }} className="p-1">
              <SymbolFace symbol={sym} highlight={Boolean(isPaylineCell)} />
            </div>
          );
        })}
      </div>
      {/* Payline guide */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 border-y border-rose-500/50"
        style={{
          top: PAYLINE_ROW * cellH,
          height: cellH,
          boxShadow: 'inset 0 0 20px rgba(244,63,94,0.15)',
        }}
      />
    </div>
  );
};

export const ReelGrid: React.FC<ReelGridProps> = ({
  grid,
  spinning,
  stoppedCols,
  winLine,
  spinDurationMs = 2200,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      setCellH(h / VISIBLE_ROWS);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="grid gap-1.5 sm:gap-2 w-full mx-auto"
      style={{
        gridTemplateColumns: `repeat(${REELS}, 1fr)`,
        aspectRatio: `${REELS} / ${VISIBLE_ROWS}`,
        maxWidth: 420,
      }}
    >
      {Array.from({ length: REELS }, (_, col) => {
        const symbols = Array.from(
          { length: VISIBLE_ROWS },
          (_, row) => grid[col * VISIBLE_ROWS + row],
        );
        return (
          <ReelCol
            key={col}
            colIdx={col}
            symbols={symbols}
            isSpinning={spinning}
            isStopped={stoppedCols.has(col)}
            winLine={winLine}
            spinDurationMs={spinDurationMs}
            cellH={cellH || 80}
          />
        );
      })}
    </div>
  );
};
