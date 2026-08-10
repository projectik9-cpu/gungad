import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { X, LifeBuoy, Loader2, Send } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

interface SupportTicket {
  id: string;
  message: string;
  status: string;
  reply_text: string | null;
  replied_at: string | null;
  created_at: string;
}

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  profileId?: string | null;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, lang, profileId = null }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  useEffect(() => {
    if (!isOpen || !profileId) return;
    let cancelled = false;
    setLoadingTickets(true);
    fetch(`${API_BASE}/api/support/tickets?profile_id=${encodeURIComponent(profileId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.ok && Array.isArray(json.tickets)) {
          setTickets(json.tickets);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTickets(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, profileId, sent]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (sending) return;
    const text = message.trim();
    if (text.length < 3) return;

    soundFx.playClick();
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/support/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, message: text }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || t('errorGeneric', lang));
        return;
      }
      setSent(true);
      setMessage('');
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    setSent(false);
    setError(null);
    onClose();
  };

  const replied = tickets.filter((t) => t.reply_text);

  return createPortal(
    <div
      className="fixed inset-0 z-[550] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full sm:max-w-md bg-[#0e0e12] border border-sky-900/50 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-zinc-100 overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-sky-400" />
            <h3 className="font-display font-black text-lg uppercase tracking-wider text-white">
              {t('supportTitle', lang)}
            </h3>
            <span className="text-[10px] font-bold text-sky-500 bg-sky-900/40 px-2 py-0.5 rounded-full">24/7</span>
          </div>
          <button
            onClick={close}
            className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto">
          {replied.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Ответы поддержки</p>
              {replied.slice(0, 5).map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-xl border border-emerald-900/50 bg-emerald-950/40 p-3 text-sm"
                >
                  <p className="text-zinc-400 text-xs mb-1.5 line-clamp-2">{ticket.message}</p>
                  <p className="text-emerald-300 font-medium whitespace-pre-wrap">{ticket.reply_text}</p>
                </div>
              ))}
            </div>
          )}

          {loadingTickets && replied.length === 0 && (
            <div className="flex justify-center py-2 text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}

          {sent ? (
            <div className="p-4 bg-emerald-950 border border-emerald-600 text-emerald-300 text-sm font-bold rounded-xl text-center">
              ✅ {t('supportSent', lang)}
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('supportPlaceholder', lang)}
                rows={5}
                maxLength={2000}
                className="w-full bg-[#121217] border border-zinc-800 focus:border-sky-600 text-white text-sm rounded-xl px-3 py-2.5 outline-none resize-none"
              />
              {error && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl text-center">
                  {error}
                </div>
              )}
              <button
                onClick={handleSend}
                disabled={sending || message.trim().length < 3}
                className="w-full py-3 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(2,132,199,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t('supportSend', lang)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
