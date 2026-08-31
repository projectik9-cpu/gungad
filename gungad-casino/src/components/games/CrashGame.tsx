import React, { useState, useEffect, useRef } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';
import { Flame, Rocket, History } from 'lucide-react';
import { generateCrashPoint } from '../../game/demoOdds';
import { consumeWarmupBet, isWarmupActive } from '../../game/playerHeat';
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

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

function multColor(m: number): string {
  if (m >= 5) return '#fb7185';
  if (m >= 2) return '#fbbf24';
  return '#f43f5e';
}

function historyPillClass(h: number): string {
  if (h >= 2) return 'bg-emerald-950/90 text-emerald-400 border-emerald-800/50';
  if (h >= 1.5) return 'bg-amber-950/90 text-amber-400 border-amber-800/50';
  return 'bg-rose-950/90 text-rose-400 border-rose-800/50';
}

const CRASH_HISTORY_KEY = 'gg_crash_history';
/** Same exponential rate every round so line speed never leaks the crash point. */
const CRASH_GROWTH = 0.11;
/** Visual path maps log(m) onto a fixed 12x span — not onto this round's crash. */
const CRASH_VISUAL_MAX = 12;

function loadCrashHistory(): number[] {
  try {
    const raw = localStorage.getItem(CRASH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n: unknown) => typeof n === 'number' && n >= 1).slice(0, 10);
  } catch {
    return [];
  }
}

function saveCrashHistory(history: number[]) {
  try {
    localStorage.setItem(CRASH_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {
    /* ignore */
  }
}

export const CrashGame: React.FC<CrashGameProps> = ({
  user, currency, lang, playMode = 'real', onAddHistory, onUpdateBalance,
  placeBet, resolveBet, onRefreshWallet,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [autoCashout, setAutoCashout] = useState<string>('');
  const [gameState, setGameState] = useState<'waiting' | 'running' | 'crashed' | 'cashed_out'>('waiting');
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [cashedMultiplier, setCashedMultiplier] = useState<number>(0);
  const [cashedPayoutUSD, setCashedPayoutUSD] = useState<number>(0);
  const [history, setHistory] = useState<number[]>(() => loadCrashHistory());
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(5);
  const [hasBet, setHasBet] = useState<boolean>(false);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const placeWaitRef = useRef<Promise<string | null> | null>(null);

  const playModeRef = useRef(playMode);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);
  const balanceUsdRef = useRef(user.balanceUSD);
  useEffect(() => { balanceUsdRef.current = user.balanceUSD; }, [user.balanceUSD]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
  const drawRef = useRef<number | null>(null);
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

  const gameStateRef = useRef(gameState);
  const cashedMultRef = useRef(0);
  const pathPointsRef = useRef<{ x: number; y: number; m: number }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const cashoutPointRef = useRef<{ x: number; y: number } | null>(null);
  const crashFlashRef = useRef(0);
  const roundStartRef = useRef(0);
  const crashPointRef = useRef(2);
  const roundIdRef = useRef(0);

  useEffect(() => { hasBetRef.current = hasBet; }, [hasBet]);
  useEffect(() => { autoCashoutRef.current = autoCashout; }, [autoCashout]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { cashedMultRef.current = cashedMultiplier; }, [cashedMultiplier]);

  const clearLoopTimers = () => {
    roundIdRef.current += 1; // invalidate any in-flight RAF ticks
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

  const spawnTrail = (x: number, y: number, hot: boolean) => {
    const list = particlesRef.current;
    if (list.length > 55) list.splice(0, list.length - 45);
    list.push({
      x: x - 4 + Math.random() * 8,
      y: y - 4 + Math.random() * 8,
      vx: -0.6 - Math.random() * 1.2,
      vy: (Math.random() - 0.5) * 1.4,
      life: 1,
      maxLife: 0.55 + Math.random() * 0.35,
      size: 1.5 + Math.random() * 2.5,
      color: hot ? 'rgba(251,191,36,' : 'rgba(244,63,94,',
    });
  };

  const spawnCrashBurst = (x: number, y: number) => {
    const list = particlesRef.current;
    for (let i = 0; i < 36; i++) {
      const a = (Math.PI * 2 * i) / 36 + Math.random() * 0.3;
      const sp = 2 + Math.random() * 5;
      list.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        maxLife: 0.7 + Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: Math.random() > 0.4 ? 'rgba(248,113,113,' : 'rgba(251,191,36,',
      });
    }
    crashFlashRef.current = 1;
  };

  const multToXY = (m: number, width: number, height: number) => {
    const startX = 28;
    const startY = height * 0.78;
    const p = Math.min(0.97, Math.log(Math.max(1, m)) / Math.log(CRASH_VISUAL_MAX));
    const x = startX + (width - 56) * p;
    const y = startY - (startY - height * 0.12) * p;
    return { x, y };
  };

  const drawRocket = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-11, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-6, -3.5);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-6, 3.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,191,36,0.9)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, 0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  };

  const arenaCssHeight = (arena: HTMLElement | null, fallbackW = 600) => {
    if (arena?.clientHeight && arena.clientHeight > 40) {
      return Math.max(280, arena.clientHeight);
    }
    const w = arena?.clientWidth || fallbackW;
    return Math.max(280, Math.min(400, Math.round(w * 0.55)));
  };

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const arena = arenaRef.current;
    if (!canvas || !arena) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = arena.clientWidth || 600;
    const cssH = arenaCssHeight(arena, cssW);
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = cssW;
    const height = cssH;

    // Atmosphere
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#14060a');
    bg.addColorStop(0.45, '#0c0c10');
    bg.addColorStop(1, '#070709');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(
      width * 0.55, height * 0.35, height * 0.1,
      width * 0.5, height * 0.5, height * 0.85,
    );
    vignette.addColorStop(0, 'rgba(225,29,72,0.10)');
    vignette.addColorStop(0.55, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Perspective grid
    ctx.save();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = height * 0.15 + (height * 0.78) * t;
      const alpha = 0.03 + (1 - t) * 0.04;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = 20 + (width - 40) * t;
      ctx.strokeStyle = `rgba(255,255,255,${0.025 + Math.abs(0.5 - t) * 0.02})`;
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, height - 16);
      ctx.stroke();
    }
    ctx.restore();

    const state = gameStateRef.current;
    const cur = multiplierRef.current;
    const points = pathPointsRef.current;

    // Path + fill
    if (points.length >= 2 && (state === 'running' || state === 'crashed' || state === 'cashed_out')) {
      const tip = points[points.length - 1];
      const strokeCol = state === 'crashed' && !cashedMultRef.current ? '#9f1239' : multColor(cur);

      // Fill under curve
      ctx.beginPath();
      ctx.moveTo(points[0].x, height * 0.82);
      ctx.lineTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const cpx = (p0.x + p1.x) / 2;
        const cpy = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, cpx, cpy);
      }
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(tip.x, height * 0.82);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, tip.y, 0, height);
      fill.addColorStop(0, state === 'crashed' && !cashedMultRef.current ? 'rgba(127,29,29,0.35)' : 'rgba(244,63,94,0.28)');
      fill.addColorStop(1, 'rgba(244,63,94,0)');
      ctx.fillStyle = fill;
      ctx.fill();

      // Glow stroke
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const cpx = (p0.x + p1.x) / 2;
        const cpy = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, cpx, cpy);
      }
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = strokeCol;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Core thin line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Cashout marker
      const co = cashoutPointRef.current;
      if (co && (state === 'cashed_out' || cashedMultRef.current > 0)) {
        ctx.beginPath();
        ctx.arc(co.x, co.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (state === 'running' || (state === 'cashed_out' && cashedMultRef.current > 0)) {
        const prev = points[Math.max(0, points.length - 2)];
        const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
        const pulse = 10 + Math.sin(Date.now() / 90) * 2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, pulse + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,63,94,0.18)';
        ctx.fill();
        drawRocket(ctx, tip.x, tip.y, angle, strokeCol);
      }
    }

    // Particles
    const parts = particlesRef.current;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.016 / p.maxLife;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${Math.max(0, p.life).toFixed(2)})`;
      ctx.fill();
    }

    // Crash flash
    if (crashFlashRef.current > 0) {
      ctx.fillStyle = `rgba(255,80,80,${crashFlashRef.current * 0.28})`;
      ctx.fillRect(0, 0, width, height);
      crashFlashRef.current = Math.max(0, crashFlashRef.current - 0.04);
    }
  };

  // Continuous draw loop for particles / waiting idle
  useEffect(() => {
    const loop = () => {
      if (!mountedRef.current) return;
      drawFrame();
      drawRef.current = requestAnimationFrame(loop);
    };
    drawRef.current = requestAnimationFrame(loop);
    return () => {
      if (drawRef.current) cancelAnimationFrame(drawRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doWin = async (winMult: number) => {
    if (!mountedRef.current) return;
    if (!hasBetRef.current) return;
    if (cashedOutRef.current || resolvingRef.current) return;

    cashedOutRef.current = true;
    resolvingRef.current = true;
    setCashedMultiplier(winMult);
    setCashedPayoutUSD(lockedStakeRef.current * winMult);
    setGameState('cashed_out');

    const arena = arenaRef.current;
    if (arena) {
      const { x, y } = multToXY(winMult, arena.clientWidth || 600, arenaCssHeight(arena));
      cashoutPointRef.current = { x, y };
    }

    const stake = lockedStakeRef.current;
    const betId = openBetIdRef.current || (placeWaitRef.current ? await placeWaitRef.current : null);
    if (!betId) {
      resolvingRef.current = false;
      await onRefreshWallet?.();
      return;
    }
    clearOpenBet();
    soundFx.playWin();
    if (winMult >= 5) confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 }, colors: ['#f43f5e', '#fb7185', '#fbbf24'] });

    const payoutUSD = stake * winMult;
    onUpdateBalance(balanceUsdRef.current + payoutUSD);

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
    if (!hasBetRef.current) return;
    if (cashedOutRef.current || resolvingRef.current) return;

    resolvingRef.current = true;
    const stake = lockedStakeRef.current;
    const betId = openBetIdRef.current || (placeWaitRef.current ? await placeWaitRef.current : null);
    if (!betId) {
      resolvingRef.current = false;
      clearOpenBet();
      await onRefreshWallet?.();
      return;
    }
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

    // Kill previous RAF / countdown / restart so we never run two flights
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    restartTimeoutRef.current = null;

    const roundId = ++roundIdRef.current;
    const cp = generateCrashPoint(playModeRef.current === 'demo', { warmup: isWarmupActive() });
    crashPointRef.current = cp;
    setCrashPoint(cp);
    cashedOutRef.current = false;
    cashedMultRef.current = 0;
    setCashedMultiplier(0);
    cashoutPointRef.current = null;
    pathPointsRef.current = [];
    particlesRef.current = [];
    crashFlashRef.current = 0;
    setGameState('running');
    roundStartRef.current = Date.now();

    let current = 1.0;
    const startTime = Date.now();
    const HARD_MAX_SECONDS = 90;

    const finishCrash = (finalMult: number) => {
      if (roundId !== roundIdRef.current) return;
      const crashAt = parseFloat(Math.min(finalMult, cp).toFixed(2));
      multiplierRef.current = crashAt;
      setMultiplier(crashAt);
      setHistory(prev => {
        const next = [crashAt, ...prev].slice(0, 10);
        saveCrashHistory(next);
        return next;
      });

      const arena = arenaRef.current;
      const w = arena?.clientWidth || 600;
      const h = arenaCssHeight(arena, w);
      const pos = multToXY(cp, w, h);
      const pts = pathPointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || last.m < cp) pts.push({ x: pos.x, y: pos.y, m: cp });
      spawnCrashBurst(pos.x, pos.y);

      const alreadyCashed = cashedOutRef.current || cashedMultRef.current > 0;
      if (alreadyCashed) {
        // Keep win overlay — don't wipe "ЗАБРАЛ" with a crash screen
        setGameState('cashed_out');
      } else {
        setGameState('crashed');
        if (hasBetRef.current && openBetIdRef.current) {
          void settleLoss();
        }
      }

      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = setTimeout(() => {
        restartTimeoutRef.current = null;
        if (roundId === roundIdRef.current) startCountdown();
      }, 2500);
    };

    const tick = () => {
      if (!mountedRef.current || roundId !== roundIdRef.current) return;
      const elapsed = (Date.now() - startTime) / 1000;
      current = parseFloat(Math.exp(CRASH_GROWTH * elapsed).toFixed(2));

      // Safety: never let the multiplier run away if crash check is missed
      if (elapsed >= HARD_MAX_SECONDS) {
        current = cp;
      }

      if (current >= cp) {
        finishCrash(cp);
        return;
      }

      multiplierRef.current = current;
      setMultiplier(current);

      const arena = arenaRef.current;
      const w = arena?.clientWidth || 600;
      const h = arenaCssHeight(arena, w);
      const pos = multToXY(current, w, h);
      const pts = pathPointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 2.5) {
        pts.push({ x: pos.x, y: pos.y, m: current });
        if (pts.length > 220) pts.shift();
      }
      spawnTrail(pos.x, pos.y, current >= 2);

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

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  };

  const startCountdown = () => {
    if (!mountedRef.current) return;

    const begin = () => {
      if (!mountedRef.current) return;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      roundIdRef.current += 1;

      if (!resolvingRef.current && openBetIdRef.current) {
        const leftover = openBetIdRef.current;
        void resolveBet({
          bet_id: leftover,
          status: 'cancelled',
          multiplier: 0,
          result: { phase: 'next_round' },
        });
      }
      if (!resolvingRef.current) {
        clearOpenBet();
        setHasBet(false);
      }

      setGameState('waiting');
      setMultiplier(1.0);
      multiplierRef.current = 1.0;
      cashedOutRef.current = false;
      setCashedMultiplier(0);
      cashedMultRef.current = 0;
      cashoutPointRef.current = null;
      pathPointsRef.current = [];
      crashPointRef.current = 2;
      setCountdown(5);

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

    if (placeWaitRef.current || resolvingRef.current) {
      void Promise.resolve(placeWaitRef.current)
        .then(async () => {
          let n = 0;
          while (resolvingRef.current && n < 40) {
            await new Promise((r) => setTimeout(r, 50));
            n += 1;
          }
        })
        .finally(() => {
          if (mountedRef.current) begin();
        });
      return;
    }
    begin();
  };

  useEffect(() => {
    mountedRef.current = true;
    startCountdown();
    return () => {
      mountedRef.current = false;
      clearLoopTimers();
      if (drawRef.current) cancelAnimationFrame(drawRef.current);
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

  const handlePlaceBet = () => {
    const gs = gameStateRef.current;
    const lateJoin = gs === 'running' && Date.now() - roundStartRef.current < 280;
    if (gs !== 'waiting' && !lateJoin) return;
    if (hasBetRef.current || placingRef.current) return;
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD) return;

    placingRef.current = true;
    setPlacing(true);
    const stake = betAmountUSD;
    const before = user.balanceUSD;
    hasBetRef.current = true;
    lockedStakeRef.current = stake;
    setLastBetUSD(stake);
    setHasBet(true);
    onUpdateBalance(before - stake);
    soundFx.playClick();
    consumeWarmupBet();
    setPlacing(false);
    placingRef.current = false;

    let settlePlace: (id: string | null) => void = () => {};
    placeWaitRef.current = new Promise((resolve) => {
      settlePlace = resolve;
    });

    void placeBet({ game_id: 'crash', betUSD: stake }).then((res) => {
      if (!mountedRef.current) {
        settlePlace(null);
        placeWaitRef.current = null;
        return;
      }
      if (!res.ok || !res.bet_id) {
        console.warn('[crash] place failed', res.error);
        onUpdateBalance(before);
        if (!openBetIdRef.current) {
          hasBetRef.current = false;
          lockedStakeRef.current = 0;
          setHasBet(false);
        }
        settlePlace(null);
        placeWaitRef.current = null;
        return;
      }
      openBetIdRef.current = res.bet_id;
      settlePlace(res.bet_id);
      placeWaitRef.current = null;
    });
  };

  const handleCashout = () => {
    if (gameState !== 'running' || !hasBet) return;
    void doWin(multiplierRef.current);
  };

  const betControlsDisabled = hasBet || gameState === 'running' || gameState !== 'waiting';
  const runningColor = multColor(multiplier);
  const countdownProgress = countdown / 5;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 animate-in fade-in duration-500">
      <div className="lg:col-span-8 flex flex-col gap-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-800/50 red-glow shrink-0">
              <Rocket className="w-4.5 h-4.5 text-rose-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight font-display truncate">
                  {t('crashName', lang)}
                </h2>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-950/80 border border-rose-800/40 text-[9px] font-black uppercase tracking-wider text-rose-300">
                  <span className="crash-live-dot w-1.5 h-1.5 rounded-full bg-rose-400" />
                  LIVE
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[55%] scrollbar-none">
            <History className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            {history.length === 0 ? (
              <span className="text-[10px] text-zinc-600 font-medium">—</span>
            ) : (
              history.map((h, i) => (
              <span
                key={`${h}-${i}`}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border crash-hist-in ${historyPillClass(h)}`}
                style={{ animationDelay: `${i * 20}ms` }}
              >
                {h.toFixed(2)}x
              </span>
              ))
            )}
          </div>
        </div>

        {/* Arena */}
        <div
          ref={arenaRef}
          className="relative z-0 rounded-2xl overflow-hidden border border-rose-900/40 red-border-glow bg-[#0a0a0d] h-[min(42dvh,360px)] sm:h-[360px] lg:h-[min(52vh,560px)]"
        >
          <canvas ref={canvasRef} className="w-full block" />

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {gameState === 'waiting' && (
              <div className="text-center crash-overlay-in">
                <div className="relative mx-auto w-28 h-28 mb-2">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="#e11d48"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - countdownProgress)}`}
                      className="transition-[stroke-dashoffset] duration-1000 linear"
                      style={{ filter: 'drop-shadow(0 0 6px rgba(225,29,72,0.7))' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl font-black text-white tabular-nums font-display crash-count-pulse">
                      {countdown}
                    </span>
                  </div>
                </div>
                <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-[0.2em]">
                  {t('nextRoundIn', lang)}
                </p>
              </div>
            )}

            {gameState === 'running' && (
              <div className="text-center crash-overlay-in">
                <p
                  className="text-6xl sm:text-7xl font-black tabular-nums font-display crash-mult-pulse drop-shadow-lg"
                  style={{
                    color: runningColor,
                    textShadow: `0 0 28px ${runningColor}99, 0 0 60px ${runningColor}44`,
                  }}
                >
                  {multiplier.toFixed(2)}x
                </p>
                {hasBet && (
                  <p className="mt-2 text-xs font-bold text-emerald-400/90 uppercase tracking-wider">
                    {t('cashout', lang)} → {formatCurrency(lockedStakeRef.current * multiplier, currency)}
                  </p>
                )}
              </div>
            )}

            {gameState === 'cashed_out' && (
              <div className="text-center crash-overlay-in px-4">
                <p className="text-emerald-400 text-2xl sm:text-3xl font-black uppercase tracking-wide font-display"
                  style={{ textShadow: '0 0 24px rgba(52,211,153,0.55)' }}>
                  {t('cashedOutAt', lang)} {cashedMultiplier.toFixed(2)}x
                </p>
                <p className="text-emerald-300 text-xl font-bold mt-2 tabular-nums">
                  +{formatCurrency(cashedPayoutUSD, currency)}
                </p>
              </div>
            )}

            {gameState === 'crashed' && !cashedMultiplier && (
              <div className="text-center crash-overlay-in">
                <Flame className="w-10 h-10 text-rose-500 mx-auto mb-2 crash-flame" />
                <p className="text-rose-400 text-4xl font-black font-display tabular-nums"
                  style={{ textShadow: '0 0 28px rgba(244,63,94,0.6)' }}>
                  {crashPoint.toFixed(2)}x
                </p>
              </div>
            )}

            {gameState === 'crashed' && cashedMultiplier > 0 && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  crash @ {crashPoint.toFixed(2)}x
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls sit below the arena so the rocket never flies behind the bet panel */}
      <div className="lg:col-span-4 flex flex-col gap-2 lg:gap-3 relative z-10 bg-transparent pt-0 pb-2">
        <div className="rounded-2xl border border-rose-900/35 bg-gradient-to-b from-[#141018] to-[#0c0c10] p-1 red-border-glow">
          <div className="rounded-[0.9rem] bg-[#0a0a0d]/80 p-2 sm:p-3">
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
              compact
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/90 bg-[#111115]/95 px-3 py-2 flex items-center gap-2 backdrop-blur-sm shrink-0">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.08em] shrink-0 max-w-[42%] leading-tight">
            {t('autoCashoutLabel', lang)}
          </label>
          <input
            type="number"
            step="0.1"
            min="1.01"
            max="1000"
            placeholder={t('autoCashoutPlaceholder', lang)}
            value={autoCashout}
            onChange={(e) => setAutoCashout(e.target.value)}
            disabled={gameState === 'running' || hasBet}
            className="min-w-0 flex-1 bg-[#0a0a0d] border border-zinc-800 text-white font-mono font-bold text-sm rounded-xl px-3 py-2 outline-none focus:border-rose-600 placeholder:text-zinc-600 transition-colors"
          />
          <span className="text-zinc-500 font-bold text-sm shrink-0">x</span>
        </div>
      </div>
    </div>
  );
};
