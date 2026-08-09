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
  TRIPLE_PAY,
  PAIR_PAY,
  BanditSymbol,
} from '../../game/slots/banditConfig';
import { initialGrid, playSpin, SpinResult } from '../../game/slots/banditEngine';
import { ReelGrid, SymbolFace } from '../slots/ReelGrid';
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

const SPIN_MS = 2600;
const STAGGER = 220;

const SYMBOL_NAME: Record<BanditSymbol, string> = {
  seven: '777',
  bar: 'BAR',
  grape: 'Grape',
  lemon: 'Lemon',
};

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
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winLine, setWinLine] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [showPaytable, setShowPaytable] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const resultRef = useRef<SpinResult | null>(null);
  const balanceAfterRef = useRef(0);
  const betRef = useRef(BET_PRESETS[DEFAULT_BET_INDEX]);

  const bet = BET_PRESETS[betIndex];
  betRef.current = bet;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const settle = useCallback(() => {
    if (!mountedRef.current) return;
    const result = resultRef.current;
    if (!result) return;

    setSpinning(false);
    busyRef.current = false;

    if (result.multiplier > 0) {
      setWinLine(true);
      setLastWin(result.payoutUSD);
      onUpdateBalance(balanceAfterRef.current + result.payoutUSD);
      if (result.kind === 'triple' && result.multiplier >= 8) {
        soundFx.playBigWin();
        confetti({ particleCount: 90, spread: 65 });
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
      betAmountUSD: betRef.current,
      multiplier: result.multiplier,
      payoutUSD: result.payoutUSD,
      win: result.multiplier > 0,
      currency,
    });
    resultRef.current = null;
  }, [onUpdateBalance, onAddHistory, lang, currency]);

  const handleSpin = useCallback(() => {
    if (busyRef.current) return;
    if (bet > user.balanceUSD) return;

    const balanceAfterBet = user.balanceUSD - bet;
    busyRef.current = true;
    soundFx.playClick();
    onUpdateBalance(balanceAfterBet);
    balanceAfterRef.current = balanceAfterBet;
    setWinLine(false);
    setLastWin(0);
    setSpinning(true);

    const result = playSpin(bet, playMode === 'demo');
    resultRef.current = result;
    // Lock final grid BEFORE bumping spinId so reels read the correct strip
    setGrid(result.grid);
    setSpinId((id) => id + 1);
  }, [bet, user.balanceUSD, playMode, onUpdateBalance]);

  const handleReelStop = useCallback((_col: number) => {
    soundFx.playSpinTick();
  }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-[#07070a] flex flex-col">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at 50% 20%, rgba(225,29,72,0.25), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(251,191,36,0.08), transparent 40%)',
        }}
      />

      <div className="relative flex items-center justify-between px-3 sm:px-5 py-3 border-b border-zinc-900/80">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider"
        >
          ← {t('slotsBack', lang)}
        </button>
        <div className="text-center">
          <h1 className="font-display font-black text-white text-sm sm:text-base tracking-wide uppercase drop-shadow-[0_0_12px_rgba(225,29,72,0.45)]">
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

      <div className="relative flex-1 flex flex-col items-center justify-center px-3 sm:px-6 py-4 gap-4 min-h-0">
        <div className="w-full max-w-lg">
          <ReelGrid
            grid={grid}
            spinId={spinId}
            winLine={winLine}
            spinDurationMs={SPIN_MS}
            staggerMs={STAGGER}
            onReelStop={handleReelStop}
            onSpinComplete={settle}
          />
        </div>

        {lastWin > 0 && !spinning && (
          <div className="text-center animate-bounce">
            <span className="font-display font-black text-2xl sm:text-3xl text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.7)]">
              +{formatCurrency(lastWin, currency)}
            </span>
          </div>
        )}
      </div>

      <div className="relative px-2 sm:px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
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
                <li
                  key={s}
                  className="flex items-center justify-between bg-zinc-900/80 rounded-xl px-3 py-2 border border-zinc-800 gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-10 h-10 shrink-0">
                      <SymbolFace symbol={s} />
                    </div>
                    <span className="font-bold text-zinc-200 truncate">
                      {SYMBOL_NAME[s]} × 3
                    </span>
                  </div>
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
