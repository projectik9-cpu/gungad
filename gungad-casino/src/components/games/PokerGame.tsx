import React, { useState } from 'react';
import { Currency, UserProfile } from '../../types';
import { t } from '../../translations';
import { pokerFetch } from '../../game/pokerApi';
import { PokerLobby } from './PokerLobby';
import { PokerTableView } from './PokerTable';
import { usePokerTable } from '../../hooks/usePokerTable';
import { soundFx } from '../../utils/sound';
import { ArrowLeft } from 'lucide-react';

interface PokerGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  profileId?: string | null;
  sessionStatus?: string;
  availableCents: number;
  onRefreshWallet?: () => void;
}

export const PokerGame: React.FC<PokerGameProps> = ({
  user, lang, playMode, profileId, sessionStatus, availableCents, onRefreshWallet,
}) => {
  const [tableId, setTableId] = useState<string | null>(null);
  const live = sessionStatus === 'live' && playMode === 'real' && Boolean(profileId);
  const { state, error, busy, act, refresh } = usePokerTable(tableId, profileId || null, Boolean(tableId && live));

  if (playMode === 'demo') {
    return (
      <div className="rounded-2xl border border-amber-800/50 bg-amber-950/30 p-6 text-amber-200 text-sm">
        {t('pokerDemoBlock', lang)}
      </div>
    );
  }

  if (!live || !profileId) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#121217] p-6 text-zinc-400 text-sm">
        {t('pokerNeedLive', lang)}
      </div>
    );
  }

  const leave = async () => {
    soundFx.playClick();
    if (!tableId) return;
    try {
      const json = await pokerFetch('/leave', { profile_id: profileId, table_id: tableId });
      onRefreshWallet?.();
      if (json.queued) {
        void refresh();
        return;
      }
      setTableId(null);
    } catch {
      onRefreshWallet?.();
      setTableId(null);
    }
  };

  const rebuy = async (amount: number) => {
    if (!tableId) return;
    await pokerFetch('/rebuy', { profile_id: profileId, table_id: tableId, amount_cents: amount });
    onRefreshWallet?.();
    void refresh();
  };

  if (!tableId) {
    return (
      <PokerLobby
        lang={lang}
        profileId={profileId}
        username={user.username}
        firstName={user.username}
        availableCents={availableCents}
        onJoin={(id) => { onRefreshWallet?.(); setTableId(id); }}
        onSpectate={(id) => setTableId(id)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => { soundFx.playClick(); setTableId(null); }}
        className="self-start text-[11px] text-zinc-400 flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t('pokerLobby', lang)}
      </button>
      {error && <div className="text-rose-400 text-xs">{error}</div>}
      {state ? (
        <PokerTableView
          lang={lang}
          profileId={profileId}
          state={state}
          busy={busy}
          onAction={async (type, amt) => {
            soundFx.playClick();
            await act(type, amt);
            onRefreshWallet?.();
          }}
          onLeave={leave}
          onRebuy={rebuy}
        />
      ) : (
        <div className="text-zinc-500 text-sm py-8 text-center">…</div>
      )}
    </div>
  );
};
