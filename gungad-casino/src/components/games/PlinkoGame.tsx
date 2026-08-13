import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import confetti from 'canvas-confetti';
import { plinkoMultipliers } from '../../game/demoOdds';

interface PlinkoGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

const ROW_COUNT = 8;
const MAX_RIPPLES = 10;
const STEP_MS = 100;

interface BallState {
  id: number;
  x: number;
  y: number;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface ActiveBall {
  id: number;
  path: { x: number; y: number; peg: boolean }[];
  step: number;
  nextAt: number;
  stake: number;
  bucketIndex: number;
  buckets: number[];
}

export const PlinkoGame: React.FC<PlinkoGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [balls, setBalls] = useState<BallState[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [hitBuckets, setHitBuckets] = useState<Record<number, number>>({});
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);

  const mountedRef = useRef(true);
  const ballIdRef = useRef(0);
  const rippleIdRef = useRef(0);
  const balanceRef = useRef(user.balanceUSD);
  const bucketsRef = useRef<number[]>([]);
  const activeRef = useRef<Map<number, ActiveBall>>(new Map());
  const rafRef = useRef<number | null>(null);
  const positionsDirty = useRef(false);
  const pendingRipples = useRef<Ripple[]>([]);
  const settleQueue = useRef<Array<() => void>>([]);

  useEffect(() => {
    balanceRef.current = user.balanceUSD;
  }, [user.balanceUSD]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      activeRef.current.clear();
    };
  }, []);

  const buckets = plinkoMultipliers(risk, playMode === 'demo');
  bucketsRef.current = buckets;
  const BUCKET_COUNT = buckets.length;

  const pegRows = useMemo(() => {
    return Array.from({ length: ROW_COUNT }, (_, i) => 3 + i);
  }, []);

  const bottomPegs = pegRows[pegRows.length - 1];
  const pegStep = 92 / (bottomPegs - 1);
  const boardCenter = 50;

  const getPegX = (rowIdx: number, pegIdx: number) => {
    const count = pegRows[rowIdx];
    const rowWidth = pegStep * (count - 1);
    const startX = boardCenter - rowWidth / 2;
    return startX + pegIdx * pegStep;
  };

  const getRowY = (rowIdx: number) => {
    return 6 + (rowIdx / (ROW_COUNT - 1)) * 76;
  };

  const flushUi = useCallback(() => {
    if (!mountedRef.current) return;

    if (positionsDirty.current) {
      positionsDirty.current = false;
      const next: BallState[] = [];
      activeRef.current.forEach((b) => {
        const pt = b.path[Math.min(b.step, b.path.length - 1)];
        next.push({ id: b.id, x: pt.x, y: pt.y });
      });
      setBalls(next);
    }

    if (pendingRipples.current.length) {
      const add = pendingRipples.current.splice(0, pendingRipples.current.length);
      setRipples((prev) => {
        const merged = [...prev, ...add];
        return merged.length > MAX_RIPPLES ? merged.slice(-MAX_RIPPLES) : merged;
      });
      // Auto-remove after animation
      add.forEach((r) => {
        window.setTimeout(() => {
          if (!mountedRef.current) return;
          setRipples((prev) => prev.filter((x) => x.id !== r.id));
        }, 400);
      });
    }

    while (settleQueue.current.length) {
      const fn = settleQueue.current.shift();
      fn?.();
    }
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current != null) return;

    const tick = (now: number) => {
      if (!mountedRef.current) {
        rafRef.current = null;
        return;
      }

      let any = false;
      activeRef.current.forEach((ball, id) => {
        any = true;
        if (now < ball.nextAt) return;

        ball.step += 1;
        ball.nextAt = now + STEP_MS;

        if (ball.step >= ball.path.length) {
          activeRef.current.delete(id);
          positionsDirty.current = true;

          const winMult = ball.buckets[ball.bucketIndex];
          const payoutUSD = ball.stake * winMult;
          const bucketIndex = ball.bucketIndex;

          settleQueue.current.push(() => {
            setHitBuckets((prev) => ({ ...prev, [bucketIndex]: Date.now() }));
            setLastMultiplier(winMult);
            if (winMult >= 5) confetti({ particleCount: 40, spread: 50 });
            soundFx[winMult > 1.0 ? 'playWin' : 'playLoss']();
            const nextBal = balanceRef.current + payoutUSD;
            balanceRef.current = nextBal;
            onUpdateBalance(nextBal);
            onAddHistory({
              id: `${Date.now()}-${id}`,
              gameId: 'plinko',
              gameName: t('plinkoName', lang),
              timestamp: new Date(),
              betAmountUSD: ball.stake,
              multiplier: winMult,
              payoutUSD,
              win: winMult >= 1.0,
              currency,
            });
          });
          return;
        }

        const pt = ball.path[ball.step];
        positionsDirty.current = true;
        if (pt.peg) {
          soundFx.playChip();
          pendingRipples.current.push({
            id: ++rippleIdRef.current,
            x: pt.x,
            y: pt.y,
          });
        }
      });

      flushUi();

      if (any || activeRef.current.size > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        flushUi();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [flushUi, onUpdateBalance, onAddHistory, lang, currency]);

  const handleDrop = () => {
    if (betAmountUSD <= 0 || betAmountUSD > balanceRef.current) return;

    const stake = betAmountUSD;
    const riskBuckets = bucketsRef.current;

    soundFx.playClick();
    const afterBet = balanceRef.current - stake;
    balanceRef.current = afterBet;
    onUpdateBalance(afterBet);
    setLastBetUSD(stake);

    const id = ++ballIdRef.current;
    let rights = 0;
    const path: { x: number; y: number; peg: boolean }[] = [];
    path.push({ x: boardCenter, y: 2, peg: false });

    for (let r = 0; r < ROW_COUNT; r++) {
      if (Math.random() < 0.5) rights++;
      const count = pegRows[r];
      const rowWidth = pegStep * (count - 1);
      const startX = boardCenter - rowWidth / 2;
      const idx = Math.min(Math.max(0, rights), count - 1);
      path.push({ x: startX + idx * pegStep, y: getRowY(r), peg: true });
    }

    const bucketIndex = Math.max(0, Math.min(BUCKET_COUNT - 1, rights));
    const bucketX = (100 / BUCKET_COUNT) * (bucketIndex + 0.5);
    path.push({ x: bucketX, y: 92, peg: false });

    activeRef.current.set(id, {
      id,
      path,
      step: 0,
      nextAt: performance.now() + 40,
      stake,
      bucketIndex,
      buckets: riskBuckets,
    });
    positionsDirty.current = true;
    flushUi();
    ensureLoop();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-2.5">
        <div className="bg-[#111115] border border-zinc-800 rounded-xl p-2.5 flex flex-col gap-1.5 shrink-0">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('riskLevel', lang)}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['low', 'medium', 'high'] as const).map((r) => (
              <button
                key={r}
                onClick={() => { soundFx.playClick(); setRisk(r); }}
                className={`py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                  risk === r
                    ? r === 'low' ? 'bg-emerald-950 border-emerald-600 text-emerald-400'
                    : r === 'medium' ? 'bg-amber-950 border-amber-600 text-amber-400'
                    : 'bg-rose-950 border-rose-600 text-rose-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                {t(r as any, lang)}
              </button>
            ))}
          </div>
        </div>

        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={false}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={t('dropBall', lang)}
          onAction={handleDrop}
          actionDisabled={betAmountUSD > user.balanceUSD || betAmountUSD <= 0}
          compact
        />
      </div>

      <div className="lg:col-span-8 order-2 lg:order-1 flex flex-col gap-2">
        <div
          className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl overflow-hidden shadow-2xl red-border-glow w-full mx-auto max-h-[min(52vh,480px)] max-w-[480px]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <div className="absolute inset-0 z-10 pointer-events-none">
            {pegRows.map((count, rowIdx) =>
              Array.from({ length: count }).map((_, pegIdx) => (
                <div
                  key={`${rowIdx}-${pegIdx}`}
                  className="absolute w-1.5 h-1.5 rounded-full bg-zinc-300 shadow-[0_0_5px_rgba(255,255,255,0.4)]"
                  style={{
                    left: `${getPegX(rowIdx, pegIdx)}%`,
                    top: `${getRowY(rowIdx)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))
            )}
          </div>

          {ripples.map((r) => (
            <div
              key={r.id}
              className="plinko-ripple absolute z-[15] pointer-events-none"
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
            />
          ))}

          {balls.map((b) => (
            <div
              key={b.id}
              className="absolute w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.9)] z-20 will-change-transform"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'left 90ms linear, top 90ms linear',
              }}
            />
          ))}

          <div
            className="absolute bottom-1 z-10 flex"
            style={{
              left: `${boardCenter - (pegStep * (bottomPegs - 1)) / 2 - pegStep / 2}%`,
              width: `${pegStep * bottomPegs}%`,
            }}
          >
            {buckets.map((m, idx) => {
              const recentlyHit = hitBuckets[idx] && Date.now() - hitBuckets[idx] < 600;
              return (
                <div
                  key={idx}
                  className={`flex-1 mx-px h-7 flex items-center justify-center font-mono font-bold text-[9px] rounded-t-md transition-all ${
                    recentlyHit
                      ? 'bg-yellow-400 text-black scale-105'
                      : m >= 10
                      ? 'bg-rose-600 text-white'
                      : m >= 2
                      ? 'bg-rose-800/80 text-rose-200'
                      : m >= 1
                      ? 'bg-zinc-700 text-zinc-200'
                      : 'bg-zinc-900 text-zinc-500'
                  }`}
                >
                  {m}x
                </div>
              );
            })}
          </div>
        </div>

        {lastMultiplier !== null && (
          <div className="text-center font-display font-black text-xl text-rose-400">
            {lastMultiplier}x
          </div>
        )}
      </div>
    </div>
  );
};
