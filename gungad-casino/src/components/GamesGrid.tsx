import React, { useState } from 'react';
import { GameInfo, GameId } from '../types';
import { GAMES } from '../data/games';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { Play, Sparkles } from 'lucide-react';

interface GamesGridProps {
  onSelectGame: (id: GameId) => void;
  lang: any;
}

export const GamesGrid: React.FC<GamesGridProps> = ({ onSelectGame, lang }) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredGames =
    activeCategory === 'all'
      ? GAMES
      : GAMES.filter((g) => g.category === activeCategory);

  const categories = [
    { id: 'all', labelKey: 'allCategories' },
    { id: 'crash', labelKey: 'crashCategory' },
    { id: 'table', labelKey: 'tableCategory' },
    { id: 'cards', labelKey: 'cardsCategory' },
    { id: 'instant', labelKey: 'instantCategory' },
    { id: 'arcade', labelKey: 'arcadeCategory' },
  ];

  return (
    <section className="flex flex-col gap-6 my-2">
      {/* Category Pills Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h2 className="font-display font-black text-2xl md:text-3xl text-white uppercase tracking-wider flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-rose-500" />
            {t('popularGames', lang)}
          </h2>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 bg-[#111116] border border-zinc-800 p-1.5 rounded-2xl overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                soundFx.playClick();
                setActiveCategory(cat.id);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-display font-bold uppercase transition-all shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.5)]'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {t(cat.labelKey as any, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Games Grid: 1→2→3→4→5→6 колонок */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {filteredGames.map((game) => {
          const titleKey = `${game.id}Name` as any;
          const gameTitle = t(titleKey, lang);

          return (
            <div
              key={game.id}
              onClick={() => {
                soundFx.playClick();
                onSelectGame(game.id);
              }}
              className="group relative bg-[#0e0e12] border border-rose-900/30 hover:border-rose-600/70 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1.5 shadow-xl hover:shadow-[0_0_30px_rgba(225,29,72,0.3)] flex flex-col"
            >
              {/* Card Thumbnail — картинка заполняет блок независимо от исходного размера */}
              <div className="relative w-full aspect-[4/3] sm:aspect-[16/11] overflow-hidden bg-zinc-900">
                <img
                  src={game.image}
                  alt={gameTitle}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e12] via-transparent to-transparent opacity-80" />

                {/* Badge */}
                {game.badge && (
                  <span className="absolute top-3 left-3 bg-rose-950/90 border border-rose-600/70 text-rose-300 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg backdrop-blur-md shadow-md">
                    {t(game.badge as any, lang)}
                  </span>
                )}

                {/* RTP Chip */}
                <span className="absolute top-3 right-3 bg-black/80 border border-zinc-700 text-emerald-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md">
                  {t('rtpLabel', lang, { rtp: game.rtp })}
                </span>

                {/* Hover Play Icon Overlay */}
                <div className="absolute inset-0 bg-rose-950/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-[0_0_25px_rgba(225,29,72,0.9)] transform group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 ml-1 fill-current" />
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                <div>
                  <h3 className="font-display font-black text-lg text-white group-hover:text-rose-400 transition-colors uppercase">
                    {gameTitle}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {t(game.descriptionKey as any, lang)}
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-end">
                  <button className="px-3.5 py-1.5 bg-rose-600/20 group-hover:bg-rose-600 text-rose-400 group-hover:text-white border border-rose-600/40 rounded-xl text-xs font-display font-bold uppercase transition-all shadow-md">
                    {t('playNow', lang)}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
