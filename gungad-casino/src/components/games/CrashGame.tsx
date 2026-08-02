import React, { useState, useEffect, useRef } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';
import { Flame, Rocket, History } from 'lucide-react';

interface CrashGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

// Генерируем честный crashPoint с house edge ~5%
function generateCrashPoint(): number {
  const rand = Math.random();
  // Распределение: ~55% краш ниже 1.5x, ~75% ниже 2x, ~90% ниже 5x, ~97% ниже 10x
  if (rand < 0.08) return parseFloat((1.00 + Math.random() * 0.04).toFixed(2));
  if (rand < 0.55) return parseFloat((1.01 + Math.random() * 0.49).toFixed(2));
  if (rand < 0.75) return parseFloat((1.5 + Math.random() * 0.5).toFixed(2));
  if (rand < 0.90) return parseFloat((2.0 + Math.random() * 3.0).toFixed(2));
  if (rand < 0.97) return parseFloat((5.0 + Math.random() * 5.0).toFixed(2));
  return parseFloat((10.0 + Math.random() * 90.0).toFixed(2));
}

export const CrashGame: React.FC<CrashGameProps> = ({
  user, currency, lang, onUpdateBalance, onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  // autoCashout по умолчанию пустой
  const [autoCashout, setAutoCashout] = useState<string>('');
  const [gameState, setGameState] = useState<'waiting' | 'running' | 'crashed' | 'cashed_out'>('waiting');
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [cashedMultiplier, setCashedMultiplier] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([1.12, 1.45, 1.05, 3.20, 1.18, 1.02, 1.65]);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(5);
  const [hasBet, setHasBet] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const multiplierRef = useRef<number>(1.0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Перманентный цикл: waiting 5s -> running -> crashed -> waiting 5s -> ...
  useEffect(() => {
    startCountdown();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const startCountdown = () => {
    setGameState('waiting');
    setMultiplier(1.0);
    multiplierRef.current = 1.0;
    setCountdown(5);
    setHasBet(false);

    let c = 5;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        runRound();
      }
    }, 1000);
  };

  const runRound = () => {
    const cp = generateCrashPoint();
    setCrashPoint(cp);
    setGameState('running');

    let current = 1.0;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      current = parseFloat((1 + Math.pow(elapsed * 0.38, 1.65)).toFixed(2));
      multiplierRef.current = current;
      setMultiplier(current);

      // auto cashout
      const acVal = parseFloat(autoCashout);
      if (!isNaN(acVal) && acVal > 1.01 && current >= acVal && current < cp) {
        doWin(current);
        return;
      }

      if (current >= cp) {
        soundFx.playExplosion();
        soundFx.playLoss();
        setGameState('crashed');
        setHistory(prev => [cp, ...prev.slice(0, 9)]);
        if (hasBetRef.current) {
          onAddHistory({
            id: String(Date.now()), gameId: 'crash', gameName: t('crashName', lang),
            timestamp: new Date(), betAmountUSD: betRef.current,
            multiplier: 0, payoutUSD: 0, win: false, currency,
          });
        }
        setTimeout(startCountdown, 2000);
        return;
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };

  // refs для доступа в closure
  const hasBetRef = useRef(false);
  const betRef = useRef(10);
  useEffect(() => { hasBetRef.current = hasBet; }, [hasBet]);
  useEffect(() => { betRef.current = betAmountUSD; }, [betAmountUSD]);

  const doWin = (winMult: number) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setCashedMultiplier(winMult);
    setGameState('cashed_out');
    const payoutUSD = betRef.current * winMult;
    onUpdateBalance(user.balanceUSD + payoutUSD);
    soundFx.playWin();
    if (winMult >= 5) confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    onAddHistory({
      id: String(Date.now()), gameId: 'crash', gameName: t('crashName', lang),
      timestamp: new Date(), betAmountUSD: betRef.current,
      multiplier: winMult, payoutUSD, win: true, currency,
    });
    setTimeout(startCountdown, 2000);
  };

  const handlePlaceBet = () => {
    if (gameState !== 'waiting') return;
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD) return;
    onUpdateBalance(user.balanceUSD - betAmountUSD);
    setLastBetUSD(betAmountUSD);
    setHasBet(true);
    soundFx.playClick();
  };

  const handleCashout = () => {
    if (gameState !== 'running' || !hasBet) return;
    doWin(multiplierRef.current);
  };

  // Canvas draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width = canvas.parentElement?.clientWidth || 600;
    const height = canvas.height = 280;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke(); }
    for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke(); }

    if (gameState === 'running' || gameState === 'crashed' || gameState === 'cashed_out') {
      const cur = multiplierRef.current;
      const startX = 40, startY = height - 40;
      const progress = Math.min(1, (cur - 1) / 12);
      const targetX = startX + (width - 80) * Math.min(1, progress);
      const targetY = startY - (height - 80) * Math.min(0.85, progress);

      const grad = ctx.createLinearGradient(0, height, width, 0);
      if (gameState === 'crashed') { grad.addColorStop(0,'#9f1239'); grad.addColorStop(1,'#f43f5e'); }
      else { grad.addColorStop(0,'#9f1239'); grad.addColorStop(0.5,'#e11d48'); grad.addColorStop(1,'#ff4d6d'); }

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(startX + (targetX - startX) * 0.5, startY, targetX, targetY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.shadowColor = '#e11d48';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (gameState !== 'crashed') {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#f43f5e';
        ctx.shadowColor = '#ff4d6d';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }, [multiplier, gameState]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* History */}
        <div className="bg-[#111115] border border-zinc-800 rounded-xl p-2.5 flex items-center gap-2 overflow-x-auto">
          <History className="w-4 h-4 text-zinc-500 shrink-0" />
          {history.map((h, i) => (
            <span key={i} className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold shrink-0 ${
              h >= 2.0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50' : 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
            }`}>{h.toFixed(2)}x</span>
          ))}
        </div>

        {/* Canvas */}
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-4 min-h-[320px] flex flex-col justify-between overflow-hidden shadow-2xl red-border-glow">
          <div className="flex justify-between items-center z-10">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-rose-500 animate-pulse" />
              <span className="font-display font-bold text-white uppercase text-sm tracking-wide">{t('crashName', lang)}</span>
            </div>
            {gameState === 'running' && (
              <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-600/50 px-3 py-1 rounded-full text-xs font-mono font-bold text-rose-300">
                <Flame className="w-3.5 h-3.5 text-rose-500 animate-bounce" />
                {t('liveLabel', lang)}
              </div>
            )}
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
            {gameState === 'waiting' && (
              <div className="text-center">
                <span className="font-display font-black text-5xl md:text-6xl text-zinc-500">{countdown}s</span>
                <p className="text-zinc-500 text-sm mt-2">{t('nextRoundIn', lang)}</p>
              </div>
            )}
            {gameState === 'running' && (
              <div className="text-center">
                <span className="font-display font-black text-6xl md:text-8xl text-white drop-shadow-[0_0_30px_rgba(225,29,72,0.8)] tracking-tight">{multiplier.toFixed(2)}x</span>
                {hasBet && (
                  <p className="text-rose-400 text-sm mt-1 font-mono">{t('profit', lang)}: {formatCurrency(betAmountUSD * (multiplier - 1), currency)}</p>
                )}
              </div>
            )}
            {gameState === 'crashed' && (
              <div className="text-center animate-bounce">
                <span className="font-display font-black text-5xl md:text-6xl text-rose-500 drop-shadow-[0_0_40px_rgba(244,63,94,0.9)] uppercase">
                  {t('crashedAt', lang)} {multiplier.toFixed(2)}x
                </span>
              </div>
            )}
            {gameState === 'cashed_out' && (
              <div className="text-center">
                <span className="font-display font-black text-5xl md:text-6xl text-emerald-400 drop-shadow-[0_0_40px_rgba(16,185,129,0.9)] uppercase">
                  {t('cashedOutAt', lang)} {cashedMultiplier.toFixed(2)}x
                </span>
                <p className="text-emerald-300 font-bold text-lg mt-2">+{formatCurrency(betAmountUSD * cashedMultiplier, currency)}</p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="w-full h-[280px] rounded-xl" />
        </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-4">
        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={gameState !== 'waiting' && gameState !== 'running'}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={
            gameState === 'running' && hasBet
              ? `${t('cashout', lang)} (${multiplier.toFixed(2)}x)`
              : gameState === 'waiting'
              ? hasBet ? `✓ ${t('betPlaced', lang)}` : t('placeBet', lang)
              : t('waitingForRound', lang)
          }
          onAction={gameState === 'running' && hasBet ? handleCashout : handlePlaceBet}
          actionDisabled={
            (gameState === 'waiting' && (hasBet || betAmountUSD > user.balanceUSD)) ||
            (gameState !== 'waiting' && !(gameState === 'running' && hasBet))
          }
          actionColor={gameState === 'running' && hasBet ? 'green' : 'red'}
        />

        {/* Auto cashout */}
        <div className="bg-[#111115] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('autoCashoutLabel', lang)}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="1.01"
              max="1000"
              placeholder={t('autoCashoutPlaceholder', lang)}
              value={autoCashout}
              onChange={(e) => setAutoCashout(e.target.value)}
              disabled={gameState === 'running'}
              className="w-full bg-[#0a0a0d] border border-zinc-800 text-white font-mono font-bold text-base rounded-xl px-3 py-2 outline-none focus:border-rose-600 placeholder:text-zinc-600"
            />
            <span className="text-zinc-500 font-bold text-sm">x</span>
          </div>
        </div>
      </div>
    </div>
  );
};
