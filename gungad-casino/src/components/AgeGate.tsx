import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { RevolverLogo } from './RevolverLogo';
import {
  getLegalDoc,
  LegalDocId,
  saveLegalAcceptance,
} from '../legal/legalContent';
import { AlertTriangle, FileText, Shield, X } from 'lucide-react';

interface AgeGateProps {
  lang: Language;
  onAccepted: () => void;
}

export const AgeGate: React.FC<AgeGateProps> = ({ lang, onAccepted }) => {
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [doc, setDoc] = useState<LegalDocId | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const canEnter = ageOk && termsOk;
  const openDoc = (id: LegalDocId) => {
    soundFx.playClick();
    setDoc(id);
  };

  const handleEnter = () => {
    if (!canEnter) return;
    soundFx.playClick();
    saveLegalAcceptance();
    onAccepted();
  };

  const legal = doc ? getLegalDoc(doc, lang) : null;

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Blurred casino behind */}
      <div className="absolute inset-0 bg-[#050508]/70 backdrop-blur-xl" aria-hidden />

      <div
        className="relative w-full sm:max-w-md bg-[#0e0e12] border border-rose-900/50 rounded-t-2xl sm:rounded-2xl shadow-2xl text-zinc-100 overflow-hidden max-h-[min(92dvh,720px)] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
      >
        <div className="px-5 pt-5 pb-3 flex flex-col items-center gap-3 border-b border-zinc-800/80 shrink-0">
          <RevolverLogo size="md" />
          <div className="text-center">
            <h1 id="age-gate-title" className="font-display font-black text-xl sm:text-2xl uppercase tracking-wide text-white">
              {t('ageGateTitle', lang)}
            </h1>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed max-w-sm mx-auto">
              {t('ageGateSubtitle', lang)}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-3 flex gap-2.5 text-amber-200/95 text-[11px] leading-snug">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>{t('ageGateAddictionWarn', lang)}</span>
          </div>

          <label className="flex items-start gap-3 bg-[#121217] border border-zinc-800 rounded-xl p-3.5 cursor-pointer hover:border-zinc-700 transition-colors">
            <input
              type="checkbox"
              checked={ageOk}
              onChange={(e) => { soundFx.playClick(); setAgeOk(e.target.checked); }}
              className="mt-0.5 w-4 h-4 accent-rose-600 shrink-0"
            />
            <span className="text-sm text-zinc-200 leading-snug">{t('ageGateCheckAge', lang)}</span>
          </label>

          <label className="flex items-start gap-3 bg-[#121217] border border-zinc-800 rounded-xl p-3.5 cursor-pointer hover:border-zinc-700 transition-colors">
            <input
              type="checkbox"
              checked={termsOk}
              onChange={(e) => { soundFx.playClick(); setTermsOk(e.target.checked); }}
              className="mt-0.5 w-4 h-4 accent-rose-600 shrink-0"
            />
            <span className="text-sm text-zinc-200 leading-snug">{t('ageGateCheckTerms', lang)}</span>
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => openDoc('terms')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-rose-800/60 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-rose-500" />
                {t('ageGateReadTerms', lang)}
              </span>
              <span className="text-rose-400">{t('ageGateOpenDoc', lang)} →</span>
            </button>
            <button
              type="button"
              onClick={() => openDoc('privacy')}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white hover:border-rose-800/60 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-400" />
                {t('ageGateReadPrivacy', lang)}
              </span>
              <span className="text-sky-400">{t('ageGateOpenDoc', lang)} →</span>
            </button>
          </div>

          <p className="text-[10px] text-zinc-500 leading-relaxed text-center px-1">
            {t('ageGateTelegramNote', lang)}
          </p>

          <button
            type="button"
            disabled={!canEnter}
            onClick={handleEnter}
            className="w-full py-3.5 mt-1 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-display font-black uppercase tracking-wider text-sm rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.35)] transition-all"
          >
            {t('ageGateEnter', lang)}
          </button>
        </div>
      </div>

      {/* Full legal document overlay */}
      {legal && (
        <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full sm:max-w-2xl bg-[#0c0c10] border border-zinc-700 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[min(94dvh,900px)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <h2 className="font-display font-bold text-sm uppercase tracking-wide text-white pr-2">
                {legal.title}
              </h2>
              <button
                type="button"
                onClick={() => { soundFx.playClick(); setDoc(null); }}
                className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <pre className="whitespace-pre-wrap font-sans text-[11px] sm:text-xs leading-relaxed text-zinc-300">
                {legal.body}
              </pre>
            </div>
            <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => { soundFx.playClick(); setDoc(null); }}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase rounded-xl"
              >
                {t('ageGateCloseDoc', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};
