import React, { useState, useMemo, useEffect, useRef } from 'react';
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

interface Ball {
  id: number;
  x: number;
  y: number;
  squash: boolean;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
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
  const [balls, setBalls] = useState<Ball[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [hitBuckets, setHitBuckets] = useState<Record<number, number>>({});
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);
  const mountedRef = useRef(true);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const ballIdRef = useRef(0);
  const rippleIdRef = useRef(0);
  const balanceRef = useRef(user.balanceUSD);
  const bucketsRef = useRef<number[]>([]);

  useEffect(() => {
    balanceRef.current = user.balanceUSD;
  }, [user.balanceUSD]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
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

  const spawnRipple = (x: number, y: number) => {
    const id = ++rippleIdRef.current;
    setRipples((prev) => [...prev, { id, x, y }]);
    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 420);
    timersRef.current.push(t);
  };

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
    const path: { x: number; y: number; peg?: boolean }[] = [];
    path.push({ x: boardCenter, y: 2, peg: false });

    for (let r = 0; r < ROW_COUNT; r++) {
      const goRight = Math.random() < 0.5;
      if (goRight) rights++;
      const count = pegRows[r];
      const rowWidth = pegStep * (count - 1);
      const startX = boardCenter - rowWidth / 2;
      const idx = Math.min(Math.max(0, rights), count - 1);
      const x = startX + idx * pegStep;
      const y = getRowY(r);
      path.push({ x, y, peg: true });
    }

    const bucketIndex = Math.max(0, Math.min(BUCKET_COUNT - 1, rights));
    const bucketX = (100 / BUCKET_COUNT) * (bucketIndex + 0.5);
    path.push({ x: bucketX, y: 92, peg: false });

    setBalls((prev) => [...prev, { id, x: path[0].x, y: path[0].y, squash: false }]);

    let step = 0;
    const advance = () => {
      if (!mountedRef.current) return;

      if (step >= path.length) {
        setBalls((prev) => prev.filter((b) => b.id !== id));
        setHitBuckets((prev) => ({ ...prev, [bucketIndex]: Date.now() }));
        setLastMultiplier(riskBuckets[bucketIndex]);

        const winMult = riskBuckets[bucketIndex];
        const payoutUSD = stake * winMult;

        if (winMult >= 5) confetti({ particleCount: 50, spread: 55 });
        soundFx[winMult > 1.0 ? 'playWin' : 'playLoss']();

        const nextBal = balanceRef.current + payoutUSD;
        balanceRef.current = nextBal;
        onUpdateBalance(nextBal);

        onAddHistory({
          id: String(Date.now()) + '-' + id,
          gameId: 'plinko',
          gameName: t('plinkoName', lang),
          timestamp: new Date(),
          betAmountUSD: stake,
          multiplier: winMult,
          payoutUSD,
          win: winMult >= 1.0,
          currency,
        });
        return;
      }

      const pt = path[step];
      if (pt.peg) {
        soundFx.playChip();
        spawnRipple(pt.x, pt.y);
        setBalls((prev) =>
          prev.map((b) => (b.id === id ? { ...b, x: pt.x, y: pt.y, squash: true } : b)),
        );
        const unsquash = setTimeout(() => {
          if (!mountedRef.current) return;
          setBalls((prev) =>
            prev.map((b) => (b.id === id ? { ...b, squash: false } : b)),
          );
        }, 90);
        timersRef.current.push(unsquash);
      } else {
        setBalls((prev) =>
          prev.map((b) => (b.id === id ? { ...b, x: pt.x, y: pt.y, squash: false } : b)),
        );
      }

      step++;
      const next = setTimeout(advance, 105);
      timersRef.current.push(next);
    };

    const start = setTimeout(advance, 40);
    timersRef.current.push(start);
  };

  const activeHits = hitBuckets;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-2.5">
        <div className="bg-[#111115] border border-zinc-800 rounded-xl p-2.5 flex flex-col gap-1.5">
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
          className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl overflow-hidden shadow-2xl red-border-glow w-full mx-auto"
          style={{ aspectRatio: '1 / 1', maxHeight: 'min(42vh, 360px)', maxWidth: 420 }}
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
              className="absolute w-3.5 h-3.5 rounded-full bg-rose-500 border border-white shadow-[0_0_12px_rgba(225,29,72,1)] z-20"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                transform: `translate(-50%, -50%) scale(${b.squash ? '1.35, 0.75' : '1, 1'})`,
                transition: 'left 95ms linear, top 95ms linear, transform 80ms ease-out',
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
              const recentlyHit = activeHits[idx] && Date.now() - activeHits[idx] < 600;
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
