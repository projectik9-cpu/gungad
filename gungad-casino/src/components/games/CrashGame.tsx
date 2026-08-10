import React, { useState, useEffect, useRef } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';
import { Flame, Rocket, History } from 'lucide-react';
import { generateCrashPoint } from '../../game/demoOdds';
import type { PlaceBetResult, ResolveBetResult } from '../../hooks/useGgBalance';
import { usdToCents, centsToUsd } from '../../types/database';

interface CrashGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
  placeBet: (params: { game_id: 'crash'; betUSD: number }) => Promise<PlaceBetResult>;
  resolveBet: (params: {
    bet_id: string;
    status: 'lost' | 'cashed_out' | 'cancelled';
    multiplier?: number;
    result?: Record<string, unknown>;
  }) => Promise<ResolveBetResult>;
  onRefreshWallet?: () => Promise<void>;
}

export const CrashGame: React.FC<CrashGameProps> = ({
  user, currency, lang, playMode = 'real', onAddHistory,
  placeBet, resolveBet, onRefreshWallet,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [autoCashout, setAutoCashout] = useState<string>('');
  const [gameState, setGameState] = useState<'waiting' | 'running' | 'crashed' | 'cashed_out'>('waiting');
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [cashedMultiplier, setCashedMultiplier] = useState<number>(0);
  const [cashedPayoutUSD, setCashedPayoutUSD] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([1.12, 1.45, 1.05, 3.20, 1.18, 1.02, 1.65]);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(5);
  const [hasBet, setHasBet] = useState<boolean>(false);
  const [placing, setPlacing] = useState(false);

  const playModeRef = useRef(playMode);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const multiplierRef = useRef<number>(1.0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const hasBetRef = useRef(false);
  const lockedStakeRef = useRef(0);
  const openBetIdRef = useRef<string | null>(null);
  const cashedOutRef = useRef(false);
  const autoCashoutRef = useRef(autoCashout);
  const resolvingRef = useRef(false);

  useEffect(() => { hasBetRef.current = hasBet; }, [hasBet]);
  useEffect(() => { autoCashoutRef.current = autoCashout; }, [autoCashout]);

  const clearLoopTimers = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    restartTimeoutRef.current = null;
  };

  const clearOpenBet = () => {
    openBetIdRef.current = null;
    lockedStakeRef.current = 0;
    hasBetRef.current = false;
    setHasBet(false);
  };

  const doWin = async (winMult: number) => {
    if (!mountedRef.current) return;
    if (!hasBetRef.current || !openBetIdRef.current) return;
    if (cashedOutRef.current || resolvingRef.current) return;

    cashedOutRef.current = true;
    resolvingRef.current = true;
    setCashedMultiplier(winMult);
    setCashedPayoutUSD(lockedStakeRef.current * winMult);
    setGameState('cashed_out');

    const stake = lockedStakeRef.current;
    const betId = openBetIdRef.current!;
    // Clear local open-bet immediately so next round cannot reuse it
    clearOpenBet();
    soundFx.playWin();
    if (winMult >= 5) confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });

    const res = await resolveBet({
      bet_id: betId,
      status: 'cashed_out',
      multiplier: winMult,
      result: { bet_cents: usdToCents(stake), phase: 'cashout' },
    });

    if (!mountedRef.current) {
      resolvingRef.current = false;
      return;
    }

    if (!res.ok) {
      console.warn('[crash] resolve cashout failed', res.error);
      await onRefreshWallet?.();
    } else {
      const payoutUSD = centsToUsd(res.payout_cents ?? Math.round(stake * winMult * 100));
      onAddHistory({
        id: betId,
        gameId: 'crash',
        gameName: t('crashName', lang),
        timestamp: new Date(),
        betAmountUSD: stake,
        multiplier: winMult,
        payoutUSD,
        win: true,
        currency,
        serverSettled: true,
      });
    }

    resolvingRef.current = false;
  };

  const settleLoss = async () => {
    if (!hasBetRef.current || !openBetIdRef.current) return;
    if (cashedOutRef.current || resolvingRef.current) return;

    resolvingRef.current = true;
    const stake = lockedStakeRef.current;
    const betId = openBetIdRef.current!;
    clearOpenBet();

    soundFx.playExplosion();
    onAddHistory({
      id: betId,
      gameId: 'crash',
      gameName: t('crashName', lang),
      timestamp: new Date(),
      betAmountUSD: stake,
      multiplier: 0,
      payoutUSD: 0,
      win: false,
      currency,
      serverSettled: true,
    });

    const res = await resolveBet({
      bet_id: betId,
      status: 'lost',
      multiplier: 0,
      result: { bet_cents: usdToCents(stake), phase: 'crash' },
    });

    if (!res.ok) {
      console.warn('[crash] resolve loss failed', res.error);
      await onRefreshWallet?.();
    }

    resolvingRef.current = false;
  };

  const runRound = () => {
    if (!mountedRef.current) return;
    const cp = generateCrashPoint(playModeRef.current === 'demo');
    setCrashPoint(cp);
    cashedOutRef.current = false;
    setGameState('running');

    let current = 1.0;
    const startTime = Date.now();

    const tick = () => {
      if (!mountedRef.current) return;
      const elapsed = (Date.now() - startTime) / 1000;
      current = parseFloat((1 + Math.pow(elapsed * (0.38 / 1.15), 1.65)).toFixed(2));
      multiplierRef.current = current;
      setMultiplier(current);

      const acVal = parseFloat(autoCashoutRef.current);
      if (
        hasBetRef.current &&
        openBetIdRef.current &&
        !cashedOutRef.current &&
        !isNaN(acVal) &&
        acVal > 1.01 &&
        current >= acVal &&
        current < cp
      ) {
        void doWin(current);
      }

      if (current >= cp) {
        setHistory(prev => [cp, ...prev.slice(0, 9)]);
        if (!cashedOutRef.current) {
          setGameState('crashed');
          if (hasBetRef.current && openBetIdRef.current) {
            void settleLoss();
          }
        } else {
          setGameState('crashed');
        }
        cashedOutRef.current = false;
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          restartTimeoutRef.current = null;
          startCountdown();
        }, 2500);
        return;
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };

  const startCountdown = () => {
    if (!mountedRef.current) return;
    setGameState('waiting');
    setMultiplier(1.0);
    multiplierRef.current = 1.0;
    cashedOutRef.current = false;
    setCountdown(5);
    setHasBet(false);

    let c = 5;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      if (!mountedRef.current) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        return;
      }
      c--;
      setCountdown(c);
      if (c <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        runRound();
      }
    }, 1000);
  };

  useEffect(() => {
    mountedRef.current = true;
    startCountdown();
    return () => {
      mountedRef.current = false;
      clearLoopTimers();
      // Cancel open pending bet on unmount if still pending
      const betId = openBetIdRef.current;
      if (betId) {
        const stake = lockedStakeRef.current;
        void resolveBet({
          bet_id: betId,
          status: 'cancelled',
          multiplier: 0,
          result: { bet_cents: usdToCents(stake), phase: 'unmount' },
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlaceBet = async () => {
    if (gameState !== 'waiting') return;
    if (hasBet || placing) return;
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD) return;

    setPlacing(true);
    const stake = betAmountUSD;
    const res = await placeBet({ game_id: 'crash', betUSD: stake });
    if (!mountedRef.current) return;

    if (!res.ok || !res.bet_id) {
      console.warn('[crash] place failed', res.error);
      setPlacing(false);
      return;
    }

    lockedStakeRef.current = stake;
    openBetIdRef.current = res.bet_id;
    hasBetRef.current = true;
    setLastBetUSD(stake);
    setHasBet(true);
    setPlacing(false);
    soundFx.playClick();
  };

  const handleCashout = () => {
    if (gameState !== 'running' || !hasBet) return;
    void doWin(multiplierRef.current);
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

      const grad = ctx.createLinearGradient(startX, startY, targetX, targetY);
      grad.addColorStop(0, '#be123c');
      grad.addColorStop(1, gameState === 'crashed' && !cashedMultiplier ? '#7f1d1d' : '#f43f5e');

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(startX + (targetX - startX) * 0.5, startY, targetX, targetY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f43f5e';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [multiplier, gameState, cashedMultiplier]);

  const betControlsDisabled = hasBet || gameState === 'running' || gameState !== 'waiting';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-in fade-in duration-500">
      <div className="lg:col-span-8 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-black text-white tracking-tight">{t('crashName', lang)}</h2>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[60%]">
            <History className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            {history.map((h, i) => (
              <span
                key={i}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                  h >= 2 ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                }`}
              >
                {h.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>

        <div className="relative bg-[#0d0d10] border border-zinc-800/80 rounded-2xl overflow-hidden" style={{ minHeight: 280 }}>
          <canvas ref={canvasRef} className="w-full" style={{ height: 280 }} />

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {gameState === 'waiting' && (
              <div className="text-center">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-1">{t('nextRoundIn', lang)}</p>
                <p className="text-5xl font-black text-white tabular-nums">{countdown}</p>
              </div>
            )}
            {gameState === 'running' && (
              <p className="text-5xl font-black text-white tabular-nums drop-shadow-lg">
                {multiplier.toFixed(2)}x
              </p>
            )}
            {gameState === 'cashed_out' && (
              <div className="text-center">
                <p className="text-emerald-400 text-2xl font-black uppercase tracking-wide">
                  {t('cashedOutAt', lang)} {cashedMultiplier.toFixed(2)}x
                </p>
                <p className="text-emerald-300 text-lg font-bold mt-1">
                  +{formatCurrency(cashedPayoutUSD, currency)}
                </p>
              </div>
            )}
            {gameState === 'crashed' && !cashedMultiplier && (
              <div className="text-center">
                <Flame className="w-8 h-8 text-rose-500 mx-auto mb-1" />
                <p className="text-rose-400 text-3xl font-black">{crashPoint.toFixed(2)}x</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-4">
        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={betControlsDisabled}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={
            gameState === 'running' && hasBet
              ? `${t('cashout', lang)} (${multiplier.toFixed(2)}x)`
              : gameState === 'waiting'
              ? hasBet ? `✓ ${t('betPlaced', lang)}` : placing ? '...' : t('crashFly', lang)
              : t('waitingForRound', lang)
          }
          onAction={gameState === 'running' && hasBet ? handleCashout : () => { void handlePlaceBet(); }}
          actionDisabled={
            placing ||
            (gameState === 'waiting' && (hasBet || betAmountUSD > user.balanceUSD || betAmountUSD <= 0)) ||
            (gameState !== 'waiting' && !(gameState === 'running' && hasBet))
          }
          actionColor={gameState === 'running' && hasBet ? 'green' : 'red'}
        />

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
              disabled={gameState === 'running' || hasBet}
              className="w-full bg-[#0a0a0d] border border-zinc-800 text-white font-mono font-bold text-base rounded-xl px-3 py-2 outline-none focus:border-rose-600 placeholder:text-zinc-600"
            />
            <span className="text-zinc-500 font-bold text-sm">x</span>
          </div>
        </div>
      </div>
    </div>
  );
};
