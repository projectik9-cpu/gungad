import React, { useEffect, useRef, useState } from 'react';
import { Currency, UserProfile } from '../types';
import { t } from '../translations';
import { formatStars } from '../utils/currencies';
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
  Star,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

const CRYPTOBOT_ASSETS = ['USDT', 'TON', 'BTC', 'ETH', 'SOL'] as const;
type CryptoBotAsset = (typeof CRYPTOBOT_ASSETS)[number];
const TRC20_FALLBACK_ADDRESS = 'TLPse2NpkveCockTAwt9brFNdaz8EsxzyN';
const STAR_WITHDRAW_AMOUNTS = [25, 50, 75, 100, 500, 1000, 5000] as const;
const PAY_METHODS = [
  { id: 'stars', img: null, labelKey: 'payStars' },
  { id: 'cryptobot', img: '/pay/cryptobot.png', labelKey: 'payCryptoBot' },
  { id: 'tonkeeper', img: '/pay/tonkeeper.png', labelKey: 'payTonkeeper' },
  { id: 'trc20', img: '/assets/trc20.png', labelKey: 'payTrc20' },
] as const;

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
  onWalletRefresh?: () => Promise<void> | void;
  onStarsBalance?: (stars: number) => void;
}

interface TonInvoice {
  deposit_id: string;
  asset: 'TON' | 'USDT_TON';
  address: string;
  memo: string;
  ton_amount: number | null;
  token_amount: number | null;
  usd_amount: number;
  tonkeeper_url: string;
  tonkeeper_web_url: string;
}

function getInitData(): string | null {
  try {
    const early = (window as any).__GG_INIT_DATA;
    if (early && String(early).length > 10) return String(early);
    const value = (window as any).Telegram?.WebApp?.initData;
    return value && String(value).length > 10 ? String(value) : null;
  } catch {
    return null;
  }
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

function openStarsInvoice(url: string, onPaid: () => void) {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (typeof tg?.openInvoice === 'function') {
      tg.openInvoice(url, (status: string) => {
        if (status === 'paid') onPaid();
      });
      return;
    }
  } catch {
    /* fall through */
  }
  openTgLink(url);
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
  onWalletRefresh,
  onStarsBalance,
}) => {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [method, setMethod] = useState<'cryptobot' | 'tonkeeper' | 'stars' | 'trc20'>('cryptobot');

  // Deposit state
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [creating, setCreating] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [cryptoDepositId, setCryptoDepositId] = useState<string | null>(null);
  const [trc20Txid, setTrc20Txid] = useState('');
  const [trc20DepositId, setTrc20DepositId] = useState<string | null>(null);
  const [trc20Address, setTrc20Address] = useState(TRC20_FALLBACK_ADDRESS);
  const [tonAsset, setTonAsset] = useState<'TON' | 'USDT'>('TON');
  const [tonInvoice, setTonInvoice] = useState<TonInvoice | null>(null);
  const [depositDone, setDepositDone] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<CryptoBotAsset>('USDT');
  const [starsAmount, setStarsAmount] = useState<number>(25);
  const [starsInvoiceUrl, setStarsInvoiceUrl] = useState<string | null>(null);
  const [starsAwaitingCredit, setStarsAwaitingCredit] = useState(false);
  const starsBaselineRef = useRef<number>(0);

  // Withdraw state
  const [withdrawAsset, setWithdrawAsset] = useState<'TON' | 'USDT' | 'TRC20' | 'STARS'>('TON');
  const [withdrawStars, setWithdrawStars] = useState<number>(25);
  const [withdrawAddress, setWithdrawAddress] = useState<string>('');
  const [withdrawAmountUSD, setWithdrawAmountUSD] = useState<number>(10);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [pendingWds, setPendingWds] = useState<Array<{
    id: string;
    amount_usd_cents: number;
    asset: string;
    status: string;
  }>>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const loadPendingWds = async () => {
    if (!profileId) return;
    try {
      const res = await fetch(`${API_BASE}/api/withdraw/list?profile_id=${encodeURIComponent(profileId)}`);
      const json = await res.json();
      const rows = Array.isArray(json.withdrawals) ? json.withdrawals : [];
      setPendingWds(rows.filter((w: { status: string }) => w.status === 'pending'));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!isOpen || tab !== 'withdraw' || !profileId) return;
    void loadPendingWds();
  }, [isOpen, tab, profileId]);

  useEffect(() => {
    if (!isOpen || method !== 'trc20') return;
    fetch(`${API_BASE}/api/deposit/trc20/info`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.receiving_address) setTrc20Address(String(json.receiving_address));
      })
      .catch(() => { /* keep fallback */ });
  }, [isOpen, method]);

  // Poll deposit status (TON or Crypto Bot) while modal open
  useEffect(() => {
    const depositId = tonInvoice?.deposit_id || cryptoDepositId;
    const statusPath = tonInvoice
      ? `/api/deposit/ton/status?deposit_id=${depositId}`
      : cryptoDepositId
        ? `/api/deposit/cryptobot/status?deposit_id=${depositId}`
        : null;

    if (!isOpen || !statusPath || depositDone) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}${statusPath}`);
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

    poll();
    pollRef.current = window.setInterval(poll, 8_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [isOpen, tonInvoice, cryptoDepositId, depositDone, onUpdateBalance]);

  useEffect(() => {
    if (!isOpen || method !== 'stars' || !starsInvoiceUrl || depositDone || !profileId) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/wallet?profile_id=${encodeURIComponent(profileId)}`);
        const json = await res.json();
        const stars = json?.wallet?.stars_balance;
        if (typeof stars === 'number' && stars > starsBaselineRef.current) {
          setDepositDone(true);
          setStarsAwaitingCredit(false);
          onStarsBalance?.(stars);
          soundFx.playWin();
          await onWalletRefresh?.();
        }
      } catch {
        /* keep polling */
      }
    };

    void poll();
    const id = window.setInterval(() => { void poll(); }, starsAwaitingCredit ? 500 : 1200);
    return () => window.clearInterval(id);
  }, [isOpen, method, starsInvoiceUrl, depositDone, profileId, starsAwaitingCredit, onWalletRefresh, onStarsBalance]);

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
    setCryptoDepositId(null);
    setTrc20DepositId(null);
    setTrc20Txid('');
    setTonInvoice(null);
    setStarsInvoiceUrl(null);
    setDepositDone(false);
    setStarsAwaitingCredit(false);
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
      setCryptoDepositId(json.deposit_id);
      openTgLink(json.invoice_url);
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTrc20 = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isFinite(depositAmount) || depositAmount < 1 || !trc20Txid.trim()) {
      setError(t('minDepositNote', lang));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/deposit/trc20/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, initData: getInitData(), amount_usd: depositAmount, txid: trc20Txid.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setTrc20DepositId(json.deposit_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGeneric', lang));
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
        body: JSON.stringify({ profile_id: profileId, initData: getInitData(), amount_usd: depositAmount, asset: tonAsset }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setTonInvoice(json as TonInvoice);
      if (json.tonkeeper_web_url) openTgLink(json.tonkeeper_web_url);
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateStars = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isInteger(starsAmount) || starsAmount < 1 || starsAmount > 10000) {
      setError(t('minStarsNote', lang));
      return;
    }
    setCreating(true);
    try {
      starsBaselineRef.current = user.starsBalance ?? 0;
      const res = await fetch(`${API_BASE}/api/stars/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, stars_amount: starsAmount }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.invoice_url) throw new Error(json.error || 'fail');
      setStarsInvoiceUrl(json.invoice_url);
      openStarsInvoice(json.invoice_url, () => {
        setStarsAwaitingCredit(true);
        onStarsBalance?.(starsBaselineRef.current + starsAmount * 100);
      });
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

    if (withdrawAsset === 'STARS') {
      if (!STAR_WITHDRAW_AMOUNTS.includes(withdrawStars as typeof STAR_WITHDRAW_AMOUNTS[number])) {
        setWithdrawError(t('withdrawStarsMinNote', lang));
        return;
      }
      if (withdrawStars * 100 > (user.starsBalance ?? 0)) {
        setWithdrawError(t('insufficientFunds', lang));
        return;
      }
      setWithdrawSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/api/withdraw/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: profileId,
            asset: 'STARS',
            stars_amount: withdrawStars,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setWithdrawError(json.error || t('errorGeneric', lang));
          return;
        }
        soundFx.playWin();
        setWithdrawSuccess(true);
        if (typeof json.stars_balance === 'number') onStarsBalance?.(json.stars_balance);
        else onStarsBalance?.(Math.max(0, (user.starsBalance ?? 0) - withdrawStars * 100));
        await onWalletRefresh?.();
        await loadPendingWds();
        setTimeout(() => setWithdrawSuccess(false), 6000);
      } catch {
        setWithdrawError(t('errorGeneric', lang));
      } finally {
        setWithdrawSubmitting(false);
      }
      return;
    }

    if (!Number.isFinite(withdrawAmountUSD) || withdrawAmountUSD < 7) {
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
      await loadPendingWds();
      setTimeout(() => setWithdrawSuccess(false), 6000);
    } catch {
      setWithdrawError(t('errorGeneric', lang));
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const handleCancelWithdraw = async (id: string, amountCents: number, asset: string) => {
    if (!profileId || cancellingId) return;
    soundFx.playClick();
    setCancellingId(id);
    setWithdrawError(null);
    try {
      const res = await fetch(`${API_BASE}/api/withdraw/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, withdrawal_id: id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setWithdrawError(json.error || t('errorGeneric', lang));
        return;
      }
      setPendingWds((prev) => prev.filter((w) => w.id !== id));
      if (String(asset).toUpperCase() === 'STARS' || json.asset === 'STARS') {
        if (typeof json.stars_balance === 'number') onStarsBalance?.(json.stars_balance);
        else onStarsBalance?.((user.starsBalance ?? 0) + amountCents);
        await onWalletRefresh?.();
      } else {
        onUpdateBalance(user.balanceUSD + amountCents / 100);
      }
    } catch {
      setWithdrawError(t('errorGeneric', lang));
    } finally {
      setCancellingId(null);
    }
  };

  const inputCls =
    'w-full bg-[#121217] border border-zinc-800 focus:border-rose-600 text-white font-mono text-base font-bold rounded-xl px-3 py-2.5 outline-none';

  return (
    <div
      className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg bg-[#0e0e12] border border-rose-900/50 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col text-zinc-100 max-h-[min(85dvh,720px)] md:max-h-[min(90dvh,760px)] mb-[4.5rem] md:mb-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-5 h-5 text-rose-500 shrink-0" />
            <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-wider text-white truncate">
              {t('tacticalCashier', lang)}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
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
              {/* Payment method selector — circular emblems */}
              <div className="grid grid-cols-4 gap-2">
                {PAY_METHODS.map((item) => {
                  const active = method === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { soundFx.playClick(); setMethod(item.id); resetDepositFlow(); }}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <span
                        className={`relative h-14 w-14 rounded-full overflow-hidden border-2 transition-all ${
                          active
                            ? 'border-rose-500 shadow-[0_0_16px_rgba(225,29,72,0.45)] scale-105'
                            : 'border-zinc-700 group-hover:border-zinc-500'
                        }`}
                      >
                        {item.img ? (
                          <img
                            src={item.img}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-amber-500/20">
                            <Star className="h-7 w-7 text-amber-400 fill-amber-400" />
                          </span>
                        )}
                      </span>
                      <span className={`text-[10px] font-bold leading-tight text-center ${active ? 'text-white' : 'text-zinc-400'}`}>
                        {t(item.labelKey as any, lang)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Amount */}
              {method !== 'stars' && (
              <>
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

              {method === 'trc20' && (
                <div className="flex flex-col gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/60">
                  {trc20DepositId ? (
                    <div className="text-center text-sm font-bold text-emerald-300">{t('trc20Submitted', lang)}</div>
                  ) : (
                    <>
                      <div className="text-xs text-zinc-400">{t('trc20SendNote', lang)}</div>
                      <div className="flex items-center justify-between gap-2 bg-[#0a0a0d] border border-emerald-900/50 rounded-lg p-2.5">
                        <div className="font-mono text-[11px] break-all text-emerald-300">{trc20Address}</div>
                        <button
                          type="button"
                          onClick={() => copyText(trc20Address, 'trc20')}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-md flex items-center gap-1 shrink-0"
                        >
                          {copiedField === 'trc20' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <input value={trc20Txid} onChange={(e) => setTrc20Txid(e.target.value)} placeholder={t('trc20TxidPlaceholder', lang)} className={inputCls} />
                      <button onClick={handleCreateTrc20} disabled={!isReal || creating || !trc20Txid.trim()} className="w-full py-3 bg-emerald-600 text-white font-display font-bold uppercase text-sm rounded-xl disabled:opacity-50">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('trc20Submit', lang)}
                      </button>
                    </>
                  )}
                </div>
              )}

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

                  {depositDone ? (
                    <div className="p-4 bg-emerald-950 border border-emerald-600 text-emerald-300 text-sm font-bold rounded-xl text-center">
                      ✅ {t('depositCredited', lang)}
                    </div>
                  ) : invoiceUrl ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => { soundFx.playClick(); openTgLink(invoiceUrl); }}
                        className="w-full py-3 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(2,132,199,0.4)] transition-all flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('openInvoice', lang)}
                      </button>
                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waitingPayment', lang)}
                      </div>
                    </div>
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

              {method === 'tonkeeper' && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['TON', 'USDT'] as const).map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => { soundFx.playClick(); setTonAsset(asset); resetDepositFlow(); }}
                        className={`py-2 rounded-xl border text-xs font-mono font-bold ${tonAsset === asset ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
                      >
                        {asset === 'TON' ? t('tonAssetGram', lang) : t('tonAssetUsdt', lang)}
                      </button>
                    ))}
                  </div>
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
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{tonInvoice.asset === 'TON' ? t('tonSendExact', lang) : t('usdtTonSendExact', lang)}</span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-lg font-black text-cyan-300">
                          {tonInvoice.asset === 'TON' ? `${tonInvoice.ton_amount} TON` : `${tonInvoice.token_amount} USDT`}
                        </span>
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
              </>
              )}

              {method === 'stars' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase">{t('starsAmountLabel', lang)}</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      value={starsAmount}
                      onChange={(e) => { setStarsAmount(parseInt(e.target.value, 10) || 0); resetDepositFlow(); }}
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      {[50, 100, 250, 500, 1000].map((v) => (
                        <button
                          key={v}
                          onClick={() => { soundFx.playClick(); setStarsAmount(v); resetDepositFlow(); }}
                          className="flex-1 py-1.5 text-[11px] font-mono font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300"
                        >
                          ⭐{v}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-zinc-500">{t('minStarsNote', lang)}</span>
                    <span className="text-[10px] text-amber-300 font-mono">{formatStars((user.starsBalance ?? 0) / 100)}</span>
                  </div>

                  {depositDone ? (
                    <div className="p-4 bg-emerald-950 border border-emerald-600 text-emerald-300 text-sm font-bold rounded-xl text-center">
                      ✅ {t('starsCredited', lang)}
                    </div>
                  ) : starsInvoiceUrl ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          soundFx.playClick();
                          openStarsInvoice(starsInvoiceUrl, () => {
                            setStarsAwaitingCredit(true);
                            onStarsBalance?.(starsBaselineRef.current + starsAmount * 100);
                          });
                        }}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('openInvoice', lang)}
                      </button>
                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waitingPayment', lang)}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateStars}
                      disabled={!isReal || creating || starsAmount < 1}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 fill-current" />}
                      {creating ? t('creatingInvoice', lang) : t('payWithStars', lang)}
                    </button>
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
                <div className="grid grid-cols-4 gap-2">
                  {(['TON', 'USDT', 'TRC20', 'STARS'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => { soundFx.playClick(); setWithdrawAsset(a); }}
                      className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                        withdrawAsset === a
                          ? a === 'STARS'
                            ? 'bg-amber-950 border-amber-500 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                            : 'bg-rose-950 border-rose-600 text-rose-300 shadow-[0_0_10px_rgba(225,29,72,0.3)]'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {a === 'STARS' ? '⭐ Stars' : a}
                    </button>
                  ))}
                </div>
              </div>

              {withdrawAsset !== 'STARS' && (
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
              )}

              {withdrawAsset === 'STARS' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('starsAmountLabel', lang)}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[...STAR_WITHDRAW_AMOUNTS].map((v) => (
                        <button
                          key={v}
                          onClick={() => { soundFx.playClick(); setWithdrawStars(v); }}
                          className={`py-1.5 text-[11px] font-mono font-bold bg-zinc-900 hover:bg-zinc-800 border rounded-lg text-zinc-300 ${withdrawStars === v ? 'border-rose-600 text-rose-300' : 'border-zinc-800'}`}
                        >
                          ⭐{v}
                        </button>
                      ))}
                    </div>
                <span className="text-[10px] text-zinc-500">{t('withdrawStarsNote', lang)}</span>
                <span className="text-[10px] text-amber-300 font-mono">{formatStars((user.starsBalance ?? 0) / 100)}</span>
              </div>
              ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('amountUSD', lang)}</label>
                <input
                  type="number"
                  min={7}
                  value={withdrawAmountUSD}
                  onChange={(e) => setWithdrawAmountUSD(parseFloat(e.target.value) || 0)}
                  className={inputCls}
                />
                <span className="text-[10px] text-zinc-500">{t('withdrawMinNote', lang)}</span>
              </div>
              )}

              {pendingWds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">{t('pendingWithdrawals', lang)}</label>
                  {pendingWds.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-white">
                          {w.asset === 'STARS'
                            ? `⭐ ${(w.amount_usd_cents / 100).toFixed(2).replace(/\.00$/, '')}`
                            : `$${(w.amount_usd_cents / 100).toFixed(2)}`} · {w.asset}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">{w.id.slice(0, 8)}…</div>
                      </div>
                      <button
                        disabled={cancellingId === w.id}
                        onClick={() => void handleCancelWithdraw(w.id, w.amount_usd_cents, w.asset)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-rose-300 text-[11px] font-bold uppercase disabled:opacity-50"
                      >
                        {cancellingId === w.id ? '…' : t('cancelWithdraw', lang)}
                      </button>
                    </div>
                  ))}
                </div>
              )}

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
                disabled={
                  !isReal ||
                  withdrawSubmitting ||
                  (withdrawAsset === 'STARS'
                    ? withdrawStars < 1 || withdrawStars * 100 > (user.starsBalance ?? 0)
                    : withdrawAmountUSD < 7 || withdrawAmountUSD > user.balanceUSD || !withdrawAddress)
                }
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
