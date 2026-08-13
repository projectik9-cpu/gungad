import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Users, Eye } from 'lucide-react';
import { t } from '../../translations';
import { formatChips, pokerFetch } from '../../game/pokerApi';
import { soundFx } from '../../utils/sound';

interface PokerLobbyProps {
  lang: any;
  profileId: string;
  username?: string | null;
  firstName?: string | null;
  availableCents: number;
  onJoin: (tableId: string) => void;
  onSpectate: (tableId: string) => void;
}

export const PokerLobby: React.FC<PokerLobbyProps> = ({
  lang, profileId, username, firstName, availableCents, onJoin, onSpectate,
}) => {
  const [stakes, setStakes] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [tier, setTier] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinTable, setJoinTable] = useState<any>(null);
  const [buyin, setBuyin] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const json = await pokerFetch('/lobby', { profile_id: profileId });
      setStakes(json.stakes || []);
      setTables(json.tables || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [profileId]);

  const filtered = useMemo(
    () => (tier === 'all' ? tables : tables.filter((x) => x.stakeId === tier)),
    [tables, tier],
  );

  const openJoin = (table: any) => {
    soundFx.playClick();
    setJoinTable(table);
    setBuyin(table.minBuyinCents);
  };

  const confirmJoin = async () => {
    if (!joinTable) return;
    soundFx.playClick();
    try {
      await pokerFetch('/join', {
        profile_id: profileId,
        table_id: joinTable.id,
        amount_cents: buyin,
        username,
        first_name: firstName,
      });
      onJoin(joinTable.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const create = async (stakeId: string) => {
    setCreating(true);
    try {
      const json = await pokerFetch('/tables', { profile_id: profileId, stake_id: stakeId, max_seats: stakeId === 'high' || stakeId === 'mid' ? 9 : 6 });
      setCreateOpen(false);
      await load();
      if (json.table?.id) openJoin({
        ...json.table,
        id: json.table.id,
        minBuyinCents: json.table.min_buyin_cents,
        maxBuyinCents: json.table.max_buyin_cents,
        sbCents: json.table.sb_cents,
        bbCents: json.table.bb_cents,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display font-black text-xl text-white uppercase">{t('pokerName', lang)} · {t('pokerCash', lang)}</h2>
        <button
          onClick={() => { soundFx.playClick(); setCreateOpen((v) => !v); }}
          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold uppercase flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> {t('pokerCreate', lang)}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {[{ id: 'all', label: t('allCategories', lang) }, ...stakes.map((s) => ({ id: s.id, label: s.label }))].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { soundFx.playClick(); setTier(tab.id); }}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase shrink-0 ${
              tier === tab.id ? 'bg-rose-600 text-white' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="text-rose-400 text-xs">{error}</div>}
      {loading && <div className="text-zinc-500 text-sm">…</div>}

      {createOpen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stakes.map((s) => (
            <button
              key={s.id}
              disabled={creating}
              onClick={() => create(s.id)}
              className="p-3 rounded-xl border border-rose-900/50 bg-[#121217] text-left hover:border-rose-600"
            >
              <div className="text-white font-bold text-sm">{s.label}</div>
              <div className="text-zinc-400 text-xs font-mono">{formatChips(s.sb_cents)}/{formatChips(s.bb_cents)}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && !loading && (
          <div className="text-zinc-500 text-sm py-8 text-center">{t('pokerNoTables', lang)}</div>
        )}
        {filtered.map((table) => (
          <div key={table.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#121217] border border-zinc-800">
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm font-mono">
                NL {formatChips(table.sbCents)}/{formatChips(table.bbCents)}
              </div>
              <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                <Users className="w-3 h-3" /> {table.occupied}/{table.maxSeats}
                <span className="uppercase">{table.status === 'in_hand' ? table.street : table.status}</span>
                <span>#{table.code}</span>
              </div>
            </div>
            <button
              onClick={() => { soundFx.playClick(); onSpectate(table.id); }}
              className="p-2 rounded-lg bg-zinc-800 text-zinc-300"
              title={t('pokerWatch', lang)}
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              disabled={table.occupied >= table.maxSeats}
              onClick={() => openJoin(table)}
              className="px-3 py-2 rounded-lg bg-rose-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold uppercase"
            >
              {t('pokerSit', lang)}
            </button>
          </div>
        ))}
      </div>

      {joinTable && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121217] border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
            <div className="text-white font-bold">{t('pokerBuyin', lang)}</div>
            <div className="text-xs text-zinc-400 font-mono">
              {formatChips(joinTable.minBuyinCents)} – {formatChips(joinTable.maxBuyinCents)}
            </div>
            <input
              type="range"
              min={joinTable.minBuyinCents}
              max={joinTable.maxBuyinCents}
              step={joinTable.sbCents || 1}
              value={buyin}
              onChange={(e) => setBuyin(Number(e.target.value))}
            />
            <div className="text-center text-xl font-mono text-white">{formatChips(buyin)}</div>
            <div className="text-[11px] text-zinc-500">{t('pokerBuyin', lang)} ≤ {formatChips(availableCents)}</div>
            <div className="flex gap-2">
              <button onClick={() => setJoinTable(null)} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm">{t('slotsCancel', lang)}</button>
              <button
                disabled={buyin > availableCents}
                onClick={confirmJoin}
                className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold"
              >
                {t('pokerJoin', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
