import React, { useEffect, useMemo, useState } from 'react';
import { History, LogOut, MessageCircle, Minus, Plus } from 'lucide-react';
import { t } from '../../translations';
import { formatChips, pokerFetch } from '../../game/pokerApi';
import { soundFx } from '../../utils/sound';
import { PokerCard } from './PokerCard';

const POS6 = [
  { left: '50%', top: '86%' },
  { left: '10%', top: '68%' },
  { left: '10%', top: '28%' },
  { left: '50%', top: '8%' },
  { left: '90%', top: '28%' },
  { left: '90%', top: '68%' },
];
const POS9 = [
  { left: '50%', top: '88%' },
  { left: '18%', top: '78%' },
  { left: '6%', top: '52%' },
  { left: '12%', top: '24%' },
  { left: '38%', top: '8%' },
  { left: '62%', top: '8%' },
  { left: '88%', top: '24%' },
  { left: '94%', top: '52%' },
  { left: '82%', top: '78%' },
];

function seatStyle(maxSeats: number, visualIndex: number): React.CSSProperties {
  const map = maxSeats > 6 ? POS9 : POS6;
  const p = map[visualIndex % map.length];
  return { left: p.left, top: p.top, transform: 'translate(-50%, -50%)' };
}

interface PokerTableProps {
  lang: any;
  profileId: string;
  state: any;
  busy: boolean;
  onAction: (type: string, amountCents?: number) => Promise<void> | void;
  onLeave: () => void;
  onRebuy: (amount: number) => void;
  onRefreshWallet?: () => void;
}

export const PokerTableView: React.FC<PokerTableProps> = ({
  lang, profileId, state, busy, onAction, onLeave, onRebuy,
}) => {
  const table = state.table;
  const you = state.you;
  const [raiseTo, setRaiseTo] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [hist, setHist] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [now, setNow] = useState(Date.now());
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmt, setRebuyAmt] = useState(table.minBuyinCents);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const mySeatNo = you?.seatNo;
  const maxSeats = table.maxSeats || 6;
  const ordered = useMemo(() => {
    const seats = [...(state.seats || [])];
    const byNo: Record<number, any> = {};
    for (const s of seats) byNo[s.seatNo] = s;
    const all = Array.from({ length: maxSeats }, (_, i) => byNo[i + 1] || { seatNo: i + 1, empty: true });
    if (!mySeatNo) return all;
    const idx = all.findIndex((s) => s.seatNo === mySeatNo);
    if (idx < 0) return all;
    return [...all.slice(idx), ...all.slice(0, idx)];
  }, [state.seats, maxSeats, mySeatNo]);

  const raiseSpec = (you?.legal || []).find((a: any) => a.type === 'bet' || a.type === 'raise');
  useEffect(() => {
    if (raiseSpec) setRaiseTo(raiseSpec.minCents);
  }, [raiseSpec?.minCents, table.version]);

  const remain = table.actionDeadlineAt
    ? Math.max(0, Math.ceil((new Date(table.actionDeadlineAt).getTime() - now) / 1000))
    : 0;

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    try {
      const json = await pokerFetch('/chat', { profile_id: profileId, table_id: table.id, text });
      if (json.messages) state.chat = json.messages;
    } catch { /* ignore */ }
  };

  const loadHist = async () => {
    soundFx.playClick();
    setHistOpen(true);
    try {
      const json = await pokerFetch('/history', { profile_id: profileId, table_id: table.id });
      setHist(json.hands || []);
    } catch { /* ignore */ }
  };

  const streetKey: Record<string, string> = {
    idle: 'pokerStreetIdle',
    preflop: 'pokerStreetPreflop',
    flop: 'pokerStreetFlop',
    turn: 'pokerStreetTurn',
    river: 'pokerStreetRiver',
    showdown: 'pokerStreetShowdown',
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
        <span className="font-mono">NL {formatChips(table.sbCents)}/{formatChips(table.bbCents)} · #{table.code}</span>
        <div className="flex gap-1">
          <button onClick={() => { soundFx.playClick(); setChatOpen((v) => !v); }} className="p-1.5 rounded-lg bg-zinc-900"><MessageCircle className="w-4 h-4" /></button>
          <button onClick={loadHist} className="p-1.5 rounded-lg bg-zinc-900"><History className="w-4 h-4" /></button>
            <button onClick={() => { soundFx.playClick(); setRebuyOpen(true); }} className="p-1.5 rounded-lg bg-zinc-900"><Plus className="w-4 h-4" /></button>
            {you?.seated && (
              <button
                onClick={async () => {
                  soundFx.playClick();
                  try {
                    await pokerFetch(state.seats.find((s: any) => s.profileId === profileId)?.sittingOut ? '/sit-in' : '/sit-out', {
                      profile_id: profileId,
                      table_id: table.id,
                      sitting_out: true,
                    });
                  } catch { /* ignore */ }
                }}
                className="p-1.5 rounded-lg bg-zinc-900 text-[10px] px-2"
              >
                {state.seats.find((s: any) => s.profileId === profileId)?.sittingOut ? t('pokerSit', lang) : 'SO'}
              </button>
            )}
          <button onClick={onLeave} className="p-1.5 rounded-lg bg-zinc-900 text-rose-400"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="relative w-full aspect-[4/5] sm:aspect-[16/10] max-h-[520px] rounded-[40%] bg-gradient-to-b from-emerald-950 to-emerald-950/40 border-[10px] border-rose-950 shadow-inner overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
          <div className="text-amber-300 font-mono font-bold text-sm">{t('pokerPot', lang)} {formatChips(table.potTotal || 0)}</div>
          <div className="flex gap-1">
            {(table.board || []).map((c: string, i: number) => <PokerCard key={`${c}-${i}`} code={c} animate />)}
            {Array.from({ length: Math.max(0, 5 - (table.board?.length || 0)) }).map((_, i) => (
              <div key={`e${i}`} className="w-11 h-16 md:w-14 md:h-20 rounded-xl border border-dashed border-emerald-800/60" />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-200/80">{t(streetKey[table.street] as any, lang)}</div>
          {table.winners?.length && table.street === 'showdown' && (
            <div className="text-[11px] text-amber-200 text-center max-w-[240px]">
              {table.winners.filter((w: any) => w.amount > 0).map((w: any) => (
                <div key={w.seatNo}>{w.handNameRu || w.handName} · {formatChips(w.amount)}</div>
              ))}
            </div>
          )}
        </div>

        {ordered.map((seat: any, i: number) => {
          if (seat.empty) {
            return (
              <div key={`e-${seat.seatNo}`} className="absolute w-16 text-center" style={seatStyle(maxSeats, i)}>
                <div className="w-12 h-12 mx-auto rounded-full border border-dashed border-zinc-700 text-zinc-600 text-[10px] flex items-center justify-center">{seat.seatNo}</div>
              </div>
            );
          }
          const name = seat.username ? `@${seat.username}` : (seat.firstName || 'Player');
          const badge = seat.seatNo === table.dealerSeat ? 'D' : seat.seatNo === table.sbSeat ? 'SB' : seat.seatNo === table.bbSeat ? 'BB' : '';
          return (
            <div key={seat.seatNo} className="absolute w-28 text-center" style={seatStyle(maxSeats, i)}>
              <div className={`mx-auto w-14 h-14 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                seat.isActor ? 'border-amber-400 bg-amber-950 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.6)]' : 'border-zinc-600 bg-zinc-900 text-white'
              } ${seat.folded ? 'opacity-40' : ''}`}>
                {name.slice(0, 2).toUpperCase()}
              </div>
              {badge && <span className="absolute -top-1 right-6 text-[9px] bg-rose-700 text-white px-1 rounded">{badge}</span>}
              {seat.isActor && remain > 0 && (
                <div className="text-[10px] text-amber-300 font-mono">{remain}s</div>
              )}
              <div className="text-[10px] text-white truncate">{name}</div>
              <div className="text-[10px] font-mono text-emerald-300">{formatChips(seat.stackCents)}</div>
              {seat.betThisStreet > 0 && <div className="text-[10px] text-amber-400 font-mono">{formatChips(seat.betThisStreet)}</div>}
              {seat.allIn && <div className="text-[9px] text-rose-400 uppercase">all-in</div>}
              {seat.holeCards && !(you?.seated && i === 0) && (
                <div className="flex justify-center gap-0.5 mt-0.5">
                  {seat.holeCards.map((c: string, ci: number) => (
                    <PokerCard key={ci} code={c} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {you?.seated && you.legal?.length > 0 && (
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#121217] border border-zinc-800">
          <div className="text-[11px] text-amber-300 font-bold uppercase">{t('pokerYourTurn', lang)}</div>
          <div className="flex flex-wrap gap-2">
            {you.legal.some((a: any) => a.type === 'fold') && (
              <button disabled={busy} onClick={() => onAction('fold')} className="px-4 py-2 rounded-xl bg-zinc-800 text-white text-sm font-bold">{t('pokerFold', lang)}</button>
            )}
            {you.legal.some((a: any) => a.type === 'check') && (
              <button disabled={busy} onClick={() => onAction('check')} className="px-4 py-2 rounded-xl bg-zinc-700 text-white text-sm font-bold">{t('pokerCheck', lang)}</button>
            )}
            {you.legal.filter((a: any) => a.type === 'call').map((a: any) => (
              <button key="call" disabled={busy} onClick={() => onAction('call')} className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-sm font-bold">
                {t('pokerCall', lang)} {formatChips(a.amountCents)}
              </button>
            ))}
            {you.legal.some((a: any) => a.type === 'allin') && (
              <button disabled={busy} onClick={() => onAction('allin')} className="px-4 py-2 rounded-xl bg-rose-800 text-white text-sm font-bold">{t('pokerAllIn', lang)}</button>
            )}
          </div>
          {raiseSpec && (
            <div className="flex items-center gap-2">
              <button onClick={() => setRaiseTo((v) => Math.max(raiseSpec.minCents, v - table.bbCents))} className="p-1 rounded bg-zinc-800"><Minus className="w-4 h-4" /></button>
              <input
                type="range"
                min={raiseSpec.minCents}
                max={raiseSpec.maxCents}
                step={table.sbCents || 1}
                value={Math.min(Math.max(raiseTo, raiseSpec.minCents), raiseSpec.maxCents)}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                className="flex-1"
              />
              <button onClick={() => setRaiseTo((v) => Math.min(raiseSpec.maxCents, v + table.bbCents))} className="p-1 rounded bg-zinc-800"><Plus className="w-4 h-4" /></button>
              <button
                disabled={busy}
                onClick={() => onAction(raiseSpec.type, raiseTo)}
                className="px-3 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold"
              >
                {raiseSpec.type === 'bet' ? t('pokerBet', lang) : t('pokerRaise', lang)} {formatChips(raiseTo)}
              </button>
            </div>
          )}
        </div>
      )}

      {you?.seated && you.holeCards && table.street !== 'idle' && (
        <div className="flex justify-center gap-2">
          {you.holeCards.map((c: string, i: number) => <PokerCard key={i} code={c} large animate />)}
        </div>
      )}

      {chatOpen && (
        <div className="rounded-xl bg-[#121217] border border-zinc-800 p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
          {(state.chat || []).slice(-20).map((m: any) => (
            <div key={m.id} className="text-[11px] text-zinc-300"><span className="text-rose-400">{m.name}</span> {m.text}</div>
          ))}
          <div className="flex gap-1 mt-1">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void sendChat(); }}
              className="flex-1 bg-zinc-900 rounded-lg px-2 py-1 text-sm text-white"
              maxLength={200}
            />
            <button onClick={() => void sendChat()} className="px-2 py-1 bg-rose-600 rounded-lg text-xs text-white">{t('pokerSend', lang)}</button>
          </div>
        </div>
      )}

      {histOpen && (
        <div className="rounded-xl bg-[#121217] border border-zinc-800 p-3 max-h-56 overflow-y-auto text-[11px] text-zinc-300">
          <div className="flex justify-between mb-2">
            <span className="font-bold text-white">{t('pokerHistory', lang)}</span>
            <button onClick={() => setHistOpen(false)}>✕</button>
          </div>
          {hist.map((h) => (
            <div key={h.id} className="border-t border-zinc-800 py-1">
              #{h.handNo} {(h.board || []).join(' ')} {h.you ? `net ${formatChips(h.you.netCents)}` : ''}
            </div>
          ))}
          {hist.length === 0 && <div className="text-zinc-500">—</div>}
        </div>
      )}

      {rebuyOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121217] rounded-2xl p-4 border border-zinc-800">
            <div className="text-white font-bold mb-2">{t('pokerRebuy', lang)}</div>
            <input type="range" min={table.bbCents} max={table.maxBuyinCents} value={rebuyAmt} onChange={(e) => setRebuyAmt(Number(e.target.value))} className="w-full" />
            <div className="text-center font-mono text-white my-2">{formatChips(rebuyAmt)}</div>
            <div className="flex gap-2">
              <button onClick={() => setRebuyOpen(false)} className="flex-1 py-2 bg-zinc-800 rounded-lg text-sm">{t('slotsCancel', lang)}</button>
              <button onClick={() => { onRebuy(rebuyAmt); setRebuyOpen(false); }} className="flex-1 py-2 bg-rose-600 rounded-lg text-sm text-white">{t('pokerRebuy', lang)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
