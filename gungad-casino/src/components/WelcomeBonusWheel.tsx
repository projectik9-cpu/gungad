import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

/** Clockwise from top (pointer). Must match conic-gradient stops. */
export const WELCOME_SLICES = [
  { cents: 100, label: '$1', color: '#be123c' },
  { cents: 200, label: '$2', color: '#9f1239' },
  { cents: 50, label: '$0.5', color: '#881337' },
  { cents: 1000, label: '$10', color: '#4c0519' },
  { cents: 10000, label: '$100', color: '#f43f5e' },
] as const;

const SLICE_DEG = 360 / WELCOME_SLICES.length;

interface WelcomeBonusWheelProps {
  open: boolean;
  lang: Language;
  profileId: string | null;
  onClose: () => void;
  onClaimed: (amountCents: number, balanceCents: number) => void;
}

function getInitData(): string | null {
  try {
    const early = (window as any).__GG_INIT_DATA;
    if (early && String(early).length > 10) return String(early);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && String(tg.initData).length > 10) return String(tg.initData);
  } catch {
    /* ignore */
  }
  return null;
}

/** CSS rotate() is clockwise. Conic from -90deg puts stop 0° at top. */
function rotationForSlice(index: number, currentRotation: number, spins = 5): number {
  const centerFromTop = index * SLICE_DEG + SLICE_DEG / 2;
  // Rotate wheel so this center lands under the top pointer
  const targetMod = ((360 - centerFromTop) % 360 + 360) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360;
  return currentRotation + spins * 360 + delta;
}

export const WelcomeBonusWheel: React.FC<WelcomeBonusWheelProps> = ({
  open,
  lang,
  profileId,
  onClose,
  onClaimed,
}) => {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [resultCents, setResultCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const claimedRef = useRef(false);
  const rotationRef = useRef(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setResultCents(null);
      setError(null);
      setSpinning(false);
      claimedRef.current = false;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(timer);
  }, [open]);

  const conic = useMemo(() => {
    const parts = WELCOME_SLICES.map((s, i) => {
      const start = i * SLICE_DEG;
      const end = start + SLICE_DEG;
      return `${s.color} ${start}deg ${end}deg`;
    });
    // from -90deg → 0° stop is at 12 o'clock (pointer)
    return `conic-gradient(from -90deg, ${parts.join(', ')})`;
  }, []);

  const spin = async () => {
    if (spinning || claimedRef.current || !profileId) return;
    soundFx.playClick();
    setError(null);
    setSpinning(true);

    const initData = getInitData();
    if (!initData) {
      setError(t('bonusNeedTelegram', lang));
      setSpinning(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/bonus/welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, initData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(t('bonusClaimFailed', lang));
        setSpinning(false);
        return;
      }

      if (data.already_claimed) {
        claimedRef.current = true;
        onClaimed(0, data.balance_cents ?? 0);
        setError(t('bonusAlreadyClaimed', lang));
        setSpinning(false);
        return;
      }

      const amount = Number(data.amount_cents) || 0;
      const idx = WELCOME_SLICES.findIndex((s) => s.cents === amount);
      const sliceIndex = idx >= 0 ? idx : 0;
      const target = rotationForSlice(
        sliceIndex,
        rotationRef.current,
        5 + Math.floor(Math.random() * 2),
      );
      rotationRef.current = target;
      setRotation(target);

      window.setTimeout(() => {
        claimedRef.current = true;
        setResultCents(amount);
        setSpinning(false);
        soundFx.playWin();
        onClaimed(amount, data.balance_cents ?? 0);
      }, 4200);
    } catch {
      setError(t('bonusClaimFailed', lang));
      setSpinning(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className={`absolute inset-0 border-0 cursor-default transition-opacity ${
          entered ? 'opacity-100 bg-black/70 backdrop-blur-sm' : 'opacity-0'
        }`}
        style={{ transitionDuration: '280ms' }}
        aria-label="Close"
        onClick={() => {
          if (!spinning) onClose();
        }}
      />
      <div
        className={`relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#0f0f14] p-5 shadow-2xl transition-all ${
          entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ transitionDuration: '280ms' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white tracking-wide">{t('bonusTitle', lang)}</h2>
          <button
            type="button"
            disabled={spinning}
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-4">{t('bonusHint', lang)}</p>

        <div className="relative mx-auto w-64 h-64 mb-4">
          {/* Pointer — fixed at top */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-20 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-rose-400 drop-shadow" />

          {/* Spinning disc */}
          <div
            className="absolute inset-0 rounded-full border-4 border-zinc-700 shadow-inner overflow-hidden"
            style={{
              background: conic,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 4s cubic-bezier(0.12, 0.75, 0.08, 1)' : 'none',
            }}
          >
            {WELCOME_SLICES.map((s, i) => {
              // Angle from top, clockwise — matches conic stops (no -90 offset)
              const mid = i * SLICE_DEG + SLICE_DEG / 2;
              return (
                <span
                  key={s.cents}
                  className="absolute left-1/2 top-1/2 text-[12px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] whitespace-nowrap"
                  style={{
                    // No extra counter-rotate: when a slice lands at the pointer, its label is upright
                    transform: `rotate(${mid}deg) translate(0, -78px)`,
                  }}
                >
                  {s.label}
                </span>
              );
            })}
          </div>

          {/* Fixed hub — never upside-down */}
          <div className="pointer-events-none absolute inset-[38%] z-10 rounded-full bg-[#0f0f14] border border-zinc-700 flex items-center justify-center shadow-lg">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">GG</span>
          </div>
        </div>

        {resultCents != null && (
          <p className="text-center text-lg font-black text-rose-300 mb-3">
            {t('bonusYouWon', lang, { amount: (resultCents / 100).toFixed(resultCents % 100 === 0 ? 0 : 1) })}
          </p>
        )}
        {error && <p className="text-center text-xs text-rose-400 mb-3">{error}</p>}

        <button
          type="button"
          disabled={spinning || resultCents != null || !profileId}
          onClick={spin}
          className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-sm font-bold uppercase tracking-wide touch-manipulation"
        >
          {spinning ? t('bonusSpinning', lang) : resultCents != null ? t('bonusDone', lang) : t('bonusSpin', lang)}
        </button>
      </div>
    </div>,
    document.body,
  );
};
