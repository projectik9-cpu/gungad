import React, { useEffect, useRef, useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import confetti from 'canvas-confetti';
import { Target, Skull, AlertCircle } from 'lucide-react';
import { coinFlipWinMult } from '../../game/demoOdds';

interface CoinFlipGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

export const CoinFlipGame: React.FC<CoinFlipGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [choice, setChoice] = useState<'heads' | 'tails' | null>(null);
  const [playedChoice, setPlayedChoice] = useState<'heads' | 'tails' | null>(null);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const [showChoiceWarning, setShowChoiceWarning] = useState<boolean>(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const winMult = coinFlipWinMult(playMode === 'demo');

  const handleFlip = () => {
    if (choice === null) {
      setShowChoiceWarning(true);
      const warn = setTimeout(() => setShowChoiceWarning(false), 3000);
      timersRef.current.push(warn);
      return;
    }
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD || isFlipping) return;

    const lockedChoice = choice;
    setShowChoiceWarning(false);
    soundFx.playClick();
    onUpdateBalance(user.balanceUSD - betAmountUSD);
    setLastBetUSD(betAmountUSD);
    setIsFlipping(true);
    setResult(null);
    setPlayedChoice(lockedChoice);

    const outcome: 'heads' | 'tails' = Math.random() > 0.5 ? 'heads' : 'tails';

    setRotation((prev) => {
      const currentMod = ((prev % 360) + 360) % 360;
      const finalMod = outcome === 'heads' ? 0 : 180;
      const extra = (finalMod - currentMod + 360) % 360;
      return prev + 360 * 6 + extra;
    });

    let flips = 0;
    const interval = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(interval);
        return;
      }
      soundFx.playSpinTick();
      flips++;
      if (flips > 10) clearInterval(interval);
    }, 100);
    timersRef.current.push(interval);

    const done = setTimeout(() => {
      clearInterval(interval);
      if (!mountedRef.current) return;
      setIsFlipping(false);
      setResult(outcome);

      const win = outcome === lockedChoice;
      const multiplier = win ? winMult : 0;
      const payoutUSD = win ? betAmountUSD * multiplier : 0;

      if (win) {
        soundFx.playWin();
        confetti({ particleCount: 60, spread: 50 });
        onUpdateBalance(user.balanceUSD - betAmountUSD + payoutUSD);
      } else {
        soundFx.playLoss();
      }

      onAddHistory({
        id: String(Date.now()),
        gameId: 'coinflip',
        gameName: t('coinflipName', lang),
        timestamp: new Date(),
        betAmountUSD,
        multiplier,
        payoutUSD,
        win,
        currency,
      });
    }, 1600);
    timersRef.current.push(done);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8 flex flex-col gap-4">
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-8 min-h-[320px] lg:min-h-[420px] flex flex-col items-center justify-center overflow-hidden shadow-2xl red-border-glow">
          <div className="flex gap-4 mb-8 z-10">
            <button
              onClick={() => {
                if (isFlipping) return;
                soundFx.playClick();
                setChoice('heads');
                setShowChoiceWarning(false);
                if (result) { setResult(null); setPlayedChoice(null); }
              }}
              disabled={isFlipping}
              className={`px-6 py-3 rounded-xl border flex items-center gap-2 font-display font-bold text-sm transition-all disabled:opacity-50 disabled:pointer-events-none ${
                choice === 'heads'
                  ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-[0_0_20px_rgba(225,29,72,0.4)]'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <Target className="w-4 h-4 text-rose-500" />
              {t('heads', lang)}
            </button>

            <button
              onClick={() => {
                if (isFlipping) return;
                soundFx.playClick();
                setChoice('tails');
                setShowChoiceWarning(false);
                if (result) { setResult(null); setPlayedChoice(null); }
              }}
              disabled={isFlipping}
              className={`px-6 py-3 rounded-xl border flex items-center gap-2 font-display font-bold text-sm transition-all disabled:opacity-50 disabled:pointer-events-none ${
                choice === 'tails'
                  ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-[0_0_20px_rgba(225,29,72,0.4)]'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <Skull className="w-4 h-4 text-rose-500" />
              {t('tails', lang)}
            </button>
          </div>

          {showChoiceWarning && (
            <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2 bg-amber-950/90 border border-amber-600/60 text-amber-300 px-4 py-3 rounded-xl text-sm font-semibold animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {t('chooseSidePrompt', lang)}
            </div>
          )}

          <div
            className="w-44 h-44 md:w-52 md:h-52 rounded-full relative cursor-pointer transition-transform duration-[1600ms] ease-out shadow-[0_0_40px_rgba(225,29,72,0.5)]"
            style={{ transform: `rotateY(${rotation}deg)`, transformStyle: 'preserve-3d' }}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border-4 border-rose-600 flex flex-col items-center justify-center p-4 backface-hidden shadow-inner">
              <Target className="w-16 h-16 text-rose-500 drop-shadow-[0_0_10px_rgba(225,29,72,0.8)]" />
              <span className="font-display font-black text-white uppercase text-xs tracking-widest mt-2">{t('heads', lang)}</span>
            </div>
            <div
              className="absolute inset-0 rounded-full bg-gradient-to-br from-rose-950 via-zinc-900 to-black border-4 border-rose-600 flex flex-col items-center justify-center p-4 backface-hidden shadow-inner"
              style={{ transform: 'rotateY(180deg)' }}
            >
              <Skull className="w-16 h-16 text-rose-400 drop-shadow-[0_0_10px_rgba(225,29,72,0.8)]" />
              <span className="font-display font-black text-rose-400 uppercase text-xs tracking-widest mt-2">{t('tails', lang)}</span>
            </div>
          </div>

          {result && playedChoice && !isFlipping && (
            <div className="mt-8 text-center animate-bounce">
              <span className="font-display font-black text-2xl md:text-3xl text-white uppercase">
                {result === playedChoice ? `${t('playerWins', lang)} +${winMult.toFixed(2)}x` : t('dealerWins', lang)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-4">
        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={isFlipping}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={isFlipping ? t('flipping', lang) : t('flipCoin', lang)}
          onAction={handleFlip}
          actionDisabled={isFlipping || betAmountUSD > user.balanceUSD}
        />
      </div>
    </div>
  );
};
