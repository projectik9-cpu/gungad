import React, { useState, useMemo } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import confetti from 'canvas-confetti';

interface PlinkoGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

// Ряды пирамиды: 8 рядов → 9 корзин (стандартный Plinko)
const ROW_COUNT = 8;

const MULTIPLIERS_MAP: Record<string, number[]> = {
  // buckets = rows + 1
  low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
  high:   [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
};

export const PlinkoGame: React.FC<PlinkoGameProps> = ({
  user,
  currency,
  lang,
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [isDropping, setIsDropping] = useState<boolean>(false);
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [hitBucket, setHitBucket] = useState<number | null>(null);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);

  const buckets = MULTIPLIERS_MAP[risk];
  const BUCKET_COUNT = buckets.length; // = ROW_COUNT + 1

  // Пирамида: ряд i имеет (i+3) пегов, нижний ряд = BUCKET_COUNT
  // Старт с 3 пегов сверху → к низу расширяется
  const pegRows = useMemo(() => {
    return Array.from({ length: ROW_COUNT }, (_, i) => 3 + i);
  }, []);

  // Фиксированный шаг между пегами (% от ширины нижней строки)
  // Нижний ряд занимает ~92% ширины, пеги равномерно
  const bottomPegs = pegRows[pegRows.length - 1];
  const pegStep = 92 / (bottomPegs - 1); // % между соседними пегами
  const boardCenter = 50;

  const getPegX = (rowIdx: number, pegIdx: number) => {
    const count = pegRows[rowIdx];
    const rowWidth = pegStep * (count - 1);
    const startX = boardCenter - rowWidth / 2;
    return startX + pegIdx * pegStep;
  };

  const getRowY = (rowIdx: number) => {
    // пеги занимают от 6% до 82% высоты (под корзины оставляем низ)
    return 6 + (rowIdx / (ROW_COUNT - 1)) * 76;
  };

  const handleDrop = () => {
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD || isDropping) return;

    soundFx.playClick();
    onUpdateBalance(user.balanceUSD - betAmountUSD);
    setLastBetUSD(betAmountUSD);
    setIsDropping(true);
    setLastMultiplier(null);
    setHitBucket(null);

    // Путь: стартуем с центра, на каждом ряду +1 (вправо) или 0 (влево)
    // bucketIndex = число смещений вправо (0..ROW_COUNT)
    let rights = 0;
    const path: { x: number; y: number }[] = [];

    // Старт над вершиной
    path.push({ x: boardCenter, y: 2 });

    for (let r = 0; r < ROW_COUNT; r++) {
      const goRight = Math.random() < 0.5;
      if (goRight) rights++;
      // На ряду r позиция пега = rights (смещения вправо) среди count пегов
      // После r+1 решений позиция относительно центра ряда
      const pegIdx = Math.min(rights, pegRows[r] - 1);
      // Интерполируем между пегами с учётом накопленных rights
      // Проще: x = центр_ряда + (rights - r/2) * pegStep
      const count = pegRows[r];
      const rowWidth = pegStep * (count - 1);
      const startX = boardCenter - rowWidth / 2;
      // позиция после r решений: rights вправо из (r+1) возможных
      const idx = Math.min(Math.max(0, rights), count - 1);
      const x = startX + idx * pegStep;
      const y = getRowY(r);
      path.push({ x, y });
    }

    // Финальная корзина
    const bucketIndex = Math.max(0, Math.min(BUCKET_COUNT - 1, rights));
    const bucketX = (100 / BUCKET_COUNT) * (bucketIndex + 0.5);
    path.push({ x: bucketX, y: 92 });

    let step = 0;
    const advance = () => {
      if (step >= path.length) {
        setIsDropping(false);
        setBallPos(null);
        setHitBucket(bucketIndex);

        const winMult = buckets[bucketIndex];
        setLastMultiplier(winMult);
        const payoutUSD = betAmountUSD * winMult;

        if (winMult >= 5) confetti({ particleCount: 60, spread: 60 });
        soundFx[winMult > 1.0 ? 'playWin' : 'playLoss']();
        onUpdateBalance(user.balanceUSD - betAmountUSD + payoutUSD);
        onAddHistory({
          id: String(Date.now()),
          gameId: 'plinko',
          gameName: t('plinkoName', lang),
          timestamp: new Date(),
          betAmountUSD,
          multiplier: winMult,
          payoutUSD,
          win: winMult >= 1.0,
          currency,
        });
        return;
      }

      soundFx.playSpinTick();
      setBallPos(path[step]);
      step++;
      setTimeout(advance, 110);
    };

    setTimeout(advance, 60);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <div className="lg:col-span-8 flex flex-col gap-3">
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl overflow-hidden shadow-2xl red-border-glow w-full"
          style={{ aspectRatio: '1 / 1.05', maxHeight: 520 }}
        >
          {/* Пирамида пегов — абсолютное позиционирование с фиксированным шагом */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {pegRows.map((count, rowIdx) =>
              Array.from({ length: count }).map((_, pegIdx) => (
                <div
                  key={`${rowIdx}-${pegIdx}`}
                  className="absolute w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-zinc-300 shadow-[0_0_5px_rgba(255,255,255,0.4)]"
                  style={{
                    left: `${getPegX(rowIdx, pegIdx)}%`,
                    top: `${getRowY(rowIdx)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))
            )}
          </div>

          {/* Мячик */}
          {ballPos && (
            <div
              className="absolute w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-rose-500 border border-white shadow-[0_0_12px_rgba(225,29,72,1)] z-20"
              style={{
                left: `${ballPos.x}%`,
                top: `${ballPos.y}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'left 100ms linear, top 100ms linear',
              }}
            />
          )}

          {/* Корзины множителей — выровнены под основание пирамиды */}
          <div
            className="absolute bottom-1 z-10 flex"
            style={{
              left: `${boardCenter - (pegStep * (bottomPegs - 1)) / 2 - pegStep / 2}%`,
              width: `${pegStep * bottomPegs}%`,
            }}
          >
            {buckets.map((m, idx) => (
              <div
                key={idx}
                className={`flex-1 mx-px h-8 sm:h-9 flex items-center justify-center font-mono font-bold text-[9px] sm:text-[10px] rounded-t-md transition-all ${
                  hitBucket === idx
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
            ))}
          </div>
        </div>

        {lastMultiplier !== null && (
          <div className="text-center font-display font-black text-2xl text-rose-400">
            {lastMultiplier}x
          </div>
        )}
      </div>

      <div className="lg:col-span-4 flex flex-col gap-4">
        <div className="bg-[#111115] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('riskLevel', lang)}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['low', 'medium', 'high'] as const).map((r) => (
              <button
                key={r}
                onClick={() => { soundFx.playClick(); setRisk(r); }}
                disabled={isDropping}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${
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
          disabled={isDropping}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={isDropping ? '...' : t('dropBall', lang)}
          onAction={handleDrop}
          actionDisabled={isDropping || betAmountUSD > user.balanceUSD}
        />
      </div>
    </div>
  );
};
