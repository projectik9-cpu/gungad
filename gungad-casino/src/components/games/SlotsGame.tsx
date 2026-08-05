/**
 * SlotsGame — Crimson Cascade fullscreen slot
 * Rendered as a fixed overlay by App.tsx (no casino chrome visible).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
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
} from '../../game/slots/crimsonEngine';

import { GunGadPlayLoader }  from '../slots/GunGadPlayLoader';
import { ReelGrid }          from '../slots/ReelGrid';
import { SlotBetBar }        from '../slots/SlotBetBar';
import { WinPanel }          from '../slots/WinPanel';
import { WinFlyLayer, useWinFlyLayer } from '../slots/WinFlyLayer';
import { PaytableModal }     from '../slots/PaytableModal';
import { BuyBonusModal, BuyBonusStep } from '../slots/BuyBonusModal';

interface SlotsGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
  onClose: () => void;
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function initGrid(): CellState[] {
  return Array.from({ length: COLS * ROWS }, (_, i) => ({
    symbol: PAYING[i % PAYING.length],
  }));
}

const STOP_DELAYS = [880, 1030, 1180, 1330, 1480, 1630];
const SPIN_SETTLE_MS = STOP_DELAYS[STOP_DELAYS.length - 1] + 200;

export const SlotsGame: React.FC<SlotsGameProps> = ({
  user,
  currency,
  lang,
  onUpdateBalance,
  onAddHistory,
  onClose,
}) => {
  // ── Loading ────────────────────────────────────────────────────────────────
  const [loaded, setLoaded] = useState(false);

  // ── Game state ────────────────────────────────────────────────────────────
  const [betIndex, setBetIndex]       = useState(DEFAULT_BET_INDEX);
  const [grid, setGrid]               = useState<CellState[]>(initGrid);
  const [spinning, setSpinning]       = useState(false);
  const [stoppedCols, setStoppedCols] = useState<Set<number>>(new Set([0,1,2,3,4,5]));
  const [winCells, setWinCells]       = useState<Set<number>>(new Set());
  const [explodeCells, setExplodeCells] = useState<Set<number>>(new Set());

  // FS state
  const [isFs, setIsFs]               = useState(false);
  const [fsLeft, setFsLeft]           = useState(0);
  const [fsTotal, setFsTotal]         = useState(0);
  const [bonusTotal, setBonusTotal]   = useState(0);

  // Win display
  const [currentWin, setCurrentWin]   = useState(0);
  const [multFactor, setMultFactor]   = useState(1);

  // UI state
  const [banner, setBanner]           = useState<string | null>(null);
  const [showPaytable, setShowPaytable] = useState(false);
  const [buyStep, setBuyStep]         = useState<BuyBonusStep>('none');
  const buyResultRef                  = useRef<ReturnType<typeof playBoughtBonus> | null>(null);

  const busyRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const { events: flyEvents, emit: emitFly, clear: clearFly } = useWinFlyLayer();

  const bet = BET_PRESETS[betIndex];
  const currStr = currency;

  // ── Banner helper ─────────────────────────────────────────────────────────
  const showBannerFor = useCallback(async (text: string, ms = 1600) => {
    setBanner(text);
    await sleep(ms);
    setBanner(null);
  }, []);

  // ── Spin animation helper ─────────────────────────────────────────────────
  const doReelSpin = useCallback(async (finalGrid: CellState[]) => {
    setSpinning(true);
    setStoppedCols(new Set()); // all 6 cols spinning
    setWinCells(new Set());
    setExplodeCells(new Set());

    soundFx.playSpinTick();

    const handles = STOP_DELAYS.map((delay, col) =>
      window.setTimeout(() => {
        soundFx.playSpinTick();
        setStoppedCols(prev => new Set([...prev, col]));
      }, delay),
    );

    await sleep(SPIN_SETTLE_MS);
    handles.forEach(clearTimeout); // safety

    setSpinning(false);
    setGrid(finalGrid);
  }, []);

  // ── Cascade animation helper ──────────────────────────────────────────────
  const animateCascade = useCallback(async (round: SpinRound, fsMode: boolean): Promise<number> => {
    if (round.tumbles.length === 0) {
      setGrid(round.finalGrid);
      return round.appliedPay;
    }

    let accrued = 0;

    for (const step of round.tumbles) {
      // Show grid at this tumble step + highlight winners
      setGrid(step.grid.map(c => ({ ...c })));
      const wins = new Set(step.removed);
      setWinCells(wins);
      setExplodeCells(new Set());

      // Emit flying win label from grid centre
      if (step.stepPay > 0) {
        const displayPay = fsMode && round.multFactor > 1
          ? step.stepPay * round.multFactor
          : step.stepPay;
        emitFly(`+${formatCurrency(displayPay, currency)}`, 0.5, 0.45);
      }

      soundFx.playWin();
      await sleep(550);

      // Explode winning cells
      setExplodeCells(wins);
      setWinCells(new Set());
      soundFx.playExplosion();
      await sleep(420);

      // Clear explosion, show dropped state
      setExplodeCells(new Set());
      accrued += step.stepPay;
      setCurrentWin(prev => prev + step.stepPay * (fsMode ? round.multFactor : 1));
      await sleep(80);
    }

    // Final settled grid after all cascades
    setGrid(round.finalGrid);
    setWinCells(new Set());
    setExplodeCells(new Set());

    // Show bomb multiplier if in FS
    if (fsMode && round.multFactor > 1) {
      setMultFactor(round.multFactor);
      emitFly(`×${round.multFactor}`, 0.5, 0.3, true);
    }

    return round.appliedPay;
  }, [emitFly, currency]);

  // ── Core spin runner ──────────────────────────────────────────────────────
  const runSpin = useCallback(async (precomputed?: ReturnType<typeof playBoughtBonus>) => {
    if (busyRef.current) return;
    if (!precomputed && bet > user.balanceUSD) return;

    busyRef.current = true;
    soundFx.playClick();

    const startBalance = user.balanceUSD;
    const isBought = !!precomputed;
    const cost = isBought ? bet * BUY_BONUS_COST_MULT : bet;

    onUpdateBalance(startBalance - cost);

    const result = precomputed ?? playFullSpin(bet);

    // ── Base spin ──────────────────────────────────────────────────────────
    setIsFs(false);
    setCurrentWin(0);
    setMultFactor(1);
    setBonusTotal(0);

    await doReelSpin(result.base.finalGrid);
    let totalPaid = await animateCascade(result.base, false);

    // ── Free spins phase ───────────────────────────────────────────────────
    if (result.freeSpins.length > 0) {
      const fsCount = result.base.freeSpinsAwarded || BET_PRESETS[betIndex] * 0; // 0 for bought

      const bannerText = isBought
        ? `🎰 BONUS! ${result.totalFreeSpinsPlayed} Free Spins!`
        : `${fsCount} FREE SPINS! 🎰`;
      await showBannerFor(bannerText, 1800);

      setIsFs(true);
      setFsTotal(result.totalFreeSpinsPlayed);
      let fsRemaining = result.freeSpins.length;

      confetti({ particleCount: 80, spread: 70, colors: ['#e11d48', '#f43f5e', '#fbbf24', '#ffffff'], origin: { y: 0.6 } });

      let bonusAcc = 0;

      for (let i = 0; i < result.freeSpins.length; i++) {
        const round = result.freeSpins[i];
        setFsLeft(fsRemaining - i);
        setCurrentWin(0);
        setMultFactor(1);

        await doReelSpin(round.finalGrid);
        const roundPay = await animateCascade(round, true);
        bonusAcc += roundPay;
        totalPaid += roundPay;
        setBonusTotal(bonusAcc);

        if (round.retriggered) {
          await showBannerFor(`🔄 +5 FREE SPINS!`, 1000);
          fsRemaining += 5; // extra spins were already computed in the result
        }

        await sleep(350);
      }

      setFsLeft(0);
      setIsFs(false);

      // FS summary
      if (bonusAcc > 0) {
        setCurrentWin(bonusAcc);
      }
    }

    // ── Settle ─────────────────────────────────────────────────────────────
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
      confetti({ particleCount: 140, spread: 90, colors: ['#e11d48', '#fda4af', '#fbbf24'], origin: { y: 0.5 } });
    } else if (payout > 0) {
      soundFx.playWin();
    } else {
      soundFx.playLoss();
    }

    busyRef.current = false;
  }, [bet, betIndex, user.balanceUSD, onUpdateBalance, onAddHistory, currency, doReelSpin, animateCascade, showBannerFor]);

  // ── Buy bonus flow ────────────────────────────────────────────────────────
  const handleBuyBonusClick = () => {
    if (busyRef.current || spinning) return;
    const cost = bet * BUY_BONUS_COST_MULT;
    if (cost > user.balanceUSD) return;
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

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => { busyRef.current = false; }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!loaded) {
    return <GunGadPlayLoader onDone={() => setLoaded(true)} />;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #1a0510 0%, #06060a 60%)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 flex-shrink-0">
        {/* Back button */}
        <button
          onClick={onClose}
          disabled={busyRef.current}
          className="w-9 h-9 rounded-xl border border-zinc-700 bg-zinc-900/80 hover:border-rose-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center active:scale-95"
          title="Back to lobby"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current">
            <path d="M17 10H5M11 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>

        {/* Title */}
        <div className="font-display font-black uppercase tracking-wider text-sm sm:text-base">
          <span className="text-white">Crimson</span>{' '}
          <span className="text-rose-500">Cascade</span>
        </div>

        {/* RTP badge */}
        <div className="text-[9px] font-mono font-bold text-zinc-500 border border-zinc-800 rounded-md px-2 py-1">
          RTP 96%
        </div>
      </div>

      {/* ── Main area: WinPanel + ReelGrid ──────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2 px-2 sm:px-3 overflow-hidden min-h-0">
        {/* Win Panel — compact top strip */}
        <div className="flex-shrink-0">
          <WinPanel
            currentWin={currentWin}
            fsLeft={fsLeft}
            fsTotal={fsTotal}
            multFactor={multFactor}
            bonusTotal={bonusTotal}
            isFs={isFs}
            currency={currStr}
          />
        </div>

        {/* Reel grid — fills remaining space */}
        <div className="relative flex-1 min-h-0 flex items-center">
          <div className="w-full relative">
            <ReelGrid
              grid={grid}
              spinning={spinning}
              stoppedCols={stoppedCols}
              winCells={winCells}
              explodeCells={explodeCells}
              gridRef={gridRef}
            />

            {/* Win fly labels */}
            <WinFlyLayer events={flyEvents} onClear={clearFly} />

            {/* FS Banner overlay */}
            {banner && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className="slot-fs-banner-anim text-center px-6 py-4 rounded-2xl"
                  style={{ background: 'rgba(6,6,10,0.85)', border: '1px solid rgba(225,29,72,0.4)' }}>
                  <div
                    className="font-display font-black text-xl sm:text-3xl text-rose-400 uppercase tracking-widest"
                    style={{ textShadow: '0 0 30px rgba(225,29,72,0.8)' }}
                  >
                    {banner}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bet bar ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-2 sm:px-3 pb-3 sm:pb-4 pt-2">
        <SlotBetBar
          betIndex={betIndex}
          onChangeBetIndex={setBetIndex}
          balance={user.balanceUSD}
          currency={currency}
          spinning={spinning || busyRef.current}
          onSpin={() => void runSpin()}
          onBuyBonus={handleBuyBonusClick}
          onOpenPaytable={() => setShowPaytable(true)}
        />
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
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
        onConfirm={handleBuyConfirm}
        onCancel={() => setBuyStep('none')}
        onContinue={handleBuyContinue}
      />
    </div>
  );
};
