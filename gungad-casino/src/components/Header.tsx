import React, { useState, useEffect, useRef } from 'react';
import { Currency, Language, UserProfile } from '../types';
import { LANGUAGES, t } from '../translations';
import { CURRENCIES, formatCurrency } from '../utils/currencies';
import { RevolverLogo } from './RevolverLogo';
import { SettingsMenu } from './SettingsMenu';
import { soundFx } from '../utils/sound';
import {
  Wallet,
  Plus,
  ChevronDown,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface HeaderProps {
  user: UserProfile;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  lang: Language;
  onLangChange: (l: Language) => void;
  onOpenDeposit: () => void;
  onOpenProfile: () => void;
  onOpenProvablyFair: () => void;
  onRefillDemo: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

const LANG_CODES: Record<Language, string> = {
  en: 'EN',
  ru: 'RU',
  uk: 'UA',
  kk: 'KZ',
};

export const Header: React.FC<HeaderProps> = ({
  user,
  currency,
  onCurrencyChange,
  lang,
  onLangChange,
  onOpenDeposit,
  onOpenProfile,
  onOpenProvablyFair,
  onRefillDemo,
  activeTab,
  onSelectTab,
}) => {
  const [langOpen, setLangOpen] = useState(false);
  const [currOpen, setCurrOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setLangOpen(false);
        setCurrOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const unlock = () => soundFx.unlockAndStartMusic();

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-[200] bg-[#0a0a0d]/98 backdrop-blur-xl border-b border-rose-900/30"
      onPointerDown={unlock}
    >
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center justify-between gap-1.5 sm:gap-3 min-w-0">
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <div className="sm:hidden">
            <RevolverLogo size="sm" onClick={() => onSelectTab('games')} />
          </div>
          <div className="hidden sm:block">
            <RevolverLogo size="md" onClick={() => onSelectTab('games')} />
          </div>

          <nav className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => { soundFx.playClick(); onSelectTab('games'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all ${
                activeTab === 'games'
                  ? 'bg-rose-950/80 text-white border border-rose-600/50'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              {t('allGames', lang)}
            </button>
            <button
              onClick={() => { soundFx.playClick(); onSelectTab('crash'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'crash'
                  ? 'bg-rose-950/80 text-white border border-rose-600/50'
                  : 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              {t('crashName', lang)}
            </button>
            <button
              onClick={() => { soundFx.playClick(); onOpenProvablyFair(); }}
              className="px-3 py-1.5 rounded-xl text-xs font-display font-bold text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {t('provablyFair', lang)}
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={() => { soundFx.playClick(); onRefillDemo(); }}
            title={t('refillDemo', lang)}
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-300 rounded-xl"
          >
            <RefreshCw className="w-3.5 h-3.5 text-rose-500" />
            <span>+$1k</span>
          </button>

          <div className="relative">
            <button
              onClick={() => { soundFx.playClick(); setCurrOpen(!currOpen); setLangOpen(false); }}
              className="flex items-center gap-1 sm:gap-1.5 bg-[#121217] border border-rose-900/40 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl"
            >
              <Wallet className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="font-mono font-bold text-white text-[10px] sm:text-xs whitespace-nowrap">
                {formatCurrency(user.balanceUSD, currency)}
              </span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
            </button>

            {currOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-[#111116] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-[300]">
                <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase">{t('selectCurrency', lang)}</div>
                {Object.values(CURRENCIES).map((c) => (
                  <button
                    key={c.code}
                    onClick={() => { soundFx.playClick(); onCurrencyChange(c.code); setCurrOpen(false); }}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold ${
                      currency === c.code ? 'bg-rose-950 text-rose-300 border border-rose-800/60' : 'text-zinc-300 hover:bg-zinc-800/70'
                    }`}
                  >
                    <span className="flex items-center gap-2"><span>{c.flag}</span><span>{c.code}</span></span>
                    <span className="font-mono text-zinc-400">{c.symbol}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => { soundFx.playClick(); onOpenDeposit(); }}
            className="flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-lg sm:rounded-xl shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline ml-1 text-xs font-bold uppercase">{t('deposit', lang)}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => { soundFx.playClick(); setLangOpen(!langOpen); setCurrOpen(false); }}
              className="flex items-center justify-center gap-0.5 min-w-[2rem] h-7 sm:h-auto sm:px-2.5 sm:py-1.5 bg-[#121217] border border-zinc-800 rounded-lg sm:rounded-xl text-xs font-bold text-zinc-200"
            >
              <span>{LANG_CODES[lang]}</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-[#111116] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-[300]">
                {Object.values(LANGUAGES).map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { soundFx.playClick(); onLangChange(l.code); setLangOpen(false); }}
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

          <SettingsMenu lang={lang} />

          <button
            onClick={() => { soundFx.playClick(); onOpenProfile(); }}
            className="relative rounded-full border-2 border-rose-600/60 shrink-0"
          >
            <img src={user.avatar} alt={user.username} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover" />
            <span className="absolute -bottom-0.5 -right-0.5 bg-rose-600 text-[8px] font-black font-mono text-white px-0.5 rounded-full leading-tight">
              L{user.vipLevel}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
