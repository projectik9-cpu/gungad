import React, { useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';
import { Bomb, Diamond } from 'lucide-react';
import { minesEdgeFactor } from '../../game/demoOdds';

interface MinesGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

interface TileState {
  isMine: boolean;
  revealed: boolean;
}

export const MinesGame: React.FC<MinesGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [minesCount, setMinesCount] = useState<number>(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'game_over'>('idle');
  const [grid, setGrid] = useState<TileState[]>(Array(25).fill({ isMine: false, revealed: false }));
  const [gemsRevealed, setGemsRevealed] = useState<number>(0);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);

  // Multiplier math formula per revealed gem
  const calculateNextMultiplier = (gems: number) => {
    let mult = 1.0;
    for (let i = 0; i < gems; i++) {
      mult *= (25 - i) / (25 - minesCount - i);
    }
    return parseFloat((mult * minesEdgeFactor(playMode === 'demo')).toFixed(2));
  };

  const handleStartGame = () => {
    if (betAmountUSD <= 0 || betAmountUSD > user.balanceUSD) return;

    soundFx.playClick();
    onUpdateBalance(user.balanceUSD - betAmountUSD);
    setLastBetUSD(betAmountUSD);

    // Randomize mine positions
    const mineIndices = new Set<number>();
    while (mineIndices.size < minesCount) {
      mineIndices.add(Math.floor(Math.random() * 25));
    }

    const newGrid: TileState[] = Array(25)
      .fill(null)
      .map((_, i) => ({
        isMine: mineIndices.has(i),
        revealed: false,
      }));

    setGrid(newGrid);
    setGemsRevealed(0);
    setCurrentMultiplier(1.0);
    setGameState('playing');
  };

  const handleTileClick = (index: number) => {
    if (gameState !== 'playing' || grid[index].revealed) return;

    const tile = grid[index];
    const newGrid = [...grid];
    newGrid[index] = { ...tile, revealed: true };
    setGrid(newGrid);

    if (tile.isMine) {
      soundFx.playExplosion();
      // Reveal all mines
      setGrid(newGrid.map((t) => (t.isMine ? { ...t, revealed: true } : t)));
      setGameState('game_over');

      onAddHistory({
        id: String(Date.now()),
        gameId: 'mines',
        gameName: t('minesName', lang),
        timestamp: new Date(),
        betAmountUSD,
        multiplier: 0,
        payoutUSD: 0,
        win: false,
        currency,
      });
      return;
    }

    // Revealed diamond!
    soundFx.playGem();
    const newGems = gemsRevealed + 1;
    setGemsRevealed(newGems);

    const nextMult = calculateNextMultiplier(newGems);
    setCurrentMultiplier(nextMult);

    // Auto cashout if all safe gems revealed
    if (newGems === 25 - minesCount) {
      handleCashout(nextMult);
    }
  };

  const handleCashout = (overrideMult?: number) => {
    if (gameState !== 'playing' || gemsRevealed === 0) return;

    const finalMult = overrideMult || currentMultiplier;
    const payoutUSD = betAmountUSD * finalMult;

    soundFx.playWin();
    if (finalMult >= 3) confetti({ particleCount: 70, spread: 60 });

    onUpdateBalance(user.balanceUSD + payoutUSD);
    setGameState('game_over');
    // Reveal all remaining
    setGrid(grid.map((t) => ({ ...t, revealed: true })));

    onAddHistory({
      id: String(Date.now()),
      gameId: 'mines',
      gameName: t('minesName', lang),
      timestamp: new Date(),
      betAmountUSD,
      multiplier: finalMult,
      payoutUSD,
      win: true,
      currency,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* Controls first on mobile */}
      <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-2.5">
        <div className="bg-[#111115] border border-zinc-800 rounded-xl p-2.5 flex flex-col gap-1.5 shrink-0">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>{t('minesCount', lang)}</span>
            <span className="text-rose-400 font-mono font-bold text-xs">{t('minesCountShort', lang, { n: minesCount })}</span>
          </label>
          <select
            value={minesCount}
            onChange={(e) => setMinesCount(parseInt(e.target.value))}
            disabled={gameState === 'playing'}
            className="w-full bg-[#0a0a0d] border border-zinc-800 text-white font-mono font-bold text-sm rounded-xl px-3 py-2 outline-none focus:border-rose-600 cursor-pointer"
          >
            {[1, 2, 3, 5, 8, 10, 15, 20, 24].map((cnt) => (
              <option key={cnt} value={cnt}>
                {t('minesOption', lang, { count: cnt, gems: 25 - cnt })}
              </option>
            ))}
          </select>
        </div>

        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={gameState === 'playing'}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={
            gameState === 'playing'
              ? gemsRevealed > 0
                ? `${t('cashout', lang)} (${formatCurrency(betAmountUSD * currentMultiplier, currency)})`
                : t('selectSafeTiles', lang)
              : t('minesSearch', lang)
          }
          onAction={gameState === 'playing' ? () => handleCashout() : handleStartGame}
          actionDisabled={gameState === 'playing' ? gemsRevealed === 0 : betAmountUSD > user.balanceUSD}
          actionColor={gameState === 'playing' ? 'green' : 'red'}
          compact
        />
      </div>

      <div className="lg:col-span-8 order-2 lg:order-1 flex flex-col gap-2">
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-2.5 sm:p-3 lg:p-5 flex flex-col items-center justify-center overflow-hidden shadow-2xl red-border-glow mx-auto w-full"
          style={{ maxWidth: 520 }}
        >
          <div className="grid grid-cols-5 gap-1.5 w-full aspect-square max-h-[min(52vh,480px)]">
            {grid.map((tile, i) => (
              <button
                key={i}
                onClick={() => handleTileClick(i)}
                disabled={gameState !== 'playing' || tile.revealed}
                className={`w-full h-full rounded-lg border flex items-center justify-center transition-all duration-200 transform active:scale-95 shadow-md ${
                  !tile.revealed
                    ? 'bg-zinc-900 border-zinc-800 hover:border-rose-600/70 hover:bg-zinc-800'
                    : tile.isMine
                    ? 'bg-rose-950 border-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.7)]'
                    : 'bg-emerald-950/80 border-emerald-600/70 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                }`}
              >
                {tile.revealed ? (
                  tile.isMine ? (
                    <Bomb className="w-5 h-5 text-rose-500" />
                  ) : (
                    <Diamond className="w-5 h-5 text-emerald-400" />
                  )
                ) : (
                  <div className="w-2 h-2 rounded-full bg-zinc-800" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
