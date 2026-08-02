import React, { useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import { formatCurrency } from '../../utils/currencies';
import confetti from 'canvas-confetti';
import { Bomb, Diamond, ShieldCheck } from 'lucide-react';

interface MinesGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
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
    return parseFloat((mult * 0.99).toFixed(2)); // 1% house edge
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
      // Hit a mine!
      soundFx.playExplosion();
      soundFx.playLoss();
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* 5x5 Grid Field */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        <div className="relative bg-[#0d0d12] border border-rose-900/40 rounded-2xl p-6 min-h-[380px] flex flex-col items-center justify-center overflow-hidden shadow-2xl red-border-glow">
          {/* Grid View */}
          <div className="grid grid-cols-5 gap-2.5 w-full max-w-md aspect-square">
            {grid.map((tile, i) => (
              <button
                key={i}
                onClick={() => handleTileClick(i)}
                disabled={gameState !== 'playing' || tile.revealed}
                className={`w-full h-full rounded-xl border flex items-center justify-center transition-all duration-200 transform active:scale-95 shadow-md ${
                  !tile.revealed
                    ? 'bg-zinc-900 border-zinc-800 hover:border-rose-600/70 hover:bg-zinc-800 hover:shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                    : tile.isMine
                    ? 'bg-rose-950 border-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.8)]'
                    : 'bg-emerald-950/80 border-emerald-600/70 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                }`}
              >
                {tile.revealed ? (
                  tile.isMine ? (
                    <Bomb className="w-7 h-7 text-rose-500 animate-bounce" />
                  ) : (
                    <Diamond className="w-7 h-7 text-emerald-400 animate-pulse" />
                  )
                ) : (
                  <div className="w-3 h-3 rounded-full bg-zinc-800" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        {/* Mines count Selector */}
        <div className="bg-[#111115] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>{t('minesCount', lang)}</span>
            <span className="text-rose-400 font-mono font-bold text-sm">{t('minesCountShort', lang, { n: minesCount })}</span>
          </label>
          <select
            value={minesCount}
            onChange={(e) => setMinesCount(parseInt(e.target.value))}
            disabled={gameState === 'playing'}
            className="w-full bg-[#0a0a0d] border border-zinc-800 text-white font-mono font-bold text-sm rounded-xl px-3 py-2.5 outline-none focus:border-rose-600 cursor-pointer"
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
              : t('placeBet', lang)
          }
          onAction={gameState === 'playing' ? () => handleCashout() : handleStartGame}
          actionDisabled={gameState === 'playing' ? gemsRevealed === 0 : betAmountUSD > user.balanceUSD}
          actionColor={gameState === 'playing' ? 'green' : 'red'}
        />
      </div>
    </div>
  );
};
