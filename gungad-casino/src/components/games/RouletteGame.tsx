import React, { useState, useEffect, useRef } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';

interface RouletteGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

const ROULETTE_NUMBERS = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,
  5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26,
];
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

type BetType = 'red'|'black'|'zero'|'even'|'odd'|'1to18'|'19to36'|'1stDozen'|'2ndDozen'|'3rdDozen'|'col1'|'col2'|'col3'|number;

interface PlacedBet {
  type: BetType;
  amountUSD: number;
}

const MAX_BETS = 13;

function getNumberColor(num: number) {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

function evalBet(bet: BetType, winner: number): { win: boolean; multiplier: number } {
  if (typeof bet === 'number') {
    return { win: bet === winner, multiplier: 36 };
  }
  if (bet === 'red')    return { win: RED_NUMBERS.includes(winner) && winner !== 0, multiplier: 2 };
  if (bet === 'black')  return { win: !RED_NUMBERS.includes(winner) && winner !== 0, multiplier: 2 };
  if (bet === 'zero')   return { win: winner === 0, multiplier: 36 };
  if (bet === 'even')   return { win: winner !== 0 && winner % 2 === 0, multiplier: 2 };
  if (bet === 'odd')    return { win: winner !== 0 && winner % 2 !== 0, multiplier: 2 };
  if (bet === '1to18')  return { win: winner >= 1 && winner <= 18, multiplier: 2 };
  if (bet === '19to36') return { win: winner >= 19 && winner <= 36, multiplier: 2 };
  if (bet === '1stDozen') return { win: winner >= 1 && winner <= 12, multiplier: 3 };
  if (bet === '2ndDozen') return { win: winner >= 13 && winner <= 24, multiplier: 3 };
  if (bet === '3rdDozen') return { win: winner >= 25 && winner <= 36, multiplier: 3 };
  if (bet === 'col1')   return { win: winner !== 0 && winner % 3 === 1, multiplier: 3 };
  if (bet === 'col2')   return { win: winner !== 0 && winner % 3 === 2, multiplier: 3 };
  if (bet === 'col3')   return { win: winner !== 0 && winner % 3 === 0, multiplier: 3 };
  return { win: false, multiplier: 0 };
}

export const RouletteGame: React.FC<RouletteGameProps> = ({
  user, currency, lang, onUpdateBalance, onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [placedBets, setPlacedBets] = useState<PlacedBet[]>([]);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([14,0,32,19,7,25]);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const [spinDisplay, setSpinDisplay] = useState<number | null>(null);
  const [showNumbers, setShowNumbers] = useState<boolean>(false);
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalBetUSD = placedBets.reduce((s, b) => s + b.amountUSD, 0);

  const addBet = (type: BetType) => {
    if (isSpinning) return;
    if (placedBets.length >= MAX_BETS) return;
    // Увеличить ставку, если такой тип уже есть
    setPlacedBets(prev => {
      const exists = prev.find(b => b.type === type);
      if (exists) return prev.map(b => b.type === type ? { ...b, amountUSD: b.amountUSD + betAmountUSD } : b);
      return [...prev, { type, amountUSD: betAmountUSD }];
    });
    soundFx.playClick();
  };

  const removeBet = (type: BetType) => {
    setPlacedBets(prev => prev.filter(b => b.type !== type));
  };

  const clearBets = () => setPlacedBets([]);

  const handleSpin = () => {
    if (placedBets.length === 0 || totalBetUSD > user.balanceUSD || isSpinning) return;

    const stakeUSD = totalBetUSD;
    const betsSnapshot = [...placedBets];
    const balanceAfterBet = user.balanceUSD - stakeUSD;

    soundFx.playClick();
    onUpdateBalance(balanceAfterBet);
    setLastBetUSD(stakeUSD);
    setIsSpinning(true);
    setWinningNumber(null);
    setShowNumbers(true);

    const winnerIndex = Math.floor(Math.random() * ROULETTE_NUMBERS.length);
    const winnerNum = ROULETTE_NUMBERS[winnerIndex];

    // Центр выигрышного сектора должен оказаться строго под стрелкой (0°)
    const anglePerSeg = 360 / 37;
    const winnerCenterAngle = winnerIndex * anglePerSeg + anglePerSeg / 2;
    const targetMod = (360 - winnerCenterAngle) % 360;
    const currentMod = ((wheelRotation % 360) + 360) % 360;
    let delta = (targetMod - currentMod + 360) % 360;
    delta += 360 * 6; // полные обороты для анимации
    setWheelRotation(prev => prev + delta);

    // Быстро пролетающие числа в центре
    let tickSpeed = 60;
    let numIdx = 0;
    const totalDuration = 4000;
    const startTime = Date.now();

    const tickNumbers = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / totalDuration;
      tickSpeed = 60 + Math.pow(progress, 2) * 400; // замедление

      setSpinDisplay(ROULETTE_NUMBERS[numIdx % ROULETTE_NUMBERS.length]);
      numIdx++;

      if (elapsed < totalDuration - 300) {
        spinRef.current = setTimeout(tickNumbers, tickSpeed);
      } else {
        setSpinDisplay(winnerNum);
      }
    };
    tickNumbers();

    let ticks = 0;
    const tickSnd = setInterval(() => { soundFx.playSpinTick(); if (++ticks > 30) clearInterval(tickSnd); }, 110);

    setTimeout(() => {
      if (spinRef.current) clearTimeout(spinRef.current);
      setIsSpinning(false);
      setShowNumbers(false);
      setSpinDisplay(null);
      setWinningNumber(winnerNum);
      setHistory(prev => [winnerNum, ...prev.slice(0, 9)]);

      let totalPayout = 0;
      let anyWin = false;
      betsSnapshot.forEach(bet => {
        const { win, multiplier } = evalBet(bet.type, winnerNum);
        if (win) { totalPayout += bet.amountUSD * multiplier; anyWin = true; }
      });

      if (anyWin) {
        soundFx.playWin();
        if (totalPayout >= stakeUSD * 5) confetti({ particleCount: 80, spread: 70 });
        onUpdateBalance(balanceAfterBet + totalPayout);
      } else {
        soundFx.playLoss();
      }

      onAddHistory({
        id: String(Date.now()),
        gameId: 'roulette',
        gameName: t('rouletteName', lang),
        timestamp: new Date(),
        betAmountUSD: stakeUSD,
        multiplier: anyWin ? totalPayout / stakeUSD : 0,
        payoutUSD: totalPayout,
        win: anyWin,
        currency,
      });
    }, 4100);
  };

  const colorClass = (num: number) => {
    if (num === 0) return 'bg-emerald-600 text-white';
    return RED_NUMBERS.includes(num) ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-white';
  };

  const betLabel = (type: BetType): string => {
    if (typeof type === 'number') return String(type);
    const map: Record<string, string> = {
      red: t('betRed', lang), black: t('betBlack', lang), zero: '0',
      even: t('betEven', lang), odd: t('betOdd', lang),
      '1to18': t('bet1to18', lang), '19to36': t('bet19to36', lang),
      '1stDozen': t('bet1stDozen', lang), '2ndDozen': t('bet2ndDozen', lang), '3rdDozen': t('bet3rdDozen', lang),
      col1: t('betCol1', lang), col2: t('betCol2', lang), col3: t('betCol3', lang),
    };
    return map[type as string] || String(type);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* История */}
        <div className="bg-[#111115] border border-zinc-800 rounded-xl p-2.5 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-zinc-500 uppercase shrink-0">{t('lastNumbers', lang)}:</span>
          {history.map((num, idx) => (
            <span key={idx} className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${colorClass(num)}`}>{num}</span>
          ))}
        </div>

        {/* Wheel */}
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-4 flex flex-col items-center justify-center overflow-hidden shadow-2xl red-border-glow min-h-[300px]">
          {/* Pointer */}
          <div className="absolute top-3 z-20 left-1/2 -translate-x-1/2">
            <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-rose-600 drop-shadow-[0_0_8px_rgba(225,29,72,0.9)]" />
          </div>

          {/* Wheel SVG with numbers */}
          <div
            className="w-56 h-56 md:w-72 md:h-72 rounded-full border-4 border-zinc-800 relative shadow-[0_0_50px_rgba(0,0,0,0.9)] transition-transform duration-[4000ms] ease-out"
            style={{ transform: `rotate(${wheelRotation}deg)` }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full rounded-full">
              {ROULETTE_NUMBERS.map((num, i) => {
                const sliceAngle = 360 / 37;
                const startAngle = sliceAngle * i;
                const endAngle = sliceAngle * (i + 1);
                const color = num === 0 ? '#10b981' : RED_NUMBERS.includes(num) ? '#e11d48' : '#1a1a1e';

                const toRad = (deg: number) => (deg * Math.PI) / 180;
                const r = 100;
                const x1 = 100 + r * Math.sin(toRad(startAngle));
                const y1 = 100 - r * Math.cos(toRad(startAngle));
                const x2 = 100 + r * Math.sin(toRad(endAngle));
                const y2 = 100 - r * Math.cos(toRad(endAngle));

                const midAngle = startAngle + sliceAngle / 2;
                const tr = 76;
                const tx = 100 + tr * Math.sin(toRad(midAngle));
                const ty = 100 - tr * Math.cos(toRad(midAngle));

                return (
                  <g key={num}>
                    <path d={`M100,100 L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`} fill={color} stroke="#27272a" strokeWidth="0.5" />
                    <text
                      x={tx} y={ty}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="7" fontWeight="bold" fill="white"
                      transform={`rotate(${midAngle}, ${tx}, ${ty})`}
                      opacity="0.9"
                    >
                      {num}
                    </text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="32" fill="#09090b" stroke="#e11d48" strokeWidth="2" />
              <circle cx="100" cy="100" r="12" fill="#e11d48" />
            </svg>
          </div>

          {/* Центральный дисплей чисел во время вращения */}
          {showNumbers && spinDisplay !== null && (
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center font-display font-black text-2xl shadow-2xl border-4 ${
                spinDisplay === 0 ? 'bg-emerald-600 border-emerald-400 text-white'
                : RED_NUMBERS.includes(spinDisplay) ? 'bg-rose-600 border-rose-400 text-white'
                : 'bg-zinc-900 border-zinc-600 text-white'
              }`}>
                {spinDisplay}
              </div>
            </div>
          )}

          {/* Winning badge */}
          {winningNumber !== null && !isSpinning && (
            <div className="absolute z-30 bottom-4 left-1/2 -translate-x-1/2 bg-zinc-950/90 border-2 border-rose-500 rounded-2xl px-6 py-2 shadow-2xl text-center">
              <span className={`font-display font-black text-3xl ${
                RED_NUMBERS.includes(winningNumber) ? 'text-rose-500'
                : winningNumber === 0 ? 'text-emerald-400' : 'text-zinc-200'
              }`}>{winningNumber}</span>
            </div>
          )}
        </div>

        {/* Betting Board */}
        <div className="bg-[#111115] border border-zinc-800 rounded-2xl p-3 flex flex-col gap-3">
          {/* Лимит ставок */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase">{t('selectBets', lang)} ({placedBets.length}/{MAX_BETS})</span>
            {placedBets.length > 0 && (
              <button onClick={clearBets} className="text-xs text-rose-400 hover:text-rose-300 font-bold">{t('clearBets', lang)}</button>
            )}
          </div>

          {/* Числа 1-36 */}
          <div className="grid grid-cols-12 gap-0.5">
            {/* 0 */}
            <button
              onClick={() => addBet(0)}
              disabled={isSpinning}
              className={`col-span-12 py-1 rounded text-xs font-bold font-mono transition-all ${
                placedBets.find(b => b.type === 0) ? 'bg-emerald-600 text-white ring-1 ring-emerald-400' : 'bg-emerald-900/60 text-emerald-400 hover:bg-emerald-700'
              } ${placedBets.length >= MAX_BETS && !placedBets.find(b => b.type === 0) ? 'opacity-40 cursor-not-allowed' : ''}`}
            >0</button>

            {Array.from({ length: 36 }, (_, i) => i + 1).map(num => (
              <button
                key={num}
                onClick={() => addBet(num)}
                disabled={isSpinning}
                className={`aspect-square flex items-center justify-center rounded text-[10px] font-bold font-mono transition-all ${
                  placedBets.find(b => b.type === num)
                    ? RED_NUMBERS.includes(num)
                      ? 'bg-rose-500 text-white ring-1 ring-white'
                      : 'bg-zinc-200 text-zinc-900 ring-1 ring-white'
                    : RED_NUMBERS.includes(num)
                    ? 'bg-rose-800/60 text-rose-300 hover:bg-rose-600'
                    : 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-600'
                } ${placedBets.length >= MAX_BETS && !placedBets.find(b => b.type === num) ? 'opacity-40 cursor-not-allowed' : ''}`}
              >{num}</button>
            ))}
          </div>

          {/* Внешние ставки */}
          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
            {([
              ['red','black','zero'],
              ['even','odd',''],
              ['1to18','19to36',''],
              ['1stDozen','2ndDozen','3rdDozen'],
              ['col1','col2','col3'],
            ] as BetType[][]).map((row, ri) => (
              <React.Fragment key={ri}>
                {row.map((type, ci) => type === '' ? <div key={ci} /> : (
                  <button
                    key={ci}
                    onClick={() => addBet(type)}
                    disabled={isSpinning}
                    className={`py-1.5 px-1 rounded border text-center transition-all truncate ${
                      placedBets.find(b => b.type === type)
                        ? 'bg-rose-600/40 border-rose-500 text-rose-200 ring-1 ring-rose-400'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    } ${placedBets.length >= MAX_BETS && !placedBets.find(b => b.type === type) ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {betLabel(type)}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* Активные ставки */}
          {placedBets.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {placedBets.map((b, i) => (
                <div key={i} className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-[10px]">
                  <span className="text-zinc-200 font-bold">{betLabel(b.type)}</span>
                  <span className="text-rose-400 font-mono">{formatCurrency(b.amountUSD, currency)}</span>
                  <button onClick={() => removeBet(b.type)} className="text-zinc-500 hover:text-red-400 ml-0.5 font-bold">×</button>
                </div>
              ))}
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
          disabled={isSpinning}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={isSpinning ? t('spinning', lang) : `${t('spinWheel', lang)} (${formatCurrency(totalBetUSD, currency)})`}
          onAction={handleSpin}
          actionDisabled={isSpinning || placedBets.length === 0 || totalBetUSD > user.balanceUSD}
        />
      </div>
    </div>
  );
};
