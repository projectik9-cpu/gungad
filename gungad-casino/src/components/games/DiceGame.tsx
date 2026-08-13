import React, { useEffect, useRef, useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';
import { RefreshCw } from 'lucide-react';
import { housePayoutFactor } from '../../game/demoOdds';

interface DiceGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

export const DiceGame: React.FC<DiceGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [targetValue, setTargetValue] = useState<number>(50);
  const [mode, setMode] = useState<'over' | 'under'>('over');
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
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

  // Win chance calculation
  const winChance = mode === 'over' ? 100 - targetValue : targetValue;
  const multiplier = parseFloat(((99 * housePayoutFactor(playMode === 'demo')) / winChance).toFixed(4));
  const potentialProfitUSD = betAmountUSD * (multiplier - 1);

  const handleRoll = () => {
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD || isRolling) return;

    soundFx.playClick();
    onUpdateBalance(user.balanceUSD - betAmountUSD);
    setLastBetUSD(betAmountUSD);
    setIsRolling(true);

    let count = 0;
    const interval = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(interval);
        return;
      }
      soundFx.playSpinTick();
      setLastRoll(parseFloat((Math.random() * 100).toFixed(2)));
      count++;
      if (count > 12) clearInterval(interval);
    }, 60);
    timersRef.current.push(interval);

    const done = setTimeout(() => {
      clearInterval(interval);
      if (!mountedRef.current) return;
      const finalRoll = parseFloat((Math.random() * 99.99).toFixed(2));
      setLastRoll(finalRoll);
      setIsRolling(false);

      const win = mode === 'over' ? finalRoll > targetValue : finalRoll < targetValue;
      const payoutUSD = win ? betAmountUSD * multiplier : 0;

      if (win) {
        soundFx.playWin();
        if (multiplier >= 5) confetti({ particleCount: 70, spread: 60 });
        onUpdateBalance(user.balanceUSD - betAmountUSD + payoutUSD);
      } else {
        soundFx.playLoss();
      }

      onAddHistory({
        id: String(Date.now()),
        gameId: 'dice',
        gameName: t('diceName', lang),
        timestamp: new Date(),
        betAmountUSD,
        multiplier: win ? multiplier : 0,
        payoutUSD,
        win,
        currency,
      });
    }, 800);
    timersRef.current.push(done);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:flex-1 lg:min-h-0 lg:items-stretch">
      {/* Dice Stage */}
      <div className="lg:col-span-8 flex flex-col gap-4 lg:min-h-[calc(100dvh-7.5rem)] lg:h-full">
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-6 min-h-[360px] lg:min-h-[min(58dvh,560px)] lg:flex-1 flex flex-col justify-between shadow-2xl red-border-glow">
          {/* Roll Result Readout */}
          <div className="flex flex-col items-center justify-center my-6">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">
              {t('result', lang)}
            </span>
            <div
              className={`font-display font-black text-6xl md:text-8xl transition-all ${
                lastRoll === null
                  ? 'text-zinc-700'
                  : isRolling
                  ? 'text-rose-400'
                  : (mode === 'over' && lastRoll > targetValue) || (mode === 'under' && lastRoll < targetValue)
                  ? 'text-emerald-400 drop-shadow-[0_0_30px_rgba(16,185,129,0.8)]'
                  : 'text-rose-500 drop-shadow-[0_0_30px_rgba(225,29,72,0.8)]'
              }`}
            >
              {lastRoll !== null ? lastRoll.toFixed(2) : '50.00'}
            </div>
          </div>

          {/* Slider & Controls */}
          <div className="flex flex-col gap-6 bg-[#111115] border border-zinc-800 rounded-2xl p-6">
            {/* Range Slider */}
            <div className="relative flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs font-mono font-bold text-zinc-400">
                <span>0</span>
                <span className="text-rose-400 text-sm">{t('targetLabel', lang, { n: targetValue })}</span>
                <span>100</span>
              </div>
              <input
                type="range"
                min="2"
                max="98"
                step="1"
                value={targetValue}
                onChange={(e) => setTargetValue(parseFloat(e.target.value))}
                disabled={isRolling}
                className="w-full accent-rose-600 h-3 bg-zinc-900 rounded-lg cursor-pointer"
              />
            </div>

            {/* Mode Switcher & Stats Readouts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setMode(mode === 'over' ? 'under' : 'over');
                }}
                disabled={isRolling}
                className="p-3 bg-zinc-900 border border-zinc-800 hover:border-rose-600 rounded-xl flex items-center justify-between transition-all"
              >
                <span className="text-xs text-zinc-400 uppercase font-bold">{t('modeLabel', lang)}</span>
                <span className="font-display font-bold text-rose-400 flex items-center gap-1 text-sm">
                  <RefreshCw className="w-3.5 h-3.5" />
                  {mode === 'over' ? t('rollOver', lang) : t('rollUnder', lang)}
                </span>
              </button>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col justify-center">
                <span className="text-xs text-zinc-400 uppercase font-bold">{t('multiplier', lang)}</span>
                <span className="font-mono font-bold text-white text-base">{multiplier}x</span>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col justify-center">
                <span className="text-xs text-zinc-400 uppercase font-bold">{t('winChance', lang)}</span>
                <span className="font-mono font-bold text-emerald-400 text-base">{winChance.toFixed(2)}%</span>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col justify-center">
                <span className="text-xs text-zinc-400 uppercase font-bold">{t('profit', lang)}</span>
                <span className="font-mono font-bold text-rose-400 text-base">
                  {formatCurrency(potentialProfitUSD, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="lg:col-span-4 flex flex-col gap-4 lg:h-full">
        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={isRolling}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={isRolling ? t('rolling', lang) : t('rollDice', lang)}
          onAction={handleRoll}
          actionDisabled={isRolling || betAmountUSD > user.balanceUSD}
          stretch
        />
      </div>
    </div>
  );
};
