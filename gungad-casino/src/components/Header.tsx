import React, { useState, useEffect, useRef } from 'react';
import { Currency, Language, UserProfile } from '../types';
import { LANGUAGES, t } from '../translations';
import { CURRENCIES, formatCurrency } from '../utils/currencies';
import { RevolverLogo } from './RevolverLogo';
import { SettingsMenu } from './SettingsMenu';
import { soundFx } from '../utils/sound';
import { Wallet, ChevronDown, Home, CircleDollarSign, UserRound } from 'lucide-react';

interface HeaderProps {
  user: UserProfile;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  lang: Language;
  onLangChange: (l: Language) => void;
  onOpenDeposit: () => void;
  onOpenProfile: () => void;
  onSelectTab: (tab: string) => void;
  playMode: 'real' | 'demo';
  onToggleDemo: () => void;
  sessionStatus?: 'live' | 'demo' | 'loading' | 'error';
  activeTab?: string;
  activeGameId?: string | null;
}

const LANG_CODES: Record<Language, string> = {
  en: 'EN',
  ru: 'RU',
  uk: 'UA',
  kk: 'KZ',
};

const navBtn =
  'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] touch-manipulation select-none';

export const Header: React.FC<HeaderProps> = ({
  user,
  currency,
  onCurrencyChange,
  lang,
  onLangChange,
  onOpenDeposit,
  onOpenProfile,
  onSelectTab,
  playMode,
  onToggleDemo,
  sessionStatus = 'loading',
  activeTab = 'games',
  activeGameId = null,
}) => {
  const [langOpen, setLangOpen] = useState(false);
  const [currOpen, setCurrOpen] = useState(false);
  const topRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (topRef.current && !topRef.current.contains(e.target as Node)) {
        setLangOpen(false);
        setCurrOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const showDemoBadge = playMode === 'demo';
  const showLiveBadge = playMode === 'real' && sessionStatus === 'live';
  const onHome = activeTab === 'games' && !activeGameId;

  const goHome = () => {
    soundFx.unlockAndStartMusic();
    soundFx.playClick();
    onSelectTab('games');
  };

  return (
    <>
      {/* Top bar — always visible on all breakpoints */}
      <header
        ref={topRef}
        className="sticky top-0 z-[200] bg-[#0a0a0d]/98 backdrop-blur-xl border-b border-rose-900/30"
      >
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0 min-w-0">
            {/* Desktop/tablet: menu in top bar. Mobile uses bottom nav. */}
            <div className="hidden md:block">
              <SettingsMenu lang={lang} playMode={playMode} onToggleDemo={onToggleDemo} />
            </div>
            <div className="sm:hidden">
              <RevolverLogo
                size="sm"
                onClick={() => {
                  soundFx.playClick();
                  onSelectTab('games');
                }}
              />
            </div>
            <div className="hidden sm:block">
              <RevolverLogo
                size="md"
                onClick={() => {
                  soundFx.playClick();
                  onSelectTab('games');
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {showDemoBadge && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider border text-amber-400 border-amber-700/50 bg-amber-950/30">
                DEMO
              </span>
            )}
            {showLiveBadge && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider border text-emerald-400 border-emerald-700/60 bg-emerald-950/40">
                LIVE
              </span>
            )}

            <div className="relative flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundFx.playClick();
                  setCurrOpen((v) => !v);
                  setLangOpen(false);
                }}
                className="flex items-center gap-1 sm:gap-1.5 bg-[#121217] border border-rose-900/40 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl touch-manipulation"
              >
                <Wallet className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="font-mono font-bold text-white text-[10px] sm:text-xs whitespace-nowrap">
                  {formatCurrency(user.balanceUSD, currency)}
                </span>
                <ChevronDown className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
              </button>

              {playMode === 'real' && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    onOpenDeposit();
                  }}
                  className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wide bg-gradient-to-r from-rose-600 to-rose-700 text-white whitespace-nowrap touch-manipulation"
                >
                  {t('deposit', lang)}
                </button>
              )}

              {currOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-[#111116] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-[300]">
                  <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase">{t('selectCurrency', lang)}</div>
                  {Object.values(CURRENCIES).map((c) => (
                    <button
                      type="button"
                      key={c.code}
                      onClick={(e) => {
                        e.stopPropagation();
                        soundFx.playClick();
                        onCurrencyChange(c.code);
                        setCurrOpen(false);
                      }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold ${
                        currency === c.code
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                          : 'text-zinc-300 hover:bg-zinc-800/70'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{c.flag}</span>
                        <span>{c.code}</span>
                      </span>
                      <span className="font-mono text-zinc-400">{c.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundFx.playClick();
                  setLangOpen((v) => !v);
                  setCurrOpen(false);
                }}
                className="flex items-center justify-center gap-0.5 min-w-[2rem] h-7 sm:px-2.5 sm:py-1.5 bg-[#121217] border border-zinc-800 rounded-lg sm:rounded-xl text-xs font-bold text-zinc-200 touch-manipulation"
              >
                <span>{LANG_CODES[lang]}</span>
                <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-[#111116] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-[300]">
                  {Object.values(LANGUAGES).map((l) => (
                    <button
                      type="button"
                      key={l.code}
                      onClick={(e) => {
                        e.stopPropagation();
                        soundFx.playClick();
                        onLangChange(l.code);
                        setLangOpen(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold ${
                        lang === l.code ? 'bg-rose-950 text-rose-300' : 'text-zinc-300 hover:bg-zinc-800/70'
                      }`}
                    >
                      <span className="font-mono text-zinc-400 w-6">{LANG_CODES[l.code]}</span>
                      <span>{l.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                onOpenProfile();
              }}
              className="relative rounded-full border-2 border-rose-600/60 shrink-0 touch-manipulation"
            >
              <img src={user.avatar} alt={user.username} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover" />
              <span className="absolute -bottom-0.5 -right-0.5 bg-rose-600 text-[8px] font-black font-mono text-white px-0.5 rounded-full leading-tight">
                L{user.vipLevel}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile-only bottom nav: Menu · Home · Deposit · Profile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[200] bg-[#0a0a0d]/98 backdrop-blur-xl border-t border-rose-900/40 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 w-full max-w-lg mx-auto">
          <SettingsMenu
            lang={lang}
            playMode={playMode}
            onToggleDemo={onToggleDemo}
            dropUp
            navItem
            label={t('menu', lang)}
          />

          <button
            type="button"
            onClick={goHome}
            className={`${navBtn} ${onHome ? 'text-rose-400' : 'text-zinc-400'}`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-semibold leading-none">{t('navHome', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFx.unlockAndStartMusic();
              soundFx.playClick();
              onOpenDeposit();
            }}
            className={`${navBtn} text-zinc-400 active:text-rose-400`}
          >
            <CircleDollarSign className="w-5 h-5" />
            <span className="text-[10px] font-semibold leading-none">{t('deposit', lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFx.unlockAndStartMusic();
              soundFx.playClick();
              onOpenProfile();
            }}
            className={`${navBtn} text-zinc-400 active:text-rose-400`}
          >
            <UserRound className="w-5 h-5" />
            <span className="text-[10px] font-semibold leading-none">{t('profile', lang)}</span>
          </button>
        </div>
      </nav>
    </>
  );
};
