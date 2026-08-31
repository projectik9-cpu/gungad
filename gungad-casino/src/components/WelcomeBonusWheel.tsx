import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { X, Sparkles } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

/** Clockwise from top (pointer). Visual slices only — odds are server-side. */
export const WELCOME_SLICES = [
  { cents: 100, label: '$1', color: '#e11d48', soft: '#9f1239' },
  { cents: 200, label: '$2', color: '#be123c', soft: '#881337' },
  { cents: 50, label: '$0.5', color: '#f43f5e', soft: '#9f1239' },
  { cents: 1000, label: '$10', color: '#fb7185', soft: '#be123c' },
  { cents: 10000, label: '$100', color: '#fecdd3', soft: '#e11d48' },
] as const;

const N = WELCOME_SLICES.length;
const SLICE_DEG = 360 / N;
const SPIN_MS = 5200;
const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 128;
const R_INNER = 42;
const LABEL_R = (R_INNER + R_OUTER) / 2; // true radial midpoint of the ring

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

/** Smooth decelerate — fewer mid-frame commits via direct DOM. */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

function rotationForSlice(index: number, currentRotation: number, spins = 6): number {
  const centerFromTop = index * SLICE_DEG + SLICE_DEG / 2;
  const targetMod = ((360 - centerFromTop) % 360 + 360) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360;
  // slight random offset inside slice so it doesn't always land dead-center
  const jitter = (Math.random() - 0.5) * (SLICE_DEG * 0.45);
  return currentRotation + spins * 360 + delta + jitter;
}

function polar(cx: number, cy: number, r: number, degFromTop: number) {
  const rad = ((degFromTop - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(i: number): string {
  const a0 = i * SLICE_DEG;
  const a1 = a0 + SLICE_DEG;
  const p0 = polar(CX, CY, R_OUTER, a0);
  const p1 = polar(CX, CY, R_OUTER, a1);
  const p2 = polar(CX, CY, R_INNER, a1);
  const p3 = polar(CX, CY, R_INNER, a0);
  const large = SLICE_DEG > 180 ? 1 : 0;
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${p3.x} ${p3.y}`,
    'Z',
  ].join(' ');
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
  const [resultCents, setResultCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const claimedRef = useRef(false);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const wheelRef = useRef<SVGGElement | null>(null);
  const coastingRef = useRef(false);
  const lastCoastTsRef = useRef(0);

  const setWheelRotation = (deg: number) => {
    rotationRef.current = deg;
    if (wheelRef.current) {
      wheelRef.current.style.transform = `rotate(${deg}deg)`;
    }
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      setResultCents(null);
      setError(null);
      setSpinning(false);
      claimedRef.current = false;
      coastingRef.current = false;
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    return () => {
      coastingRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const animateTo = (target: number, onDone: () => void, durationMs = SPIN_MS) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const from = rotationRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const value = from + (target - from) * easeOutQuint(t);
      setWheelRotation(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setWheelRotation(target);
        rafRef.current = null;
        onDone();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const startCoast = () => {
    coastingRef.current = true;
    lastCoastTsRef.current = 0;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const COAST_DPS = 540;

    const tick = (now: number) => {
      if (!coastingRef.current) return;
      if (!lastCoastTsRef.current) lastCoastTsRef.current = now;
      const dt = Math.min(0.05, (now - lastCoastTsRef.current) / 1000);
      lastCoastTsRef.current = now;
      setWheelRotation(rotationRef.current + COAST_DPS * dt);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const spin = async () => {
    if (spinning || claimedRef.current || !profileId) return;
    soundFx.playClick();
    setError(null);
    setSpinning(true);
    startCoast();

    const initData = getInitData();
    if (!initData) {
      coastingRef.current = false;
      animateTo(rotationRef.current + 120, () => setSpinning(false), 600);
      setError(t('bonusNeedTelegram', lang));
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
        coastingRef.current = false;
        animateTo(rotationRef.current + 160, () => setSpinning(false), 700);
        setError(t('bonusClaimFailed', lang));
        return;
      }

      if (data.already_claimed) {
        claimedRef.current = true;
        onClaimed(0, 0);
        coastingRef.current = false;
        animateTo(rotationRef.current + 160, () => setSpinning(false), 700);
        setError(t('bonusAlreadyClaimed', lang));
        return;
      }

      const amount = Number(data.amount_cents) || 0;
      const idx = WELCOME_SLICES.findIndex((s) => s.cents === amount);
      const sliceIndex = idx >= 0 ? idx : 0;
      coastingRef.current = false;
      const target = rotationForSlice(
        sliceIndex,
        rotationRef.current,
        5 + Math.floor(Math.random() * 3),
      );

      animateTo(target, () => {
        claimedRef.current = true;
        setResultCents(amount);
        setSpinning(false);
        soundFx.playWin();
        onClaimed(amount, data.balance_cents ?? 0);
      });
    } catch {
      coastingRef.current = false;
      animateTo(rotationRef.current + 160, () => setSpinning(false), 700);
      setError(t('bonusClaimFailed', lang));
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className={`absolute inset-0 border-0 cursor-default transition-opacity duration-300 ${
          entered ? 'opacity-100 bg-black/75 backdrop-blur-[6px]' : 'opacity-0'
        }`}
        aria-label="Close"
        onClick={() => {
          if (!spinning) onClose();
        }}
      />

      <div
        className={`relative w-full max-w-[340px] overflow-hidden rounded-3xl border border-rose-900/40 bg-gradient-to-b from-[#1a0c12] via-[#100e14] to-[#0a0a0e] p-5 shadow-[0_0_60px_rgba(225,29,72,0.18)] transition-all duration-300 ${
          entered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.97]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-rose-600/20 blur-3xl"
          aria-hidden
        />

        <div className="relative mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-rose-400" />
            <h2 className="font-display text-base font-black tracking-wide text-white">
              {t('bonusTitle', lang)}
            </h2>
          </div>
          <button
            type="button"
            disabled={spinning}
            onClick={onClose}
            className="rounded-lg bg-zinc-900/80 p-1.5 text-zinc-400 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-zinc-500">{t('bonusHint', lang)}</p>

        <div className="relative mx-auto mb-5" style={{ width: SIZE, height: SIZE }}>
          {/* Pointer */}
          <div className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-0.5">
            <div
              className="h-0 w-0 border-l-[11px] border-r-[11px] border-t-[20px] border-l-transparent border-r-transparent border-t-rose-400"
              style={{ filter: 'drop-shadow(0 2px 6px rgba(244,63,94,0.7))' }}
            />
          </div>

          {/* Outer ring glow */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(244,63,94,0.18) 0%, transparent 68%)',
            }}
          />

          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="relative z-10 block"
            style={{ filter: spinning ? 'none' : undefined }}
          >
            <defs>
              {WELCOME_SLICES.map((s, i) => (
                <linearGradient key={`g-${s.cents}`} id={`wb-g-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={s.color} />
                  <stop offset="100%" stopColor={s.soft} />
                </linearGradient>
              ))}
              <filter id="wb-soft" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.45" />
              </filter>
            </defs>

            {/* Static rim */}
            <circle cx={CX} cy={CY} r={R_OUTER + 6} fill="#1c1218" stroke="#3f1d2a" strokeWidth="3" />
            <circle cx={CX} cy={CY} r={R_OUTER + 1} fill="none" stroke="rgba(244,63,94,0.35)" strokeWidth="2" />

            {/* Rotating disc — DOM transform only, no React re-render per frame */}
            <g
              ref={wheelRef}
              style={{
                transformOrigin: `${CX}px ${CY}px`,
                transform: `rotate(${rotationRef.current}deg)`,
                willChange: spinning ? 'transform' : 'auto',
              }}
            >
              {WELCOME_SLICES.map((s, i) => (
                <path
                  key={s.cents}
                  d={slicePath(i)}
                  fill={`url(#wb-g-${i})`}
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="1"
                />
              ))}

              {/* Divider ticks */}
              {WELCOME_SLICES.map((_, i) => {
                const a = i * SLICE_DEG;
                const o = polar(CX, CY, R_OUTER - 1, a);
                const inn = polar(CX, CY, R_INNER + 1, a);
                return (
                  <line
                    key={`tick-${i}`}
                    x1={inn.x}
                    y1={inn.y}
                    x2={o.x}
                    y2={o.y}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* Labels: geometric center of each ring segment, text stays upright */}
              {WELCOME_SLICES.map((s, i) => {
                const mid = i * SLICE_DEG + SLICE_DEG / 2;
                const p = polar(CX, CY, LABEL_R, mid);
                return (
                  <g key={`label-${s.cents}`} transform={`translate(${p.x}, ${p.y}) rotate(${mid})`}>
                    {/* counter-rotate so number stays horizontal & centered */}
                    <text
                      transform={`rotate(${-mid})`}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={s.cents >= 10000 ? 15 : 16}
                      fontWeight="800"
                      letterSpacing="0.02em"
                      filter="url(#wb-soft)"
                      style={{ fontFamily: 'inherit' }}
                    >
                      {s.label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Hub */}
            <circle cx={CX} cy={CY} r={R_INNER - 2} fill="#0c0c10" stroke="#3f1d2a" strokeWidth="2" />
            <circle cx={CX} cy={CY} r={R_INNER - 10} fill="#141018" stroke="rgba(244,63,94,0.25)" strokeWidth="1" />
            <text
              x={CX}
              y={CY}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#71717a"
              fontSize="11"
              fontWeight="700"
              letterSpacing="0.16em"
            >
              GG
            </text>
          </svg>
        </div>

        {resultCents != null && (
          <p className="mb-3 text-center font-display text-xl font-black text-rose-300"
            style={{ textShadow: '0 0 24px rgba(244,63,94,0.45)' }}>
            {t('bonusYouWon', lang, {
              amount: (resultCents / 100).toFixed(resultCents % 100 === 0 ? 0 : 1),
            })}
          </p>
        )}
        {error && <p className="mb-3 text-center text-xs text-rose-400">{error}</p>}

        <button
          type="button"
          disabled={spinning || resultCents != null || !profileId}
          onClick={spin}
          className="w-full rounded-xl bg-gradient-to-r from-rose-700 to-rose-500 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-[0_0_24px_rgba(225,29,72,0.35)] transition hover:from-rose-600 hover:to-rose-400 disabled:opacity-40 disabled:shadow-none touch-manipulation"
        >
          {spinning ? t('bonusSpinning', lang) : resultCents != null ? t('bonusDone', lang) : t('bonusSpin', lang)}
        </button>
      </div>
    </div>,
    document.body,
  );
};
