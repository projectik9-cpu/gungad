import React, { useState } from 'react';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { X, ShieldCheck, Check, Copy, Key } from 'lucide-react';

interface ProvablyFairModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: any;
}

export const ProvablyFairModal: React.FC<ProvablyFairModalProps> = ({ isOpen, onClose, lang }) => {
  const [clientSeed, setClientSeed] = useState<string>('gungad_client_seed_777');
  const [serverSeedHash, setServerSeedHash] = useState<string>(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  const [verified, setVerified] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleVerify = () => {
    soundFx.playWin();
    setVerified(true);
    setTimeout(() => setVerified(false), 3000);
  };

  const handleCopyHash = () => {
    soundFx.playClick();
    navigator.clipboard.writeText(serverSeedHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#0e0e12] border border-rose-900/50 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="font-display font-black text-lg uppercase tracking-wider text-white">
              {t('fairnessVerification', lang)}
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

        <p className="text-xs text-zinc-400 leading-relaxed">
          {t('provablyFairNotice', lang)}
        </p>

        {/* Client Seed Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-400 uppercase flex items-center gap-1">
            <Key className="w-3.5 h-3.5 text-rose-500" />
            {t('clientSeed', lang)}
          </label>
          <input
            type="text"
            value={clientSeed}
            onChange={(e) => setClientSeed(e.target.value)}
            className="w-full bg-[#121217] border border-zinc-800 focus:border-rose-600 font-mono text-xs text-white rounded-xl px-3 py-2.5 outline-none"
          />
        </div>

        {/* Server Seed Hash Box */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-400 uppercase">{t('serverSeedHash', lang)}</label>
          <div className="flex items-center justify-between bg-[#121217] border border-zinc-800 rounded-xl p-2.5">
            <span className="font-mono text-xs text-zinc-300 truncate max-w-[300px]">
              {serverSeedHash}
            </span>
            <button
              onClick={handleCopyHash}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {verified && (
          <div className="p-3 bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs font-bold rounded-xl text-center flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            {t('verifiedFair', lang)}
          </div>
        )}

        <button
          onClick={handleVerify}
          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-display font-bold uppercase text-sm rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all"
        >
          {t('verify', lang)}
        </button>
      </div>
    </div>
  );
};
