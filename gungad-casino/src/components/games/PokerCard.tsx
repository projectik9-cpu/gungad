import React from 'react';
import { Layers } from 'lucide-react';
import { parsePokerCard } from '../../game/pokerApi';

export const PokerCard: React.FC<{ code: string | null; large?: boolean; animate?: boolean }> = ({
  code, large, animate,
}) => {
  const parsed = parsePokerCard(code);
  const size = large
    ? 'w-16 h-[5.6rem] md:w-[4.5rem] md:h-28'
    : 'w-11 h-16 md:w-14 md:h-20';
  const motion = animate ? 'animate-deal-in' : '';
  if (!parsed) {
    return (
      <div className={`${size} rounded-xl border-2 flex items-center justify-center bg-gradient-to-br from-rose-900 to-rose-950 border-rose-600 shadow-xl ${motion}`}>
        <Layers className="w-4 h-4 text-rose-400/60" />
      </div>
    );
  }
  return (
    <div className={`${size} rounded-xl border-2 bg-zinc-100 border-zinc-300 flex flex-col justify-between p-1 shadow-xl ${motion}`}>
      <span className={`text-[10px] md:text-xs font-black ${parsed.red ? 'text-rose-600' : 'text-zinc-900'}`}>{parsed.rank}</span>
      <span className={`text-base md:text-xl text-center font-bold ${parsed.red ? 'text-rose-600' : 'text-zinc-900'}`}>{parsed.suit}</span>
      <span className={`text-[10px] md:text-xs font-black text-right ${parsed.red ? 'text-rose-600' : 'text-zinc-900'}`}>{parsed.rank}</span>
    </div>
  );
};
