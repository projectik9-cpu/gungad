import React, { useState } from 'react';
import { Currency, UserProfile } from '../types';
import { t } from '../translations';
import { formatCurrency } from '../utils/currencies';
import { soundFx } from '../utils/sound';
import { X, Copy, Check, QrCode, ArrowDownRight, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currency: Currency;
  lang: any;
  onRefillDemo: () => void;
  onUpdateBalance: (newBalance: number) => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  user,
  currency,
  lang,
  onRefillDemo,
  onUpdateBalance,
}) => {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [selectedCoin, setSelectedCoin] = useState<'USDT' | 'BTC' | 'ETH' | 'SOL'>('USDT');
  const [copied, setCopied] = useState<boolean>(false);
  const [withdrawAddress, setWithdrawAddress] = useState<string>('');
  const [withdrawAmountUSD, setWithdrawAmountUSD] = useState<number>(50);
  const [withdrawSuccess, setWithdrawSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const cryptoAddresses = {
    USDT: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    BTC: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    ETH: '0x388C818CA8B9251b393131C08a736A67ccB19297',
    SOL: '7v9232b489f6608933b93f9c6d5b0007823901a89c',
  };

  const handleCopy = () => {
    soundFx.playClick();
    navigator.clipboard.writeText(cryptoAddresses[selectedCoin]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdraw = () => {
    if (withdrawAmountUSD <= 0 || withdrawAmountUSD > user.balanceUSD || !withdrawAddress) return;
    soundFx.playWin();
    onUpdateBalance(user.balanceUSD - withdrawAmountUSD);
    setWithdrawSuccess(true);
    setTimeout(() => setWithdrawSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0e0e12] border border-rose-900/50 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 text-zinc-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
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

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 bg-[#14141a] p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => {
              soundFx.playClick();
              setTab('deposit');
            }}
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
            onClick={() => {
              soundFx.playClick();
              setTab('withdraw');
            }}
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

        {/* Deposit Tab Content */}
        {tab === 'deposit' ? (
          <div className="flex flex-col gap-4">
            {/* Quick Demo Refill Button */}
            <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-300 block">{t('demoBalance', lang)}</span>
                <span className="text-xs text-zinc-400">{t('refillDemoSub', lang)}</span>
              </div>
              <button
                onClick={() => {
                  soundFx.playClick();
                  onRefillDemo();
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-all active:scale-95 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('refillDemoBtn', lang)}
              </button>
            </div>

            {/* Crypto Coin Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-zinc-400 uppercase">{t('selectCryptoAsset', lang)}</label>
              <div className="grid grid-cols-4 gap-2">
                {(['USDT', 'BTC', 'ETH', 'SOL'] as const).map((coin) => (
                  <button
                    key={coin}
                    onClick={() => {
                      soundFx.playClick();
                      setSelectedCoin(coin);
                    }}
                    className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
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

            {/* Wallet Address Box */}
            <div className="bg-[#121217] border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
              <span className="text-xs text-zinc-400 font-bold uppercase">{selectedCoin} {t('depositAddress', lang)}</span>
              <div className="flex items-center justify-between bg-[#0a0a0d] border border-zinc-800 rounded-lg p-2.5">
                <span className="font-mono text-xs text-zinc-300 truncate max-w-[280px]">
                  {cryptoAddresses[selectedCoin]}
                </span>
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-md flex items-center gap-1 transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t('copied', lang) : t('copy', lang)}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Withdraw Tab Content */
          <div className="flex flex-col gap-4">
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
                value={withdrawAmountUSD}
                onChange={(e) => setWithdrawAmountUSD(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#121217] border border-zinc-800 focus:border-rose-600 text-white font-mono text-base font-bold rounded-xl px-3 py-2.5 outline-none"
              />
            </div>

            {withdrawSuccess && (
              <div className="p-3 bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs font-bold rounded-xl text-center">
                {t('withdrawSuccess', lang)}
              </div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={withdrawAmountUSD > user.balanceUSD || !withdrawAddress}
              className="w-full py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(225,29,72,0.5)] transition-all disabled:opacity-50"
            >
              {t('withdrawCrypto', lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
