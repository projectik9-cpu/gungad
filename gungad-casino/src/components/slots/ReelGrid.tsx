import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  COLS,
  ROWS,
  PAYING,
  SCATTER,
  MULT,
  SYMBOL_SRC,
} from '../../game/slots/crimsonConfig';
import { CellState } from '../../game/slots/crimsonEngine';

/** Random fillers above the final band */
const STRIP_EXTRA = 16;
/** Last N filler rows are copies of finals so slowdown matches the stop */
const PREVIEW_ROWS = 2;

interface ReelGridProps {
  grid: CellState[];
  spinning: boolean;
  stoppedCols: Set<number>;
  winCells: Set<number>;
  explodeCells: Set<number>;
  spinDurationMs?: number;
  gridRef?: React.RefObject<HTMLDivElement | null>;
}

function randomPaying(): CellState {
  return { symbol: PAYING[Math.floor(Math.random() * PAYING.length)] };
}

function CellFace({
  cell,
  isWin,
  isExplode,
  showLabels,
}: {
  cell: CellState;
  isWin: boolean;
  isExplode: boolean;
  showLabels: boolean;
}) {
  const isScatter = cell.symbol === SCATTER;
  const isBomb = cell.symbol === MULT;

  return (
    <div
      className={[
        'relative w-full h-full rounded-md overflow-hidden bg-[#0a0a0d] border',
        isWin && !isExplode ? 'cell-winning border-rose-400' : 'border-zinc-800/70',
        isExplode ? 'cell-exploding' : '',
        isScatter ? 'border-rose-800/60' : '',
        isBomb ? 'border-amber-800/60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src={SYMBOL_SRC[cell.symbol]}
        alt=""
        draggable={false}
        className={[
          'w-full h-full object-contain select-none p-[3%]',
          isScatter && showLabels ? 'scale-[1.1] retrigger-pulse' : '',
          isWin && !isExplode ? 'brightness-125 saturate-150' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {isBomb && showLabels && cell.multValue != null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingTop: '42%' }}>
          <span
            className="font-display font-black text-[11px] sm:text-[14px] leading-none text-amber-300"
            style={{ textShadow: '0 0 8px rgba(251,191,36,0.9), 0 1px 0 #000' }}
          >
            {cell.multValue}×
          </span>
        </div>
      )}
      {isScatter && showLabels && (
        <div className="absolute bottom-0 inset-x-0 text-center pointer-events-none pb-0.5">
          <span
            className="text-[6px] sm:text-[7px] font-black tracking-widest uppercase text-rose-300"
            style={{ textShadow: '0 0 6px rgba(225,29,72,0.8), 0 1px 0 #000' }}
          >
            RETRIGGER
          </span>
        </div>
      )}
      {isWin && !isExplode && (
        <div className="absolute inset-0 pointer-events-none bg-rose-400/10 rounded-md" />
      )}
    </div>
  );
}

interface ColProps {
  colIdx: number;
  colSymbols: CellState[];
  isSpinning: boolean;
  isStopped: boolean;
  winCells: Set<number>;
  explodeCells: Set<number>;
  spinDurationMs: number;
}

const ReelColumn: React.FC<ColProps> = ({
  colIdx,
  colSymbols,
  isSpinning,
  isStopped,
  winCells,
  explodeCells,
  spinDurationMs,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(0);
  const [strip, setStrip] = useState<CellState[]>(() => [...colSymbols]);
  const [offsetY, setOffsetY] = useState(0);
  const [transition, setTransition] = useState('none');
  const [landed, setLanded] = useState(false);
  const wasSpinning = useRef(false);
  const spinGen = useRef(0);
  const finalsRef = useRef<CellState[]>(colSymbols);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight / ROWS;
      if (h > 0) setCellH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Capture finals when a new spin starts (before strip anim)
  useEffect(() => {
    if (isSpinning && !isStopped) {
      finalsRef.current = colSymbols.map(c => ({ ...c }));
    }
  }, [isSpinning, isStopped, colSymbols]);

  // Start spin animation once per spin
  useEffect(() => {
    if (!isSpinning || isStopped || cellH <= 0) return;
    if (wasSpinning.current) return; // already animating this spin

    wasSpinning.current = true;
    spinGen.current += 1;
    const gen = spinGen.current;
    setLanded(false);

    const finals = finalsRef.current.length === ROWS
      ? finalsRef.current
      : colSymbols;

    // Random fillers, then preview copies of finals, then exact finals
    const randomCount = Math.max(0, STRIP_EXTRA - PREVIEW_ROWS);
    const randoms = Array.from({ length: randomCount }, () => randomPaying());
    const preview = finals.slice(0, PREVIEW_ROWS).map(c => ({ ...c }));
    const full = [...randoms, ...preview, ...finals];
    setStrip(full);

    const startY = -((randomCount + PREVIEW_ROWS) * cellH);
    setTransition('none');
    setOffsetY(startY);

    const duration = Math.max(400, spinDurationMs);

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        if (spinGen.current !== gen) return;
        // Softer ease — finals visible longer during slowdown
        setTransition(`transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`);
        setOffsetY(0);
      });
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isSpinning, isStopped, cellH, spinDurationMs, colIdx, colSymbols]);

  // Stop: lock offset only — do NOT remount/replace strip (avoids symbol swap)
  useEffect(() => {
    if (isSpinning && !isStopped) return;

    if (wasSpinning.current && isStopped) {
      wasSpinning.current = false;
      setTransition('none');
      setOffsetY(0);
      // Keep strip as-is (ends with finals). Only bounce.
      setLanded(true);
      const t = window.setTimeout(() => setLanded(false), 420);
      return () => clearTimeout(t);
    }

    // Idle cascade updates — show settled grid as simple 5-row strip
    if (!isSpinning) {
      wasSpinning.current = false;
      setTransition('none');
      setOffsetY(0);
      setStrip(colSymbols.map(c => ({ ...c })));
    }
  }, [isSpinning, isStopped, colSymbols]);

  const activelySpinning = isSpinning && !isStopped;
  const showLabels = !activelySpinning;

  return (
    <div
      ref={viewportRef}
      className={`relative overflow-hidden rounded-md${landed ? ' reel-landed' : ''}`}
      style={{ height: '100%', willChange: activelySpinning ? 'transform' : 'auto' }}
    >
      <div
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translate3d(0, ${offsetY}px, 0)`,
          transition,
          height: cellH > 0 ? cellH * strip.length : '100%',
        }}
      >
        {strip.map((cell, i) => {
          const inFinalBand = i >= strip.length - ROWS;
          const rowIdx = inFinalBand ? i - (strip.length - ROWS) : -1;
          const cellIdx = rowIdx >= 0 ? rowIdx * COLS + colIdx : -1;
          const isWin = cellIdx >= 0 && winCells.has(cellIdx);
          const isExplode = cellIdx >= 0 && explodeCells.has(cellIdx);

          return (
            <div
              key={`s${spinGen.current}-${i}`}
              className="shrink-0 w-full"
              style={{ height: cellH > 0 ? cellH : `${100 / ROWS}%`, padding: '1.5px' }}
            >
              <CellFace
                cell={cell}
                isWin={isWin}
                isExplode={isExplode}
                showLabels={showLabels && inFinalBand}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ReelGrid: React.FC<ReelGridProps> = ({
  grid,
  spinning,
  stoppedCols,
  winCells,
  explodeCells,
  spinDurationMs = 2800,
  gridRef,
}) => {
  const columns = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => grid[r * COLS + c]),
  );

  return (
    <div
      ref={gridRef}
      className="relative grid gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl bg-black/50 border border-zinc-800/60 w-full h-full min-h-0"
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows: '1fr',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(225,29,72,0.08)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-xl sm:rounded-2xl opacity-70"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(225,29,72,0.06), transparent 65%), radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {columns.map((colSymbols, colIdx) => (
        <ReelColumn
          key={colIdx}
          colIdx={colIdx}
          colSymbols={colSymbols}
          isSpinning={spinning}
          isStopped={stoppedCols.has(colIdx)}
          winCells={winCells}
          explodeCells={explodeCells}
          spinDurationMs={spinDurationMs + colIdx * 140}
        />
      ))}
    </div>
  );
};
