/**
 * SlotsGame — classic 3-reel One-Armed Bandit (fullscreen)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Currency, Language, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import {
  BET_PRESETS,
  DEFAULT_BET_INDEX,
  REELS,
  SYMBOL_LABEL,
  TRIPLE_PAY,
  PAIR_PAY,
  BanditSymbol,
} from '../../game/slots/banditConfig';
import { initialGrid, playSpin } from '../../game/slots/banditEngine';
import { ReelGrid } from '../slots/ReelGrid';
import { SlotBetBar } from '../slots/SlotBetBar';

interface SlotsGameProps {
  user: UserProfile;
  currency: Currency;
  lang: Language;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
  onClose: () => void;
}

const SPIN_MS = 2200;
const STAGGER = 180;

export const SlotsGame: React.FC<SlotsGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
  onClose,
}) => {
  const [betIndex, setBetIndex] = useState(DEFAULT_BET_INDEX);
  const [grid, setGrid] = useState<BanditSymbol[]>(() => initialGrid());
  const [spinning, setSpinning] = useState(false);
  const [stoppedCols, setStoppedCols] = useState<Set<number>>(() => new Set([0, 1, 2]));
  const [winLine, setWinLine] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [showPaytable, setShowPaytable] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const bet = BET_PRESETS[betIndex];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const trackTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (!mountedRef.current) return;
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const handleSpin = useCallback(() => {
    if (busyRef.current) return;
    if (bet > user.balanceUSD) return;

    const balanceAfterBet = user.balanceUSD - bet;
    busyRef.current = true;
    soundFx.playClick();
    onUpdateBalance(balanceAfterBet);
    setWinLine(false);
    setLastWin(0);
    setSpinning(true);
    setStoppedCols(new Set());

    const result = playSpin(bet, playMode === 'demo');

    // Tick sounds while spinning
    for (let i = 0; i < 12; i++) {
      trackTimeout(() => soundFx.playSpinTick(), 80 + i * 120);
    }

    setGrid(result.grid);

    for (let col = 0; col < REELS; col++) {
      trackTimeout(() => {
        setStoppedCols(prev => new Set(prev).add(col));
        soundFx.playSpinTick();
      }, SPIN_MS + col * STAGGER);
    }

    const totalSpin = SPIN_MS + (REELS - 1) * STAGGER + 120;
    trackTimeout(() => {
      setSpinning(false);
      setStoppedCols(new Set([0, 1, 2]));
      busyRef.current = false;

      if (result.multiplier > 0) {
        setWinLine(true);
        setLastWin(result.payoutUSD);
        onUpdateBalance(balanceAfterBet + result.payoutUSD);
        if (result.kind === 'triple' && result.multiplier >= 8) {
          soundFx.playBigWin();
          confetti({ particleCount: 80, spread: 60 });
        } else if (result.kind === 'triple') {
          soundFx.playWin();
        } else {
          soundFx.playGem();
        }
      } else {
        soundFx.playLoss();
      }

      onAddHistory({
        id: String(Date.now()),
        gameId: 'slots',
        gameName: t('slotsName', lang),
        timestamp: new Date(),
        betAmountUSD: bet,
        multiplier: result.multiplier,
        payoutUSD: result.payoutUSD,
        win: result.multiplier > 0,
        currency,
      });
    }, totalSpin);
  }, [bet, user.balanceUSD, playMode, onUpdateBalance, onAddHistory, lang, currency, trackTimeout]);

  return (
    <div className="fixed inset-0 z-[80] bg-[#07070a] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-zinc-900">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider"
        >
          ← {t('slotsBack', lang)}
        </button>
        <div className="text-center">
          <h1 className="font-display font-black text-white text-sm sm:text-base tracking-wide uppercase">
            {t('slotsName', lang)}
          </h1>
          <p className="text-[10px] text-zinc-500 font-mono">{t('slotsHint', lang)}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPaytable(true)}
          className="sm:hidden px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-400 text-[10px] font-bold uppercase"
        >
          {t('slotsPaytable', lang)}
        </button>
        <div className="hidden sm:block w-16" />
      </div>

      {/* Stage */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 sm:px-6 py-4 gap-4 min-h-0">
        <div
          className="w-full max-w-md rounded-2xl border border-rose-900/40 p-3 sm:p-4 shadow-2xl red-border-glow"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, #1a0a10 0%, #0a0a0d 55%)' }}
        >
          <ReelGrid
            grid={grid}
            spinning={spinning}
            stoppedCols={stoppedCols}
            winLine={winLine}
            spinDurationMs={SPIN_MS}
          />
        </div>

        {lastWin > 0 && !spinning && (
          <div className="text-center animate-bounce">
            <span className="font-display font-black text-2xl text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.7)]">
              +{formatCurrency(lastWin, currency)}
            </span>
          </div>
        )}
      </div>

      {/* Bet bar */}
      <div className="px-2 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        <SlotBetBar
          betIndex={betIndex}
          onChangeBetIndex={setBetIndex}
          balance={user.balanceUSD}
          currency={currency}
          lang={lang}
          busy={spinning || busyRef.current}
          spinning={spinning}
          onSpin={handleSpin}
          onOpenPaytable={() => setShowPaytable(true)}
        />
      </div>

      {showPaytable && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowPaytable(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#111115] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-white uppercase text-sm tracking-wide">
                {t('slotsPaytable', lang)}
              </h2>
              <button
                type="button"
                onClick={() => setShowPaytable(false)}
                className="text-zinc-500 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {(Object.keys(TRIPLE_PAY) as BanditSymbol[]).map((s) => (
                <li key={s} className="flex items-center justify-between bg-zinc-900/80 rounded-xl px-3 py-2 border border-zinc-800">
                  <span className="font-bold text-zinc-200">
                    {SYMBOL_LABEL[s]} × 3
                  </span>
                  <span className="font-mono font-bold text-rose-400">{TRIPLE_PAY[s]}x</span>
                </li>
              ))}
              <li className="flex items-center justify-between bg-zinc-900/80 rounded-xl px-3 py-2 border border-zinc-800">
                <span className="font-bold text-zinc-200">{t('slotsPairPay', lang)}</span>
                <span className="font-mono font-bold text-amber-400">{PAIR_PAY}x</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
