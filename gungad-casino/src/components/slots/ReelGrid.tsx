import React, { useEffect, useRef, useState } from 'react';
import {
  COLS,
  ROWS,
  PAYING,
  SCATTER,
  MULT,
  SYMBOL_SRC,
  SymbolId,
} from '../../game/slots/crimsonConfig';
import { CellState } from '../../game/slots/crimsonEngine';

const CYCLE_MS = 72; // symbol cycling speed during spin

interface ReelGridProps {
  grid: CellState[];
  spinning: boolean;
  stoppedCols: Set<number>;
  winCells: Set<number>;
  explodeCells: Set<number>;
  gridRef?: React.RefObject<HTMLDivElement | null>;
}

interface ColProps {
  colIdx: number;
  colSymbols: CellState[];
  isSpinning: boolean;
  isStopped: boolean;
  winCells: Set<number>;
  explodeCells: Set<number>;
}

/** One reel column */
const ReelColumn: React.FC<ColProps> = ({
  colIdx,
  colSymbols,
  isSpinning,
  isStopped,
  winCells,
  explodeCells,
}) => {
  const [displayed, setDisplayed] = useState<CellState[]>(colSymbols);
  const [landedRows, setLandedRows] = useState<Set<number>>(new Set());
  const prevStoppedRef = useRef(false);

  // Cycling random symbols during spin
  useEffect(() => {
    if (!isSpinning || isStopped) {
      setDisplayed(colSymbols);
      return;
    }
    const id = setInterval(() => {
      setDisplayed(() =>
        Array.from({ length: ROWS }, (_, rowIdx) => {
          const idx = (colIdx * 7 + rowIdx * 3 + Math.floor(Date.now() / CYCLE_MS)) % PAYING.length;
          return { symbol: PAYING[Math.abs(idx) % PAYING.length] };
        }),
      );
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [isSpinning, isStopped, colSymbols, colIdx]);

  // Landing animation when column stops
  useEffect(() => {
    if (isStopped && !prevStoppedRef.current) {
      prevStoppedRef.current = true;
      setDisplayed(colSymbols);
      const rows = new Set(Array.from({ length: ROWS }, (_, i) => i));
      setLandedRows(rows);
      const t = setTimeout(() => setLandedRows(new Set()), 400);
      return () => clearTimeout(t);
    }
    if (!isStopped) {
      prevStoppedRef.current = false;
    }
  }, [isStopped, colSymbols]);

  // Update displayed when fully settled (not spinning)
  useEffect(() => {
    if (!isSpinning) {
      setDisplayed(colSymbols);
    }
  }, [isSpinning, colSymbols]);

  const activelySpinning = isSpinning && !isStopped;

  return (
    <div
      className={`flex flex-col gap-1 sm:gap-1.5${activelySpinning ? ' reel-spinning' : ''}`}
      style={{ willChange: activelySpinning ? 'filter' : 'auto' }}
    >
      {displayed.map((cell, rowIdx) => {
        const cellIdx = rowIdx * COLS + colIdx;
        const isWin = winCells.has(cellIdx);
        const isExplode = explodeCells.has(cellIdx);
        const isScatter = cell.symbol === SCATTER;
        const isBomb = cell.symbol === MULT;
        const isLanded = landedRows.has(rowIdx);

        return (
          <div
            key={rowIdx}
            className={[
              'relative aspect-square rounded-lg overflow-hidden bg-[#0a0a0d] border transition-colors duration-150',
              isWin && !isExplode ? 'cell-winning border-rose-400' : 'border-zinc-800/70',
              isExplode ? 'cell-exploding' : '',
              isLanded ? 'reel-landed' : '',
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
                'w-full h-full object-contain select-none transition-all duration-150',
                activelySpinning ? 'p-0.5 opacity-80' : 'p-0.5',
                isScatter && !activelySpinning ? 'scale-[1.1] retrigger-pulse' : '',
                isWin && !isExplode ? 'brightness-125 saturate-150' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />

            {/* Bomb multiplier label */}
            {isBomb && !activelySpinning && cell.multValue != null && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ paddingTop: '45%' }}
              >
                <span
                  className="font-display font-black text-[13px] sm:text-[15px] leading-none text-amber-300"
                  style={{ textShadow: '0 0 8px rgba(251,191,36,0.9), 0 1px 0 #000, 0 -1px 0 #000' }}
                >
                  {cell.multValue}×
                </span>
              </div>
            )}

            {/* RETRIGGER label on scatter */}
            {isScatter && !activelySpinning && (
              <div className="absolute bottom-0 inset-x-0 text-center pointer-events-none pb-0.5">
                <span
                  className="text-[7px] sm:text-[8px] font-black tracking-widest uppercase text-rose-300"
                  style={{ textShadow: '0 0 6px rgba(225,29,72,0.8), 0 1px 0 #000' }}
                >
                  RETRIGGER
                </span>
              </div>
            )}

            {/* Win cluster sparkle overlay */}
            {isWin && !isExplode && (
              <div className="absolute inset-0 pointer-events-none bg-rose-400/10 rounded-lg" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ReelGrid: React.FC<ReelGridProps> = ({
  grid,
  spinning,
  stoppedCols,
  winCells,
  explodeCells,
  gridRef,
}) => {
  // Build per-column arrays
  const columns = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => grid[r * COLS + c]),
  );

  return (
    <div
      ref={gridRef}
      className={[
        'relative grid gap-1 sm:gap-1.5 p-1.5 sm:p-2.5 rounded-2xl',
        'bg-black/50 border border-zinc-800/60',
      ].join(' ')}
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(225,29,72,0.08)',
      }}
    >
      {/* Background vignette */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-70"
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
        />
      ))}
    </div>
  );
};
