import React, { useEffect, useState } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../types';
import { t } from '../translations';
import { formatCurrency } from '../utils/currencies';
import { soundFx } from '../utils/sound';
import { X, Crown, Crosshair, History, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

const GAME_NAMES: Record<string, string> = {
  crash: 'Gun Краш', roulette: 'Рулетка', blackjack: 'Блэкджек',
  coinflip: 'Gun Монетка', dice: 'Кости', mines: 'Мины', plinko: 'Плинко',
  slots: 'One-Armed Bandit',
};

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currency: Currency;
  lang: any;
  history: BetHistoryItem[];
  profileId?: string | null;
}

const VIP_RANK_KEYS = ['vipRank1', 'vipRank2', 'vipRank3', 'vipRank4', 'vipRank5', 'vipRank6'] as const;

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  currency,
  lang,
  history,
  profileId,
}) => {
  const [serverHistory, setServerHistory] = useState<BetHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen || !profileId) return;
    setLoadingHistory(true);
    fetch(`${API_BASE}/api/wallet/history?profile_id=${profileId}&limit=30`)
      .then(r => r.json())
      .then(json => {
        if (json.ok && Array.isArray(json.bets)) {
          const mapped: BetHistoryItem[] = json.bets.map((b: any) => ({
            id: b.id,
            gameId: b.game_id,
            gameName: GAME_NAMES[b.game_id] ?? b.game_id,
            timestamp: new Date(b.created_at),
            betAmountUSD: (b.bet_cents ?? 0) / 100,
            multiplier: Number(b.multiplier ?? 0),
            payoutUSD: (b.payout_cents ?? 0) / 100,
            win: (b.payout_cents ?? 0) > 0,
            currency,
          }));
          setServerHistory(mapped);
        }
      })
      .catch(() => {/* keep local */})
      .finally(() => setLoadingHistory(false));
  }, [isOpen, profileId, currency]);

  if (!isOpen) return null;

  const displayHistory = serverHistory.length > 0 ? serverHistory : history;
  const vipKey = VIP_RANK_KEYS[Math.min(VIP_RANK_KEYS.length - 1, Math.max(0, user.vipLevel - 1))];
  const vipName = t(vipKey, lang);
  const progressPercent = user.vipMaxXp > 0
    ? Math.min(100, Math.round((user.vipXp / user.vipMaxXp) * 100))
    : 0;

  return (
    <div
      className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-xl bg-[#0e0e12] border border-rose-900/50 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-zinc-100 max-h-[min(92dvh,920px)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair className="w-5 h-5 text-rose-500 shrink-0" />
            <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-wider text-white truncate">
              {t('profileOverview', lang)}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => { soundFx.playClick(); onClose(); }}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 flex flex-col gap-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {/* User card — no overflow-hidden so avatar/XP never clip */}
          <div className="bg-[#121217] border border-rose-900/50 p-4 rounded-2xl flex items-start gap-3.5">
            <img
              src={user.avatar}
              alt={user.username}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-rose-600 object-cover shrink-0"
            />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-black text-base sm:text-lg text-white truncate max-w-[60%]">
                  {user.username}
                </span>
                <span className="px-2 py-0.5 bg-rose-600 text-white font-mono font-bold text-[10px] uppercase rounded-md shrink-0">
                  {t('levelLabel', lang, { n: user.vipLevel })}
                </span>
              </div>

              <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('vipTitleLabel', lang, { name: vipName })}</span>
              </span>

              <div className="w-full bg-zinc-900 rounded-full h-2 border border-zinc-800 overflow-hidden mt-0.5">
                <div
                  className="bg-gradient-to-r from-rose-600 to-rose-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">
                {user.vipXp} / {user.vipMaxXp} XP ({progressPercent}%)
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('totalWagered', lang)}</span>
              <span className="font-mono font-bold text-sm text-white mt-1 truncate">
                {formatCurrency(user.totalWageredUSD, currency)}
              </span>
            </div>
            <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('profit', lang)}</span>
              <span className={`font-mono font-bold text-sm mt-1 truncate ${user.totalProfitUSD >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                {formatCurrency(user.totalProfitUSD, currency)}
              </span>
            </div>
            <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('totalOperativeBets', lang)}</span>
              <span className="font-mono font-bold text-sm text-white mt-1">{user.totalBetsCount}</span>
            </div>
            <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('winRate', lang)}</span>
              <span className="font-mono font-bold text-sm text-emerald-400 mt-1">
                {user.totalBetsCount > 0
                  ? `${Math.round((user.totalWinsCount / user.totalBetsCount) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </div>

          {/* History */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-4 h-4 text-rose-500" />
              {t('history', lang)}
            </span>

            {loadingHistory ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 text-rose-500 animate-spin" />
              </div>
            ) : displayHistory.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-4 text-center bg-[#121217] rounded-xl border border-zinc-800">
                {t('noHistory', lang)}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {displayHistory.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#121217] border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${item.win ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="font-bold text-white truncate">{item.gameName}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono shrink-0">
                      <span className="text-zinc-400 hidden xs:inline">
                        {formatCurrency(item.betAmountUSD, currency)}
                      </span>
                      <span className={item.win ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                        {item.win ? `+${formatCurrency(item.payoutUSD, currency)}` : '$ 0.00'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
