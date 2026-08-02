import React from 'react';
import { Currency, LiveFeedItem } from '../types';
import { formatCurrency } from '../utils/currencies';
import { t } from '../translations';
import { Flame, Trophy } from 'lucide-react';

interface LiveFeedProps {
  items: LiveFeedItem[];
  currency: Currency;
  lang: any;
  onSelectGame: (gameId: any) => void;
}

export const LiveFeed: React.FC<LiveFeedProps> = ({ items, currency, lang, onSelectGame }) => {
  return (
    <div className="bg-[#111115] border border-rose-900/30 rounded-2xl p-4 md:p-5 shadow-xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-rose-500 animate-pulse" />
          <span className="font-display font-bold text-white text-xs md:text-sm uppercase tracking-wider">
            {t('recentWinners', lang)}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          LIVE STREAM
        </span>
      </div>

      {/* Grid ticker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {items.slice(0, 4).map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectGame(item.gameId)}
            className="bg-[#0b0b0e] hover:bg-[#14141a] border border-zinc-800 hover:border-rose-900/50 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2.5">
              <img
                src={item.avatar}
                alt={item.player}
                className="w-8 h-8 rounded-full border border-rose-600/40 object-cover"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight">{item.player}</span>
                <span className="text-[10px] text-zinc-400 font-medium">{item.gameName}</span>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-xs font-mono font-bold text-emerald-400">
                +{formatCurrency(item.payoutUSD, currency)}
              </span>
              <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded border border-rose-900/40">
                {item.multiplier.toFixed(2)}x
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
