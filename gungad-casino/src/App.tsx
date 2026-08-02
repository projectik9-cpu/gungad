import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Currency, Language, UserProfile, BetHistoryItem, GameId } from './types';
import { Header } from './components/Header';
import { GamesGrid } from './components/GamesGrid';
import { CrashGame } from './components/games/CrashGame';
import { RouletteGame } from './components/games/RouletteGame';
import { BlackjackGame } from './components/games/BlackjackGame';
import { CoinFlipGame } from './components/games/CoinFlipGame';
import { DiceGame } from './components/games/DiceGame';
import { MinesGame } from './components/games/MinesGame';
import { PlinkoGame } from './components/games/PlinkoGame';
import { DepositModal } from './components/DepositModal';
import { ProfileModal } from './components/ProfileModal';
import { ProvablyFairModal } from './components/ProvablyFairModal';
import { RevolverLogo } from './components/RevolverLogo';
import { t } from './translations';
import { soundFx } from './utils/sound';
import { DRAWN_USER_AVATAR } from './utils/avatar';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { centsToUsd, usdToCents } from './types/database';

// Supabase hooks
import { useGgSession } from './hooks/useGgSession';
import { useGgBalance } from './hooks/useGgBalance';
import { useGgOnline } from './hooks/useGgOnline';

// Stable session ID for this browser tab
const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Demo fallback profile when not in Telegram
const DEMO_BALANCE_CENTS = 250000; // $2500

function buildUserProfile(
  session: import('./hooks/useGgSession').GgSessionData | null,
  isLive: boolean,
  balanceCents: number,
): UserProfile {
  if (isLive && session) {
    return {
      username:       session.username ?? session.first_name ?? 'Player',
      avatar:         DRAWN_USER_AVATAR,
      balanceUSD:     centsToUsd(balanceCents),
      vipLevel:       session.vip_level,
      vipXp:          session.vip_xp,
      vipMaxXp:       Math.round(1000 * Math.pow(1.8, session.vip_level - 1)),
      totalWageredUSD: centsToUsd(session.total_wagered_cents),
      totalProfitUSD:  centsToUsd(session.total_won_cents - session.total_wagered_cents),
      totalBetsCount:  0, // populated from bet history later
      totalWinsCount:  0,
    };
  }
  // Demo
  return {
    username:        'Operative_X',
    avatar:          DRAWN_USER_AVATAR,
    balanceUSD:      centsToUsd(balanceCents),
    vipLevel:        1,
    vipXp:           0,
    vipMaxXp:        1000,
    totalWageredUSD: 0,
    totalProfitUSD:  0,
    totalBetsCount:  0,
    totalWinsCount:  0,
  };
}

export default function App() {
  // ─── Server session & wallet ─────────────────────────────────────────────
  const { session, status, refreshWallet, updateBalance } = useGgSession();
  const isLive = status === 'live';

  // Local balance_cents state (kept in sync with server via hooks)
  const [balanceCents, setBalanceCents] = useState<number>(() => {
    if (isLive && session) return session.balance_cents;
    // Demo fallback from localStorage
    const saved = localStorage.getItem('gungad_balance_cents');
    return saved ? parseInt(saved) : DEMO_BALANCE_CENTS;
  });

  // Sync balanceCents when session first loads
  useEffect(() => {
    if (isLive && session) {
      setBalanceCents(session.balance_cents);
    }
  }, [isLive, session?.balance_cents]);

  const handleBalanceUpdate = useCallback((newCents: number) => {
    setBalanceCents(Math.max(0, newCents));
    updateBalance(Math.max(0, newCents));
    if (!isLive) {
      localStorage.setItem('gungad_balance_cents', String(Math.max(0, newCents)));
    }
  }, [isLive, updateBalance]);

  // ─── Bet settle ──────────────────────────────────────────────────────────
  const { settleBet, refillDemo } = useGgBalance(session, status, handleBalanceUpdate);

  // ─── Derived UserProfile for UI components ───────────────────────────────
  const [extraStats, setExtraStats] = useState({ betsCount: 0, winsCount: 0 });
  const user: UserProfile = useMemo(() => {
    const profile = buildUserProfile(session, isLive, balanceCents);
    return {
      ...profile,
      totalBetsCount: extraStats.betsCount,
      totalWinsCount: extraStats.winsCount,
    };
  }, [session, isLive, balanceCents, extraStats]);

  // ─── Settings (stored in localStorage, UI-only) ──────────────────────────
  const [currency, setCurrency] = useState<Currency>(() =>
    (localStorage.getItem('gungad_currency') as Currency) || 'USD'
  );
  const [lang, setLang] = useState<Language>(() =>
    (localStorage.getItem('gungad_lang') as Language) || 'ru'
  );

  useEffect(() => { localStorage.setItem('gungad_currency', currency); }, [currency]);
  useEffect(() => { localStorage.setItem('gungad_lang', lang); }, [lang]);

  // ─── Navigation ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState<string>('games');
  const [activeGameId, setActiveGameId] = useState<GameId | null>(null);

  // ─── Bet history (local for this session + pulled from DB) ───────────────
  const [betHistory, setBetHistory] = useState<BetHistoryItem[]>([]);

  // ─── Modals ──────────────────────────────────────────────────────────────
  const [depositOpen, setDepositOpen]           = useState(false);
  const [profileOpen, setProfileOpen]           = useState(false);
  const [provablyFairOpen, setProvablyFairOpen] = useState(false);

  // ─── Online counter ───────────────────────────────────────────────────────
  const onlineCount = useGgOnline(
    session?.profile_id ?? null,
    SESSION_ID,
    activeGameId,
    isLive,
  );

  // ─── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Called by every game component when a round ends.
   * Sends to server (live) or updates demo balance.
   */
  const handleUpdateBalance = useCallback((newBalanceUSD: number) => {
    handleBalanceUpdate(usdToCents(newBalanceUSD));
  }, [handleBalanceUpdate]);

  const handleAddBetHistory = useCallback((item: BetHistoryItem) => {
    setBetHistory(prev => [item, ...prev.slice(0, 49)]);

    // Update local extra stats
    setExtraStats(prev => ({
      betsCount: prev.betsCount + 1,
      winsCount: item.win ? prev.winsCount + 1 : prev.winsCount,
    }));

    // In live mode: fire settle API
    if (isLive && session?.profile_id) {
      const betCents    = usdToCents(item.betAmountUSD);
      const payoutCents = usdToCents(item.payoutUSD);

      settleBet({
        game_id:     item.gameId,
        betUSD:      item.betAmountUSD,
        payoutUSD:   item.payoutUSD,
        multiplier:  item.multiplier,
        status:      item.win ? (item.multiplier === 1 ? 'push' : 'won') : 'lost',
        result:      { payout: item.payoutUSD, multiplier: item.multiplier },
        client_seed: item.clientSeed,
        server_seed_hash: item.serverSeedHash,
      }).then(res => {
        if (res.ok) {
          // Server confirmed balance — sync
          handleBalanceUpdate(res.balance_cents);
        }
      });
    }
  }, [isLive, session?.profile_id, settleBet, handleBalanceUpdate]);

  const handleRefillDemo = useCallback(async () => {
    soundFx.playWin();
    const newCents = await refillDemo();
    setBalanceCents(newCents);
  }, [refillDemo]);

  const handleSelectGame = useCallback((gameId: GameId) => {
    soundFx.playClick();
    setActiveGameId(gameId);
    setActiveTab('game');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ─── Common game props ────────────────────────────────────────────────────
  const gameProps = useMemo(() => ({
    user,
    currency,
    lang,
    onUpdateBalance: handleUpdateBalance,
    onAddHistory:    handleAddBetHistory,
  }), [user, currency, lang, handleUpdateBalance, handleAddBetHistory]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white overflow-x-hidden max-w-[100vw]"
      onPointerDown={() => soundFx.unlockAndStartMusic()}
    >
      <Header
        user={user}
        currency={currency}
        onCurrencyChange={setCurrency}
        lang={lang}
        onLangChange={setLang}
        onOpenDeposit={() => setDepositOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenProvablyFair={() => setProvablyFairOpen(true)}
        onRefillDemo={handleRefillDemo}
        activeTab={activeTab}
        onSelectTab={(tKey) => {
          if (tKey === 'games') { setActiveGameId(null); setActiveTab('games'); }
          else if (tKey === 'crash') { handleSelectGame('crash'); }
        }}
      />

      {/* Десктопная раскладка: sidebar слева + content справа */}
      <div className="flex-1 flex">
        {/* Боковое меню — только на больших экранах */}
        <aside className="hidden lg:flex flex-col gap-2 w-48 shrink-0 border-r border-zinc-900 bg-[#09090b] px-3 py-5 sticky top-14 self-start h-[calc(100vh-56px)] overflow-y-auto">
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider px-2 mb-1">{t('allGames', lang)}</span>
          {[
            { id: 'games',    label: t('allGames',     lang) },
            { id: 'crash',    label: t('crashName',    lang) },
            { id: 'roulette', label: t('rouletteName', lang) },
            { id: 'blackjack',label: t('blackjackName',lang) },
            { id: 'coinflip', label: t('coinflipName', lang) },
            { id: 'dice',     label: t('diceName',     lang) },
            { id: 'mines',    label: t('minesName',    lang) },
            { id: 'plinko',   label: t('plinkoName',   lang) },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                soundFx.playClick();
                if (item.id === 'games') { setActiveGameId(null); setActiveTab('games'); }
                else { handleSelectGame(item.id as GameId); }
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                (item.id === 'games' && activeTab === 'games') || (activeGameId === item.id)
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-800/50'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              {item.label}
            </button>
          ))}

          {/* Live / Demo badge */}
          <div className="mt-auto px-2 pb-2">
            {isLive ? (
              <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            ) : (
              <span className="text-[10px] font-mono text-zinc-600">DEMO</span>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 max-w-full px-3 sm:px-5 lg:px-6 py-5 flex flex-col gap-5">

          {/* Hero Banner */}
          {activeTab === 'games' && !activeGameId && (
            <div className="relative bg-[#0e0e13] border border-rose-900/40 rounded-2xl px-6 py-8 overflow-hidden shadow-xl flex flex-col items-center justify-center text-center gap-4">
              <div className="absolute inset-0 bg-[radial-gradient(#e11d48_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.07] pointer-events-none" />
              <RevolverLogo size="lg" />
              {/* Online counter — real or fake */}
              <div className="flex items-center gap-1.5 text-sm font-mono font-bold text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e] animate-pulse" />
                {onlineCount}
              </div>
              {/* Session status indicator on mobile */}
              {status === 'loading' && (
                <span className="text-[10px] text-zinc-600 animate-pulse">Подключение…</span>
              )}
            </div>
          )}

          {/* Back button — внутри игры */}
          {activeTab === 'game' && activeGameId && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => { soundFx.playClick(); setActiveTab('games'); setActiveGameId(null); }}
                className="px-4 py-2 bg-[#121217] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-display font-bold uppercase rounded-xl flex items-center gap-2 transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-rose-500" />
                <span>{t('allGames', lang)}</span>
              </button>
              <span className="text-xs font-bold font-mono text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                {t('provablyFair', lang)}
              </span>
            </div>
          )}

          {/* Games Grid */}
          {activeTab === 'games' && <GamesGrid onSelectGame={handleSelectGame} lang={lang} />}

          {/* Game Views */}
          {activeTab === 'game' && activeGameId === 'crash'     && <CrashGame     {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'roulette'  && <RouletteGame  {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'blackjack' && <BlackjackGame {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'coinflip'  && <CoinFlipGame  {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'dice'      && <DiceGame      {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'mines'     && <MinesGame     {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'plinko'    && <PlinkoGame    {...gameProps} />}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-rose-900/30 bg-[#09090b] py-6 text-zinc-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RevolverLogo size="sm" />
            <span className="border-l border-zinc-800 pl-3">{t('footerCopyright', lang)}</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setProvablyFairOpen(true)} className="hover:text-white transition-colors">{t('provablyFair', lang)}</button>
            <button onClick={() => setDepositOpen(true)} className="hover:text-white transition-colors">{t('deposit', lang)}</button>
            <button onClick={() => setProfileOpen(true)} className="hover:text-white transition-colors">{t('profile', lang)}</button>
          </div>
        </div>
      </footer>

      <DepositModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        user={user}
        currency={currency}
        lang={lang}
        onRefillDemo={handleRefillDemo}
        onUpdateBalance={handleUpdateBalance}
      />
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        currency={currency}
        lang={lang}
        history={betHistory}
      />
      <ProvablyFairModal
        isOpen={provablyFairOpen}
        onClose={() => setProvablyFairOpen(false)}
        lang={lang}
      />
    </div>
  );
}
