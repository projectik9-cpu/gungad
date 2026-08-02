import React from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../types';
import { t } from '../translations';
import { formatCurrency } from '../utils/currencies';
import { soundFx } from '../utils/sound';
import { X, Award, Crown, ShieldAlert, Trophy, Crosshair, History } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currency: Currency;
  lang: any;
  history: BetHistoryItem[];
}

const VIP_RANK_KEYS = ['vipRank1', 'vipRank2', 'vipRank3', 'vipRank4', 'vipRank5', 'vipRank6'] as const;

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  currency,
  lang,
  history,
}) => {
  if (!isOpen) return null;

  const vipKey = VIP_RANK_KEYS[Math.min(VIP_RANK_KEYS.length - 1, user.vipLevel - 1)];
  const vipName = t(vipKey, lang);
  const progressPercent = Math.min(100, Math.round((user.vipXp / user.vipMaxXp) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#0e0e12] border border-rose-900/50 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-rose-500" />
            <h3 className="font-display font-black text-lg uppercase tracking-wider text-white">
              {t('profileOverview', lang)}
            </h3>
          </div>
          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Badge Banner */}
        <div className="bg-radial-dark border border-rose-900/50 p-5 rounded-2xl flex items-center gap-4 relative overflow-hidden">
          <img
            src={user.avatar}
            alt={user.username}
            className="w-16 h-16 rounded-full border-2 border-rose-600 object-cover shadow-[0_0_20px_rgba(225,29,72,0.6)]"
          />
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg text-white">{user.username}</span>
              <span className="px-2 py-0.5 bg-rose-600 text-white font-mono font-bold text-[10px] uppercase rounded-md shadow-md">
                {t('levelLabel', lang, { n: user.vipLevel })}
              </span>
            </div>
            <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
              <Crown className="w-3.5 h-3.5" />
              {t('vipTitleLabel', lang, { name: vipName })}
            </span>

            {/* VIP Progress Bar */}
            <div className="w-full bg-zinc-900 rounded-full h-2 mt-1 border border-zinc-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-rose-600 to-rose-400 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(225,29,72,0.8)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-400 font-mono text-right">
              {user.vipXp} / {user.vipMaxXp} XP ({progressPercent}%)
            </span>
          </div>
        </div>

        {/* Tactical Statistics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('totalWagered', lang)}</span>
            <span className="font-mono font-bold text-sm text-white mt-1">
              {formatCurrency(user.totalWageredUSD, currency)}
            </span>
          </div>

          <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('profit', lang)}</span>
            <span className={`font-mono font-bold text-sm mt-1 ${user.totalProfitUSD >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
              {formatCurrency(user.totalProfitUSD, currency)}
            </span>
          </div>

          <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('totalOperativeBets', lang)}</span>
            <span className="font-mono font-bold text-sm text-white mt-1">{user.totalBetsCount}</span>
          </div>

          <div className="bg-[#121217] border border-zinc-800 p-3 rounded-xl flex flex-col">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('winRate', lang)}</span>
            <span className="font-mono font-bold text-sm text-emerald-400 mt-1">
              {user.totalBetsCount > 0
                ? `${Math.round((user.totalWinsCount / user.totalBetsCount) * 100)}%`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Bet History List */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-4 h-4 text-rose-500" />
            {t('history', lang)}
          </span>

          {history.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-4 text-center bg-[#121217] rounded-xl border border-zinc-800">
              {t('noHistory', lang)}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#121217] border border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.win ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <span className="font-bold text-white">{item.gameName}</span>
                  </div>

                  <div className="flex items-center gap-4 font-mono">
                    <span className="text-zinc-400">
                      {t('historyBetLabel', lang)} {formatCurrency(item.betAmountUSD, currency)}
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
  );
};
