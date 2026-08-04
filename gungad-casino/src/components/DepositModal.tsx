import React, { useEffect, useRef, useState } from 'react';
import { Currency, UserProfile } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import {
  X,
  Copy,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Bot,
  Gem,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

const CRYPTOBOT_ASSETS = ['USDT', 'TON', 'BTC', 'ETH', 'SOL'] as const;
type CryptoBotAsset = (typeof CRYPTOBOT_ASSETS)[number];

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currency: Currency;
  lang: any;
  onRefillDemo: () => void;
  onUpdateBalance: (newBalance: number) => void;
  playMode?: 'real' | 'demo';
  profileId?: string | null;
}

interface TonInvoice {
  deposit_id: string;
  address: string;
  memo: string;
  ton_amount: number;
  usd_amount: number;
  tonkeeper_url: string;
  tonkeeper_web_url: string;
}

function openTgLink(url: string) {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink && url.startsWith('https://t.me')) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch {
    /* ignore */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  user,
  currency: _currency,
  lang,
  onRefillDemo,
  onUpdateBalance,
  playMode = 'real',
  profileId = null,
}) => {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [method, setMethod] = useState<'cryptobot' | 'tonkeeper'>('cryptobot');

  // Deposit state
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [creating, setCreating] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [tonInvoice, setTonInvoice] = useState<TonInvoice | null>(null);
  const [depositDone, setDepositDone] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<CryptoBotAsset>('USDT');

  // Withdraw state
  const [withdrawAsset, setWithdrawAsset] = useState<'TON' | 'USDT'>('TON');
  const [withdrawAddress, setWithdrawAddress] = useState<string>('');
  const [withdrawAmountUSD, setWithdrawAmountUSD] = useState<number>(10);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  // Poll TON deposit status while modal open
  useEffect(() => {
    if (!isOpen || !tonInvoice || depositDone) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/deposit/ton/status?deposit_id=${tonInvoice.deposit_id}`);
        const json = await res.json();
        if (json.ok && json.status === 'completed') {
          setDepositDone(true);
          if (typeof json.balance_cents === 'number') {
            onUpdateBalance(json.balance_cents / 100);
          }
          soundFx.playWin();
        }
      } catch {
        /* keep polling */
      }
    };

    pollRef.current = window.setInterval(poll, 10_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [isOpen, tonInvoice, depositDone, onUpdateBalance]);

  if (!isOpen) return null;

  const isReal = playMode === 'real' && Boolean(profileId);

  const copyText = (text: string, field: string) => {
    soundFx.playClick();
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resetDepositFlow = () => {
    setInvoiceUrl(null);
    setTonInvoice(null);
    setDepositDone(false);
    setError(null);
  };

  const handleCreateCryptoBot = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isFinite(depositAmount) || depositAmount < 1) {
      setError(t('minDepositNote', lang));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/deposit/cryptobot/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, amount_usd: depositAmount, asset: selectedCoin }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setInvoiceUrl(json.invoice_url);
      openTgLink(json.invoice_url);
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTon = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isFinite(depositAmount) || depositAmount < 1) {
      setError(t('minDepositNote', lang));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/deposit/ton/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, amount_usd: depositAmount }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setTonInvoice(json as TonInvoice);
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleWithdraw = async () => {
    if (!isReal || withdrawSubmitting) return;
    soundFx.playClick();
    setWithdrawError(null);
    if (!Number.isFinite(withdrawAmountUSD) || withdrawAmountUSD < 1) {
      setWithdrawError(t('withdrawMinNote', lang));
      return;
    }
    if (withdrawAmountUSD > user.balanceUSD) {
      setWithdrawError(t('insufficientFunds', lang));
      return;
    }
    if (!withdrawAddress || withdrawAddress.trim().length < 10) {
      setWithdrawError(t('enterDestination', lang));
      return;
    }
    setWithdrawSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/withdraw/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          amount_usd: withdrawAmountUSD,
          asset: withdrawAsset,
          address: withdrawAddress.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setWithdrawError(json.error || t('errorGeneric', lang));
        return;
      }
      soundFx.playWin();
      setWithdrawSuccess(true);
      onUpdateBalance(Math.max(0, user.balanceUSD - withdrawAmountUSD));
      setWithdrawAddress('');
      setTimeout(() => setWithdrawSuccess(false), 6000);
    } catch {
      setWithdrawError(t('errorGeneric', lang));
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-[#121217] border border-zinc-800 focus:border-rose-600 text-white font-mono text-base font-bold rounded-xl px-3 py-2.5 outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-lg bg-[#0e0e12] border border-rose-900/50 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-zinc-100 max-h-[min(92dvh,860px)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-500" />
            <h3 className="font-display font-black text-lg uppercase tracking-wider text-white">
              {t('tacticalCashier', lang)}
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-[#14141a] p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => { soundFx.playClick(); setTab('deposit'); }}
              className={`py-2 text-xs font-display font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                tab === 'deposit'
                  ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.5)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              {t('depositCrypto', lang)}
            </button>
            <button
              onClick={() => { soundFx.playClick(); setTab('withdraw'); }}
              className={`py-2 text-xs font-display font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                tab === 'withdraw'
                  ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.5)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              {t('withdrawCrypto', lang)}
            </button>
          </div>

          {/* Demo refill */}
          {playMode === 'demo' && (
            <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-300 block">{t('demoBalance', lang)}</span>
                <span className="text-xs text-zinc-400">{t('refillDemoSub', lang)}</span>
              </div>
              <button
                onClick={() => { soundFx.playClick(); onRefillDemo(); }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-all active:scale-95 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('refillDemoBtn', lang)}
              </button>
            </div>
          )}

          {/* Real-mode required notice */}
          {!isReal && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('realModeOnly', lang)}
            </div>
          )}

          {tab === 'deposit' ? (
            <div className="flex flex-col gap-4">
              {/* Payment method selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { soundFx.playClick(); setMethod('cryptobot'); resetDepositFlow(); }}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                    method === 'cryptobot'
                      ? 'bg-rose-950/50 border-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.25)]'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <Bot className="w-4 h-4 text-sky-400" />
                    {t('payCryptoBot', lang)}
                  </span>
                  <span className="text-[10px] text-zinc-400 leading-tight">{t('payCryptoBotSub', lang)}</span>
                </button>
                <button
                  onClick={() => { soundFx.playClick(); setMethod('tonkeeper'); resetDepositFlow(); }}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                    method === 'tonkeeper'
                      ? 'bg-rose-950/50 border-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.25)]'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <Gem className="w-4 h-4 text-cyan-400" />
                    {t('payTonkeeper', lang)}
                  </span>
                  <span className="text-[10px] text-zinc-400 leading-tight">{t('payTonkeeperSub', lang)}</span>
                </button>
              </div>

              {/* Amount */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('depositAmountLabel', lang)}</label>
                <input
                  type="number"
                  min={1}
                  value={depositAmount}
                  onChange={(e) => { setDepositAmount(parseFloat(e.target.value) || 0); resetDepositFlow(); }}
                  className={inputCls}
                />
                <div className="flex gap-2">
                  {[5, 10, 25, 50, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => { soundFx.playClick(); setDepositAmount(v); resetDepositFlow(); }}
                      className="flex-1 py-1.5 text-[11px] font-mono font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300"
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500">{t('minDepositNote', lang)}</span>
              </div>

              {/* Crypto Bot flow */}
              {method === 'cryptobot' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase">{t('selectCryptoAsset', lang)}</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CRYPTOBOT_ASSETS.map((coin) => (
                        <button
                          key={coin}
                          onClick={() => { soundFx.playClick(); setSelectedCoin(coin); resetDepositFlow(); }}
                          className={`py-2 rounded-xl border text-[11px] font-mono font-bold transition-all ${
                            selectedCoin === coin
                              ? 'bg-rose-950 border-rose-600 text-rose-300 shadow-[0_0_10px_rgba(225,29,72,0.3)]'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {coin}
                        </button>
                      ))}
                    </div>
                  </div>

                  {invoiceUrl ? (
                    <button
                      onClick={() => { soundFx.playClick(); openTgLink(invoiceUrl); }}
                      className="w-full py-3 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(2,132,199,0.4)] transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t('openInvoice', lang)}
                    </button>
                  ) : (
                    <button
                      onClick={handleCreateCryptoBot}
                      disabled={!isReal || creating || depositAmount < 1}
                      className="w-full py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(225,29,72,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                      {creating ? t('creatingInvoice', lang) : t('createInvoice', lang)}
                    </button>
                  )}
                </div>
              )}

              {/* Tonkeeper flow */}
              {method === 'tonkeeper' && (
                <div className="flex flex-col gap-3">
                  {!tonInvoice ? (
                    <button
                      onClick={handleCreateTon}
                      disabled={!isReal || creating || depositAmount < 1}
                      className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gem className="w-4 h-4" />}
                      {creating ? t('creatingInvoice', lang) : t('createInvoice', lang)}
                    </button>
                  ) : depositDone ? (
                    <div className="p-4 bg-emerald-950 border border-emerald-600 text-emerald-300 text-sm font-bold rounded-xl text-center">
                      ✅ {t('depositCredited', lang)}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* TON amount */}
                      <div className="bg-[#121217] border border-zinc-800 rounded-xl p-3.5 flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{t('tonSendExact', lang)}</span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-lg font-black text-cyan-300">{tonInvoice.ton_amount} TON</span>
                          <span className="text-xs text-zinc-500 font-mono">≈ ${tonInvoice.usd_amount}</span>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="bg-[#121217] border border-zinc-800 rounded-xl p-3.5 flex flex-col gap-1.5">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{t('depositAddress', lang)}</span>
                        <div className="flex items-center justify-between gap-2 bg-[#0a0a0d] border border-zinc-800 rounded-lg p-2.5">
                          <span className="font-mono text-[11px] text-zinc-300 break-all">{tonInvoice.address}</span>
                          <button
                            onClick={() => copyText(tonInvoice.address, 'addr')}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-md flex items-center gap-1 shrink-0"
                          >
                            {copiedField === 'addr' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Memo */}
                      <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-3.5 flex flex-col gap-1.5">
                        <span className="text-[10px] text-amber-400 font-bold uppercase">{t('memoLabel', lang)}</span>
                        <div className="flex items-center justify-between gap-2 bg-[#0a0a0d] border border-amber-900/50 rounded-lg p-2.5">
                          <span className="font-mono text-sm font-black text-amber-300">{tonInvoice.memo}</span>
                          <button
                            onClick={() => copyText(tonInvoice.memo, 'memo')}
                            className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-md flex items-center gap-1 shrink-0"
                          >
                            {copiedField === 'memo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-amber-500/90 leading-tight">⚠️ {t('memoWarning', lang)}</span>
                      </div>

                      <button
                        onClick={() => { soundFx.playClick(); openTgLink(tonInvoice.tonkeeper_web_url); }}
                        className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(8,145,178,0.4)] transition-all flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('openTonkeeper', lang)}
                      </button>

                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waitingPayment', lang)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl text-center">
                  {error}
                </div>
              )}
            </div>
          ) : (
            /* Withdraw Tab */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('withdrawAsset', lang)}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['TON', 'USDT'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => { soundFx.playClick(); setWithdrawAsset(a); }}
                      className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                        withdrawAsset === a
                          ? 'bg-rose-950 border-rose-600 text-rose-300 shadow-[0_0_10px_rgba(225,29,72,0.3)]'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('cryptoAddress', lang)}</label>
                <input
                  type="text"
                  placeholder={t('enterDestination', lang)}
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  className="w-full bg-[#121217] border border-zinc-800 focus:border-rose-600 text-white font-mono text-xs rounded-xl px-3 py-2.5 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('amountUSD', lang)}</label>
                <input
                  type="number"
                  min={1}
                  value={withdrawAmountUSD}
                  onChange={(e) => setWithdrawAmountUSD(parseFloat(e.target.value) || 0)}
                  className={inputCls}
                />
                <span className="text-[10px] text-zinc-500">{t('withdrawMinNote', lang)}</span>
              </div>

              {withdrawSuccess && (
                <div className="p-3 bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs font-bold rounded-xl text-center">
                  ✅ {t('withdrawRequested', lang)}
                </div>
              )}
              {withdrawError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl text-center">
                  {withdrawError}
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={!isReal || withdrawSubmitting || withdrawAmountUSD < 1 || withdrawAmountUSD > user.balanceUSD || !withdrawAddress}
                className="w-full py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(225,29,72,0.5)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {withdrawSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('requestWithdraw', lang)}
              </button>

              <span className="text-[10px] text-zinc-500 text-center leading-tight">
                {t('withdrawPendingNote', lang)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
