import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import confetti from 'canvas-confetti';
import {
  COLS,
  ROWS,
  SYMBOL_SRC,
  SymbolId,
  SCATTER,
  MULT,
  WILD,
} from '../../game/slots/crimsonConfig';
import {
  CellState,
  FullSpinResult,
  playFullSpin,
} from '../../game/slots/crimsonEngine';

interface SlotsGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

type Phase = 'idle' | 'playing' | 'fs';

const STEP_MS = 420;
const DROP_MS = 280;

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

export const SlotsGame: React.FC<SlotsGameProps> = ({
  user,
  currency,
  lang,
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState(1);
  const [lastBetUSD, setLastBetUSD] = useState(1);
  const [grid, setGrid] = useState<CellState[]>(() =>
    Array.from({ length: COLS * ROWS }, () => ({
      symbol: ((Math.floor(Math.random() * 10) + 1) as SymbolId),
    })),
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [highlight, setHighlight] = useState<Set<number>>(new Set());
  const [lastWinUSD, setLastWinUSD] = useState(0);
  const [spinWinUSD, setSpinWinUSD] = useState(0);
  const [fsLeft, setFsLeft] = useState(0);
  const [fsTotal, setFsTotal] = useState(0);
  const [multDisplay, setMultDisplay] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const busyRef = useRef(false);
  const autoRef = useRef(0);

  const showBanner = useCallback(async (text: string, ms = 1200) => {
    setBanner(text);
    await sleep(ms);
    setBanner(null);
  }, []);

  const animateRound = useCallback(async (
    result: FullSpinResult['base'] | FullSpinResult['freeSpins'][0],
    isFs: boolean,
  ) => {
    if (result.tumbles.length === 0) {
      setGrid(result.finalGrid);
      setHighlight(new Set());
      if (isFs && result.multTotal > 1) {
        setMultDisplay(result.multTotal);
      }
      return result.appliedPay;
    }

    let accrued = 0;
    for (const step of result.tumbles) {
      setGrid(step.grid);
      setHighlight(new Set(step.removed));
      soundFx.playWin();
      accrued += step.stepPay;
      setSpinWinUSD(accrued);
      await sleep(STEP_MS);

      // Clear highlight then show tumbled board briefly via final of step —
      // next tumble's grid is post-drop; synthesize drop by blanking removed
      const mid = step.grid.map((c, i) =>
        step.removed.includes(i) ? { symbol: 1 as SymbolId } : c,
      );
      setHighlight(new Set());
      setGrid(mid);
      await sleep(80);
    }

    setGrid(result.finalGrid);
    if (isFs && result.multTotal > 1) {
      setMultDisplay(Math.min(result.multTotal, 50));
      await showBanner(`${Math.min(result.multTotal, 50)}x`, 900);
    }
    setSpinWinUSD(result.appliedPay);
    return result.appliedPay;
  }, [showBanner]);

  const runSpin = useCallback(async () => {
    if (busyRef.current) return;
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD) return;

    busyRef.current = true;
    setPhase('playing');
    setLastWinUSD(0);
    setSpinWinUSD(0);
    setMultDisplay(0);
    setHighlight(new Set());
    setLastBetUSD(betAmountUSD);

    soundFx.playClick();
    onUpdateBalance(user.balanceUSD - betAmountUSD);

    const result = playFullSpin(betAmountUSD);
    // Brief spin feel: shuffle then resolve
    for (let i = 0; i < 4; i++) {
      setGrid(Array.from({ length: COLS * ROWS }, () => ({
        symbol: ((Math.floor(Math.random() * 10) + 1) as SymbolId),
      })));
      soundFx.playSpinTick();
      await sleep(70);
    }

    let running = 0;
    running += await animateRound(result.base, false);

    if (result.base.freeSpinsAwarded > 0) {
      confetti({ particleCount: 80, spread: 70, colors: ['#e11d48', '#f43f5e', '#ffffff'] });
      setFsTotal(result.totalFreeSpinsPlayed);
      let left = result.base.freeSpinsAwarded;
      setFsLeft(left);
      await showBanner(`${result.base.freeSpinsAwarded} FREE SPINS`, 1400);
      setPhase('fs');

      for (let i = 0; i < result.freeSpins.length; i++) {
        left = Math.max(0, left - 1);
        setFsLeft(left);
        setMultDisplay(0);
        setSpinWinUSD(0);
        const round = result.freeSpins[i];
        for (let s = 0; s < 3; s++) {
          setGrid(Array.from({ length: COLS * ROWS }, () => ({
            symbol: ((Math.floor(Math.random() * 10) + 1) as SymbolId),
          })));
          await sleep(50);
        }
        running += await animateRound(round, true);
        if (round.freeSpinsAwarded > 0) {
          left += round.freeSpinsAwarded;
          setFsLeft(left);
          await showBanner(`+${round.freeSpinsAwarded} FS`, 900);
        }
        await sleep(DROP_MS);
      }
      setFsLeft(0);
    }

    const payoutUSD = result.totalPayoutUSD;
    const mult = result.multiplier;
    setLastWinUSD(payoutUSD);
    setSpinWinUSD(payoutUSD);

    onUpdateBalance(user.balanceUSD - betAmountUSD + payoutUSD);
    onAddHistory({
      id: String(Date.now()),
      gameId: 'slots',
      gameName: t('slotsName', lang),
      timestamp: new Date(),
      betAmountUSD,
      multiplier: mult,
      payoutUSD,
      win: payoutUSD >= betAmountUSD,
      currency,
    });

    if (payoutUSD > betAmountUSD * 5) {
      confetti({ particleCount: 100, spread: 65, colors: ['#e11d48', '#fda4af'] });
    }
    soundFx[payoutUSD > 0 ? 'playWin' : 'playLoss']();

    setPhase('idle');
    busyRef.current = false;

    // Auto-play chain
    if (autoRef.current > 0) {
      autoRef.current -= 1;
      setAutoLeft(autoRef.current);
      if (autoRef.current > 0) {
        await sleep(400);
        void runSpin();
      }
    }
  }, [
    animateRound,
    betAmountUSD,
    currency,
    lang,
    onAddHistory,
    onUpdateBalance,
    showBanner,
    user.balanceUSD,
  ]);

  const startAuto = (n: number) => {
    if (phase !== 'idle' || busyRef.current) return;
    autoRef.current = n;
    setAutoLeft(n);
    void runSpin();
  };

  const stopAuto = () => {
    autoRef.current = 0;
    setAutoLeft(0);
  };

  useEffect(() => () => { autoRef.current = 0; }, []);

  const cellClass = (i: number) => {
    const on = highlight.has(i);
    const cell = grid[i];
    const special =
      cell?.symbol === SCATTER || cell?.symbol === MULT || cell?.symbol === WILD;
    return [
      'relative aspect-square rounded-lg overflow-hidden bg-[#0a0a0d]/border border-zinc-800/80',
      'transition-all duration-200',
      on ? 'scale-105 border-rose-400 shadow-[0_0_16px_rgba(225,29,72,0.65)] z-10' : '',
      special && !on ? 'border-rose-900/50' : '',
    ].join(' ');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div className="lg:col-span-8 order-2 lg:order-1">
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-2.5 sm:p-3 overflow-hidden shadow-2xl">
          {/* CSS vignette — no Copilot bg */}
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 40%, rgba(10,10,13,0.85) 100%), radial-gradient(ellipse at top, rgba(225,29,72,0.12), transparent 55%)',
            }}
          />

          <div className="relative flex items-center justify-between gap-2 px-1 pb-2">
            <div className="font-display font-black uppercase tracking-wider text-sm sm:text-base text-white">
              Crimson <span className="text-rose-500">Cascade</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
              {fsLeft > 0 && (
                <span className="px-2 py-1 rounded-lg bg-rose-950/80 border border-rose-700 text-rose-300">
                  FS {fsLeft}/{fsTotal || fsLeft}
                </span>
              )}
              {multDisplay > 1 && (
                <span className="px-2 py-1 rounded-lg bg-amber-950/60 border border-amber-700/50 text-amber-300">
                  ×{multDisplay}
                </span>
              )}
              <span className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300">
                WIN ${spinWinUSD.toFixed(2)}
              </span>
            </div>
          </div>

          <div
            className="relative grid gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-xl bg-black/40 border border-zinc-800/60"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
          >
            {grid.map((cell, i) => (
              <div key={i} className={cellClass(i)}>
                <img
                  src={SYMBOL_SRC[cell.symbol]}
                  alt=""
                  draggable={false}
                  className="w-full h-full object-contain p-0.5 select-none"
                />
                {cell.symbol === MULT && cell.multValue != null && (
                  <span className="absolute bottom-0.5 inset-x-0 text-center text-[9px] sm:text-[10px] font-black text-rose-300 drop-shadow-[0_1px_2px_#000]">
                    {cell.multValue}x
                  </span>
                )}
              </div>
            ))}
          </div>

          {banner && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
              <div className="font-display font-black text-2xl sm:text-4xl text-rose-400 tracking-widest uppercase drop-shadow-[0_0_24px_rgba(225,29,72,0.9)] px-4 text-center">
                {banner}
              </div>
            </div>
          )}
        </div>

        {lastWinUSD > 0 && phase === 'idle' && (
          <div className="mt-2 text-center text-xs font-mono text-emerald-400">
            {t('payout', lang)}: ${lastWinUSD.toFixed(2)} ({(lastWinUSD / lastBetUSD).toFixed(2)}x)
          </div>
        )}
      </div>

      <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-2.5">
        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={phase !== 'idle' || busyRef.current}
          minBetUSD={0.1}
          maxBetUSD={1000}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={phase === 'idle' ? t('slotsSpin', lang) : t('slotsSpinning', lang)}
          onAction={() => { stopAuto(); void runSpin(); }}
          actionDisabled={phase !== 'idle' || betAmountUSD > user.balanceUSD || betAmountUSD <= 0}
          actionColor="red"
          compact
        />

        <div className="bg-[#111115] border border-zinc-800 rounded-xl p-2.5 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            {t('autoBet', lang)}
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {[10, 25, 50].map(n => (
              <button
                key={n}
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => startAuto(n)}
                className="py-2 rounded-lg text-[11px] font-bold bg-zinc-900 border border-zinc-700 hover:border-rose-700 text-zinc-300 disabled:opacity-40"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={stopAuto}
              disabled={autoLeft <= 0}
              className="py-2 rounded-lg text-[11px] font-bold bg-rose-950/50 border border-rose-800/60 text-rose-300 disabled:opacity-40"
            >
              STOP{autoLeft > 0 ? ` ${autoLeft}` : ''}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            {t('slotsHint', lang)}
          </p>
        </div>
      </div>
    </div>
  );
};
