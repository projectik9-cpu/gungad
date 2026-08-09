import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { SlotsGame } from './components/games/SlotsGame';
import { DepositModal } from './components/DepositModal';
import { SupportModal } from './components/SupportModal';
import { ProfileModal } from './components/ProfileModal';
import { ProvablyFairModal } from './components/ProvablyFairModal';
import { AgeGate } from './components/AgeGate';
import { RevolverLogo } from './components/RevolverLogo';
import { t } from './translations';
import { soundFx } from './utils/sound';
import { DRAWN_USER_AVATAR } from './utils/avatar';
import { readLegalAcceptance } from './legal/legalContent';

/** Compute effective VIP level and intra-level XP from total accumulated XP */
function computeVipLevel(totalXp: number): { level: number; xpInLevel: number; maxXpInLevel: number } {
  let level = 1;
  let cumulative = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cap = Math.round(1000 * Math.pow(1.8, level - 1));
    if (cumulative + cap > totalXp) {
      return { level, xpInLevel: totalXp - cumulative, maxXpInLevel: cap };
    }
    cumulative += cap;
    level++;
    if (level > 50) break; // safety
  }
  return { level, xpInLevel: 0, maxXpInLevel: Math.round(1000 * Math.pow(1.8, level - 1)) };
}

/** Try to get Telegram user photo URL */
function getTgPhotoUrl(): string | null {
  try {
    return (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url ?? null;
  } catch {
    return null;
  }
}
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { centsToUsd, usdToCents } from './types/database';

import { useGgSession } from './hooks/useGgSession';
import { useGgBalance } from './hooks/useGgBalance';
import { useGgOnline } from './hooks/useGgOnline';
import { useLiveRates } from './hooks/useLiveRates';

const SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Credits granted when user opts into demo mode */
const DEMO_START_CENTS = 100000; // $1000

type PlayMode = 'real' | 'demo';

function buildUserProfile(
  session: import('./hooks/useGgSession').GgSessionData | null,
  useLiveProfile: boolean,
  balanceCents: number,
): UserProfile {
  const tgPhoto = getTgPhotoUrl();
  const avatar = tgPhoto ?? DRAWN_USER_AVATAR;

  if (useLiveProfile && session) {
    // Server may lag behind leveling — compute correct level from XP
    const { level, xpInLevel, maxXpInLevel } = computeVipLevel(session.vip_xp);
    return {
      username:        session.username ?? session.first_name ?? 'Player',
      avatar,
      balanceUSD:      centsToUsd(balanceCents),
      vipLevel:        level,
      vipXp:           xpInLevel,
      vipMaxXp:        maxXpInLevel,
      totalWageredUSD: centsToUsd(session.total_wagered_cents),
      totalProfitUSD:  centsToUsd(session.total_won_cents - session.total_wagered_cents),
      totalBetsCount:  0,
      totalWinsCount:  0,
    };
  }
  return {
    username:        session?.username ?? session?.first_name ?? 'Operative_X',
    avatar,
    balanceUSD:      centsToUsd(balanceCents),
    vipLevel:        session?.vip_level ?? 1,
    vipXp:           session?.vip_xp ?? 0,
    vipMaxXp:        1000,
    totalWageredUSD: 0,
    totalProfitUSD:  0,
    totalBetsCount:  0,
    totalWinsCount:  0,
  };
}

export default function App() {
  const { session, status, updateBalance } = useGgSession();
  const { version: ratesVersion } = useLiveRates();
  const isLive = status === 'live';

  const [playMode, setPlayMode] = useState<PlayMode>(() =>
    localStorage.getItem('gungad_play_mode') === 'demo' ? 'demo' : 'real',
  );

  // Real wallet (server) — default 0, never auto-demo
  const [balanceCents, setBalanceCents] = useState(0);

  // Separate demo wallet
  const [demoBalanceCents, setDemoBalanceCents] = useState(() => {
    const saved = localStorage.getItem('gungad_demo_balance_cents');
    if (saved != null && !Number.isNaN(parseInt(saved, 10))) return parseInt(saved, 10);
    return DEMO_START_CENTS;
  });

  // Clear legacy auto-demo localStorage key once
  useEffect(() => {
    localStorage.removeItem('gungad_balance_cents');
  }, []);

  useEffect(() => {
    localStorage.setItem('gungad_play_mode', playMode);
  }, [playMode]);

  useEffect(() => {
    localStorage.setItem('gungad_demo_balance_cents', String(demoBalanceCents));
  }, [demoBalanceCents]);

  // Sync real balance from server when live and in real mode
  useEffect(() => {
    if (isLive && session && playMode === 'real') {
      setBalanceCents(session.balance_cents);
    }
  }, [isLive, session?.balance_cents, playMode]);

  const displayBalanceCents = playMode === 'demo' ? demoBalanceCents : balanceCents;

  const handleBalanceUpdate = useCallback((newCents: number) => {
    const next = Math.max(0, newCents);
    if (playMode === 'demo') {
      setDemoBalanceCents(next);
      return;
    }
    setBalanceCents(next);
    updateBalance(next);
  }, [playMode, updateBalance]);

  const { settleBet, refillDemo } = useGgBalance(
    session,
    status,
    handleBalanceUpdate,
    { playMode, balanceCents: displayBalanceCents },
  );

  const [extraStats, setExtraStats] = useState({ betsCount: 0, winsCount: 0 });
  const useLiveProfile = isLive && playMode === 'real';
  const user: UserProfile = useMemo(() => {
    const profile = buildUserProfile(session, useLiveProfile, displayBalanceCents);
    return {
      ...profile,
      totalBetsCount: extraStats.betsCount,
      totalWinsCount: extraStats.winsCount,
    };
  }, [session, useLiveProfile, displayBalanceCents, extraStats]);

  const [currency, setCurrency] = useState<Currency>(() =>
    (localStorage.getItem('gungad_currency') as Currency) || 'USD',
  );
  const [lang, setLang] = useState<Language>(() =>
    (localStorage.getItem('gungad_lang') as Language) || 'ru',
  );
  const [legalOk, setLegalOk] = useState(() => Boolean(readLegalAcceptance()));

  useEffect(() => { localStorage.setItem('gungad_currency', currency); }, [currency]);
  useEffect(() => { localStorage.setItem('gungad_lang', lang); }, [lang]);

  const [activeTab, setActiveTab] = useState<string>('games');
  const [activeGameId, setActiveGameId] = useState<GameId | null>(null);
  const [betHistory, setBetHistory] = useState<BetHistoryItem[]>([]);
  const [depositOpen, setDepositOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [provablyFairOpen, setProvablyFairOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  // Close all modals helper — prevents stacking
  const closeAllModals = () => {
    setDepositOpen(false);
    setProfileOpen(false);
    setProvablyFairOpen(false);
    setSupportOpen(false);
  };
  const openDeposit = () => { closeAllModals(); setDepositOpen(true); };
  const openProfile = () => { closeAllModals(); setProfileOpen(true); };
  const openProvablyFair = () => { closeAllModals(); setProvablyFairOpen(true); };
  const openSupport = () => { closeAllModals(); setSupportOpen(true); };

  const onlineCount = useGgOnline(
    session?.profile_id ?? null,
    SESSION_ID,
    activeGameId,
    isLive,
  );

  const handleUpdateBalance = useCallback((newBalanceUSD: number) => {
    handleBalanceUpdate(usdToCents(newBalanceUSD));
  }, [handleBalanceUpdate]);

  const handleAddBetHistory = useCallback((item: BetHistoryItem) => {
    setBetHistory(prev => [item, ...prev.slice(0, 49)]);
    setExtraStats(prev => ({
      betsCount: prev.betsCount + 1,
      winsCount: item.win ? prev.winsCount + 1 : prev.winsCount,
    }));

    // Real money settle only when live + real play mode
    if (playMode === 'real' && isLive && session?.profile_id) {
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
        if (res.ok) handleBalanceUpdate(res.balance_cents);
      });
    }
  }, [playMode, isLive, session?.profile_id, settleBet, handleBalanceUpdate]);

  const handleRefillDemo = useCallback(async () => {
    if (playMode !== 'demo') return;
    soundFx.playWin();
    const newCents = await refillDemo();
    setDemoBalanceCents(newCents);
  }, [playMode, refillDemo]);

  const handleToggleDemo = useCallback(() => {
    soundFx.playClick();
    setPlayMode(prev => {
      if (prev === 'demo') {
        // Exit demo → restore real balance
        if (isLive && session) setBalanceCents(session.balance_cents);
        else setBalanceCents(0);
        return 'real';
      }
      // Enter demo — ensure starting credits if empty
      setDemoBalanceCents(cur => (cur > 0 ? cur : DEMO_START_CENTS));
      return 'demo';
    });
  }, [isLive, session]);

  const handleSelectGame = useCallback((gameId: GameId) => {
    soundFx.stopAllFx();
    soundFx.playClick();
    setActiveGameId(gameId);
    setActiveTab('game');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleExitSlots = useCallback(() => {
    soundFx.stopAllFx();
    soundFx.playClick();
    setActiveGameId(null);
    setActiveTab('games');
  }, []);

  useEffect(() => {
    soundFx.stopAllFx();
  }, [activeGameId]);

  const gameProps = useMemo(() => ({
    user,
    currency,
    lang,
    playMode,
    onUpdateBalance: handleUpdateBalance,
    onAddHistory:    handleAddBetHistory,
  }), [user, currency, lang, playMode, handleUpdateBalance, handleAddBetHistory]);

  return (
    <>
    <div
      className={`min-h-screen bg-[#0a0a0a] text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white overflow-x-hidden max-w-[100vw] pb-[4.5rem] md:pb-0${!legalOk ? ' pointer-events-none select-none' : ''}`}
      onPointerDown={() => { if (legalOk) soundFx.unlockAndStartMusic(); }}
      aria-hidden={!legalOk}
    >
      {/* Hide casino chrome entirely while fullscreen slots is open */}
      {activeGameId !== 'slots' && (
        <Header
          key={`hdr-${ratesVersion}`}
          user={user}
          currency={currency}
          onCurrencyChange={setCurrency}
          lang={lang}
          onLangChange={setLang}
          onOpenDeposit={openDeposit}
          onOpenProfile={openProfile}
          onCloseModals={closeAllModals}
          activeModal={depositOpen ? 'deposit' : profileOpen ? 'profile' : null}
          playMode={playMode}
          onToggleDemo={handleToggleDemo}
          onOpenSupport={openSupport}
          sessionStatus={status}
          activeTab={activeTab}
          activeGameId={activeGameId}
          onSelectTab={(tKey) => {
            if (tKey === 'games') { soundFx.stopAllFx(); setActiveGameId(null); setActiveTab('games'); }
            else if (tKey === 'crash') { handleSelectGame('crash'); }
          }}
        />
      )}

      <div className="flex-1 flex">
        <aside className="hidden lg:flex flex-col gap-2 w-48 shrink-0 border-r border-zinc-900 bg-[#09090b] px-3 py-5 sticky top-14 self-start h-[calc(100vh-56px)] overflow-y-auto">
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider px-2 mb-1">{t('allGames', lang)}</span>
          {[
            { id: 'games',     label: t('allGames',      lang) },
            { id: 'crash',     label: t('crashName',     lang) },
            { id: 'roulette',  label: t('rouletteName',  lang) },
            { id: 'blackjack', label: t('blackjackName', lang) },
            { id: 'coinflip',  label: t('coinflipName',  lang) },
            { id: 'dice',      label: t('diceName',      lang) },
            { id: 'mines',     label: t('minesName',     lang) },
            { id: 'plinko',    label: t('plinkoName',    lang) },
            { id: 'slots',     label: t('slotsName',     lang) },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                soundFx.playClick();
                if (item.id === 'games') { soundFx.stopAllFx(); setActiveGameId(null); setActiveTab('games'); }
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

          {playMode === 'demo' && (
            <div className="mt-auto px-2 pb-2">
              <span className="text-[10px] font-mono text-amber-500">DEMO</span>
            </div>
          )}
        </aside>

        <main className={`flex-1 min-w-0 max-w-full px-3 sm:px-5 lg:px-6 flex flex-col ${
          activeTab === 'game' ? 'py-2 sm:py-3 gap-2 sm:gap-3' : 'py-5 gap-5'
        }`}>
          {activeTab === 'games' && !activeGameId && (
            <div className="relative bg-[#0e0e13] border border-rose-900/40 rounded-2xl px-6 py-8 overflow-hidden shadow-xl flex flex-col items-center justify-center text-center gap-4">
              <div className="absolute inset-0 bg-[radial-gradient(#e11d48_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.07] pointer-events-none" />
              <RevolverLogo size="lg" />
              <div className="flex items-center gap-1.5 text-sm font-mono font-bold text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e] animate-pulse" />
                {onlineCount}
              </div>
              {status === 'loading' && (
                <span className="text-[10px] text-zinc-600 animate-pulse">Подключение…</span>
              )}
            </div>
          )}

          {activeTab === 'game' && activeGameId && (
            <div className="flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={() => { soundFx.stopAllFx(); soundFx.playClick(); setActiveTab('games'); setActiveGameId(null); }}
                className="px-3 py-1.5 bg-[#121217] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-[11px] font-display font-bold uppercase rounded-lg flex items-center gap-1.5 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-rose-500" />
                <span>{t('allGames', lang)}</span>
              </button>
              <span className="text-[10px] font-bold font-mono text-zinc-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                {t('provablyFair', lang)}
              </span>
            </div>
          )}

          {activeTab === 'games' && <GamesGrid onSelectGame={handleSelectGame} lang={lang} />}

          {activeTab === 'game' && activeGameId === 'crash'     && <CrashGame     {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'roulette'  && <RouletteGame  {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'blackjack' && <BlackjackGame {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'coinflip'  && <CoinFlipGame  {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'dice'      && <DiceGame      {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'mines'     && <MinesGame     {...gameProps} />}
          {activeTab === 'game' && activeGameId === 'plinko'    && <PlinkoGame    {...gameProps} />}
          {/* slots is rendered fullscreen outside main layout — see overlay below */}
        </main>
      </div>

      {activeTab !== 'game' && (
      <footer className="border-t border-rose-900/30 bg-[#09090b] py-6 text-zinc-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RevolverLogo size="sm" />
            <span className="border-l border-zinc-800 pl-3">{t('footerCopyright', lang)}</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={openProvablyFair} className="hover:text-white transition-colors">{t('provablyFair', lang)}</button>
            <button onClick={openDeposit} className="hover:text-white transition-colors">{t('deposit', lang)}</button>
            <button onClick={openProfile} className="hover:text-white transition-colors">{t('profile', lang)}</button>
          </div>
        </div>
      </footer>
      )}

      <DepositModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        user={user}
        currency={currency}
        lang={lang}
        onRefillDemo={handleRefillDemo}
        onUpdateBalance={handleUpdateBalance}
        playMode={playMode}
        profileId={session?.profile_id ?? null}
      />
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        currency={currency}
        lang={lang}
        history={betHistory}
        profileId={session?.profile_id ?? null}
      />
      <ProvablyFairModal
        isOpen={provablyFairOpen}
        onClose={() => setProvablyFairOpen(false)}
        lang={lang}
      />
      <SupportModal
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        lang={lang}
        profileId={session?.profile_id ?? null}
      />
    </div>
    {!legalOk && (
      <AgeGate lang={lang} onAccepted={() => setLegalOk(true)} />
    )}

    {/* Fullscreen slots overlay — hides all casino chrome */}
    {activeGameId === 'slots' && (
      <SlotsGame
        {...gameProps}
        onClose={handleExitSlots}
      />
    )}
    </>
  );
}
