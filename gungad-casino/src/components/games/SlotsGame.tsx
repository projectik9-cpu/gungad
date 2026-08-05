/**
 * SlotsGame — Crimson Cascade fullscreen slot
 * Casino chrome is hidden by App while this overlay is open.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Currency, Language, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import {
  COLS,
  ROWS,
  PAYING,
  DEFAULT_BET_INDEX,
  BET_PRESETS,
  BUY_BONUS_COST_MULT,
} from '../../game/slots/crimsonConfig';
import {
  CellState,
  SpinRound,
  playFullSpin,
  playBoughtBonus,
  FullSpinResult,
} from '../../game/slots/crimsonEngine';

import { GunGadPlayLoader } from '../slots/GunGadPlayLoader';
import { ReelGrid } from '../slots/ReelGrid';
import { SlotBetBar } from '../slots/SlotBetBar';
import { WinPanel } from '../slots/WinPanel';
import { WinFlyLayer, useWinFlyLayer } from '../slots/WinFlyLayer';
import { PaytableModal } from '../slots/PaytableModal';
import { BuyBonusModal, BuyBonusStep } from '../slots/BuyBonusModal';

interface SlotsGameProps {
  user: UserProfile;
  currency: Currency;
  lang: Language;
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
  onClose: () => void;
}

function initGrid(): CellState[] {
  return Array.from({ length: COLS * ROWS }, (_, i) => ({
    symbol: PAYING[i % PAYING.length],
  }));
}

/** Base / FS / turbo spin durations (first column; stagger added in ReelGrid) */
const SPIN_MS = { base: 2600, fs: 3600, turbo: 700 };
const STAGGER = 140;
const COLS_N = 6;

export const SlotsGame: React.FC<SlotsGameProps> = ({
  user,
  currency,
  lang,
  onUpdateBalance,
  onAddHistory,
  onClose,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [betIndex, setBetIndex] = useState(DEFAULT_BET_INDEX);
  const [grid, setGrid] = useState<CellState[]>(initGrid);
  const [spinning, setSpinning] = useState(false);
  const [stoppedCols, setStoppedCols] = useState<Set<number>>(() => new Set([0, 1, 2, 3, 4, 5]));
  const [winCells, setWinCells] = useState<Set<number>>(() => new Set());
  const [explodeCells, setExplodeCells] = useState<Set<number>>(() => new Set());
  const [spinDurationMs, setSpinDurationMs] = useState(SPIN_MS.base);

  const [isFs, setIsFs] = useState(false);
  const [fsLeft, setFsLeft] = useState(0);
  const [fsTotal, setFsTotal] = useState(0);
  const [bonusTotal, setBonusTotal] = useState(0);
  const [currentWin, setCurrentWin] = useState(0);
  const [multFactor, setMultFactor] = useState(1);

  const [banner, setBanner] = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [buyStep, setBuyStep] = useState<BuyBonusStep>('none');
  const [busyUi, setBusyUi] = useState(false);

  const buyResultRef = useRef<FullSpinResult | null>(null);
  const busyRef = useRef(false);
  const turboRef = useRef(false);
  const skipRef = useRef(false);
  const sleepResolvers = useRef<Array<() => void>>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const { events: flyEvents, emit: emitFly, clear: clearFly, clearAll: clearAllFly } = useWinFlyLayer();

  const bet = BET_PRESETS[betIndex];

  /** Interruptible sleep — resolves early when skip/turbo is requested */
  const sleep = useCallback((ms: number) => {
    return new Promise<void>(resolve => {
      if (skipRef.current || turboRef.current) {
        // Turbo: short residual delay so UI still ticks
        const short = Math.min(ms, turboRef.current ? Math.max(40, ms * 0.12) : 0);
        if (short <= 0) {
          resolve();
          return;
        }
        ms = short;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        sleepResolvers.current = sleepResolvers.current.filter(f => f !== finish);
        resolve();
      };
      sleepResolvers.current.push(finish);
      window.setTimeout(finish, ms);
    });
  }, []);

  const flushSkips = useCallback(() => {
    const pending = [...sleepResolvers.current];
    sleepResolvers.current = [];
    pending.forEach(f => f());
  }, []);

  const resetFx = useCallback(() => {
    setWinCells(new Set());
    setExplodeCells(new Set());
    setMultFactor(1);
    setBanner(null);
    clearAllFly();
  }, [clearAllFly]);

  const showBannerFor = useCallback(async (text: string, ms = 1600) => {
    setBanner(text);
    await sleep(ms);
    setBanner(null);
  }, [sleep]);

  const doReelSpin = useCallback(async (finalGrid: CellState[], mode: 'base' | 'fs') => {
    resetFx();
    setCurrentWin(0);

    const duration = turboRef.current
      ? SPIN_MS.turbo
      : mode === 'fs'
        ? SPIN_MS.fs
        : SPIN_MS.base;
    setSpinDurationMs(duration);

    setSpinning(true);
    setStoppedCols(new Set());
    setGrid(finalGrid);
    soundFx.playSpinTick();

    const handles: number[] = [];
    for (let col = 0; col < COLS_N; col++) {
      const delay = duration + col * STAGGER;
      handles.push(
        window.setTimeout(() => {
          soundFx.playSpinTick();
          setStoppedCols(prev => {
            const next = new Set(prev);
            next.add(col);
            return next;
          });
        }, turboRef.current ? Math.min(delay, 120 + col * 40) : delay),
      );
    }

    const totalWait = turboRef.current
      ? 120 + (COLS_N - 1) * 40 + 120
      : duration + (COLS_N - 1) * STAGGER + 220;

    await sleep(totalWait);
    handles.forEach(clearTimeout);

    setStoppedCols(new Set([0, 1, 2, 3, 4, 5]));
    setSpinning(false);
    setGrid(finalGrid);
  }, [resetFx, sleep]);

  const animateCascade = useCallback(async (round: SpinRound, fsMode: boolean): Promise<number> => {
    if (round.tumbles.length === 0) {
      setGrid(round.finalGrid);
      setWinCells(new Set());
      setExplodeCells(new Set());
      return round.appliedPay;
    }

    const winHold = () => (turboRef.current ? 120 : fsMode ? 1100 : 950);
    const explodeHold = () => (turboRef.current ? 90 : fsMode ? 720 : 650);

    for (const step of round.tumbles) {
      setGrid(step.grid.map(c => ({ ...c })));
      const wins = new Set(step.removed);
      setWinCells(wins);
      setExplodeCells(new Set());

      if (step.stepPay > 0) {
        const displayPay =
          fsMode && round.multFactor > 1 ? step.stepPay * round.multFactor : step.stepPay;
        emitFly(`+${formatCurrency(displayPay, currency)}`, 0.5, 0.45);
      }

      soundFx.playWin();
      await sleep(winHold());

      setExplodeCells(wins);
      setWinCells(new Set());
      soundFx.playExplosion();
      await sleep(explodeHold());

      setExplodeCells(new Set());
      setCurrentWin(prev => prev + step.stepPay * (fsMode ? round.multFactor : 1));
      await sleep(turboRef.current ? 20 : 80);
    }

    setGrid(round.finalGrid);
    setWinCells(new Set());
    setExplodeCells(new Set());

    if (fsMode && round.multFactor > 1) {
      setMultFactor(round.multFactor);
      emitFly(`×${round.multFactor}`, 0.5, 0.3, true);
      await sleep(turboRef.current ? 100 : 900);
    }

    return round.appliedPay;
  }, [emitFly, currency, sleep]);

  const runSpin = useCallback(async (precomputed?: FullSpinResult) => {
    if (busyRef.current) return;
    if (!precomputed && bet > user.balanceUSD) return;

    busyRef.current = true;
    setBusyUi(true);
    turboRef.current = false;
    skipRef.current = false;
    soundFx.playClick();

    const startBalance = user.balanceUSD;
    const isBought = !!precomputed;
    const cost = isBought ? bet * BUY_BONUS_COST_MULT : bet;

    onUpdateBalance(startBalance - cost);

    const result = precomputed ?? playFullSpin(bet);

    setIsFs(false);
    setCurrentWin(0);
    setMultFactor(1);
    setBonusTotal(0);
    resetFx();

    // Bought bonus: skip empty base spin — go straight to FS
    if (!isBought) {
      await doReelSpin(result.base.finalGrid, 'base');
      await animateCascade(result.base, false);
    }

    if (result.freeSpins.length > 0) {
      // Only show FS banner for natural triggers (buy already showed congrats modal)
      if (!isBought && result.base.freeSpinsAwarded > 0) {
        await showBannerFor(
          `${result.base.freeSpinsAwarded} ${t('slotsFreeSpins', lang)}!`,
          1600,
        );
      }

      setIsFs(true);
      setFsTotal(result.totalFreeSpinsPlayed);
      let fsRemaining = result.freeSpins.length;

      confetti({
        particleCount: 60,
        spread: 65,
        colors: ['#e11d48', '#f43f5e', '#fbbf24'],
        origin: { y: 0.55 },
      });

      let bonusAcc = 0;

      for (let i = 0; i < result.freeSpins.length; i++) {
        const round = result.freeSpins[i];
        setFsLeft(Math.max(0, fsRemaining - i));
        setCurrentWin(0);
        setMultFactor(1);
        resetFx();

        await doReelSpin(round.finalGrid, 'fs');
        const roundPay = await animateCascade(round, true);
        bonusAcc += roundPay;
        setBonusTotal(bonusAcc);

        if (round.retriggered) {
          await showBannerFor(`+5 ${t('slotsFreeSpins', lang)}!`, turboRef.current ? 400 : 1000);
          fsRemaining += 5;
        }

        await sleep(turboRef.current ? 80 : 400);
      }

      setFsLeft(0);
      setIsFs(false);
      if (bonusAcc > 0) setCurrentWin(bonusAcc);
    }

    const payout = result.totalPayoutUSD;
    onUpdateBalance(startBalance - cost + payout);

    onAddHistory({
      id: String(Date.now()),
      gameId: 'slots',
      gameName: 'Crimson Cascade',
      timestamp: new Date(),
      betAmountUSD: cost,
      multiplier: cost > 0 ? payout / cost : 0,
      payoutUSD: payout,
      win: payout > 0,
      currency,
    });

    if (payout > cost * 10) {
      soundFx.playBigWin();
      confetti({ particleCount: 120, spread: 85, colors: ['#e11d48', '#fda4af', '#fbbf24'], origin: { y: 0.5 } });
    } else if (payout > 0) {
      soundFx.playWin();
    } else {
      soundFx.playLoss();
    }

    resetFx();
    turboRef.current = false;
    skipRef.current = false;
    busyRef.current = false;
    setBusyUi(false);
  }, [
    bet,
    user.balanceUSD,
    onUpdateBalance,
    onAddHistory,
    currency,
    lang,
    doReelSpin,
    animateCascade,
    showBannerFor,
    sleep,
    resetFx,
  ]);

  /** Idle = new spin; busy = enable turbo + skip current waits */
  const handleSpinPress = useCallback(() => {
    if (busyRef.current) {
      turboRef.current = true;
      skipRef.current = true;
      setSpinDurationMs(SPIN_MS.turbo);
      flushSkips();
      soundFx.playClick();
      return;
    }
    void runSpin();
  }, [runSpin, flushSkips]);

  const handleBuyBonusClick = () => {
    if (busyRef.current || spinning) return;
    if (bet * BUY_BONUS_COST_MULT > user.balanceUSD) return;
    setBuyStep('confirm');
  };

  const handleBuyConfirm = () => {
    const result = playBoughtBonus(bet);
    buyResultRef.current = result;
    setBuyStep('congrats');
  };

  const handleBuyContinue = () => {
    setBuyStep('none');
    if (buyResultRef.current) {
      const r = buyResultRef.current;
      buyResultRef.current = null;
      void runSpin(r);
    }
  };

  useEffect(() => () => {
    busyRef.current = false;
    flushSkips();
  }, [flushSkips]);

  if (!loaded) {
    return <GunGadPlayLoader onDone={() => setLoaded(true)} />;
  }

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col overflow-hidden select-none"
      style={{
        height: '100dvh',
        background: 'radial-gradient(ellipse at 50% 0%, #1a0510 0%, #06060a 60%)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Compact title row */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={busyUi}
          className="w-8 h-8 rounded-lg border border-zinc-700 bg-zinc-900/80 hover:border-rose-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center disabled:opacity-40"
          title="Back"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
            <path d="M17 10H5M11 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="font-display font-black uppercase tracking-wider text-xs sm:text-sm">
          <span className="text-white">Crimson</span>{' '}
          <span className="text-rose-500">Cascade</span>
        </div>

        <div className="w-8" />
      </div>

      {/* Win panel — only when needed */}
      <div className="shrink-0 px-2">
        <WinPanel
          currentWin={currentWin}
          fsLeft={fsLeft}
          fsTotal={fsTotal}
          multFactor={multFactor}
          bonusTotal={bonusTotal}
          isFs={isFs}
          currency={currency}
          lang={lang}
        />
      </div>

      {/* 16:9 reel stage — letterboxed on phone and desktop */}
      <div className="flex-1 min-h-0 px-1.5 sm:px-4 py-1 flex items-center justify-center">
        <div
          className="relative w-full max-w-5xl"
          style={{
            aspectRatio: '16 / 9',
            maxHeight: '100%',
            width: 'min(100%, calc(100dvh * 16 / 9))',
          }}
        >
          <div className="absolute inset-0">
            <ReelGrid
              grid={grid}
              spinning={spinning}
              stoppedCols={stoppedCols}
              winCells={winCells}
              explodeCells={explodeCells}
              spinDurationMs={spinDurationMs}
              gridRef={gridRef}
            />
            <WinFlyLayer events={flyEvents} onClear={clearFly} />

            {banner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div
                  className="text-center px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(6,6,10,0.88)', border: '1px solid rgba(225,29,72,0.4)' }}
                >
                  <div
                    className="font-display font-black text-lg sm:text-2xl text-rose-400 uppercase tracking-widest"
                    style={{ textShadow: '0 0 24px rgba(225,29,72,0.8)' }}
                  >
                    {banner}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bet bar — sits above safe area, no casino bottom nav */}
      <div className="shrink-0 px-1.5 sm:px-3 pb-2 sm:pb-3 pt-1">
        <SlotBetBar
          betIndex={betIndex}
          onChangeBetIndex={setBetIndex}
          balance={user.balanceUSD}
          currency={currency}
          lang={lang}
          busy={busyUi}
          spinning={spinning}
          onSpin={handleSpinPress}
          onBuyBonus={handleBuyBonusClick}
          onOpenPaytable={() => setShowPaytable(true)}
        />
      </div>

      <PaytableModal
        isOpen={showPaytable}
        onClose={() => setShowPaytable(false)}
        betUSD={bet}
        currency={currency}
      />

      <BuyBonusModal
        step={buyStep}
        betUSD={bet}
        currency={currency}
        lang={lang}
        onConfirm={handleBuyConfirm}
        onCancel={() => setBuyStep('none')}
        onContinue={handleBuyContinue}
      />
    </div>
  );
};
