import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import {
  X,
  Volume2,
  VolumeX,
  Music,
  Music2,
  Settings,
  LifeBuoy,
  Gamepad2,
  ChevronRight,
  ChevronLeft,
  Menu,
  Users,
  Gift,
  Share2,
} from 'lucide-react';

const SUPPORT_URL = 'https://t.me/gungad_bot';
const BOT_USERNAME = 'gungad_bot';

interface SettingsMenuProps {
  lang: Language;
  playMode: 'real' | 'demo';
  onToggleDemo: () => void;
  /** Open in-app support modal (fallback: t.me link) */
  onOpenSupport?: () => void;
  /** Bottom-nav trigger style */
  navItem?: boolean;
  label?: string;
  telegramId?: number | null;
  welcomeBonusAvailable?: boolean;
  onOpenBonus?: () => void;
}

function openSupport() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(SUPPORT_URL);
      return;
    }
  } catch {
    /* ignore */
  }
  window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer');
}

function shareReferralLink(telegramId: number, lang: Language) {
  const link = `https://t.me/${BOT_USERNAME}?start=ref${telegramId}`;
  const text = t('referralShareText', lang);
  const shareUrl =
    `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
      return;
    }
  } catch {
    /* ignore */
  }
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

function NotifBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`absolute flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black leading-none ring-2 ring-[#0a0a0d] ${className}`}
    >
      1
    </span>
  );
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  lang,
  playMode,
  onToggleDemo,
  onOpenSupport,
  navItem = false,
  label,
  telegramId = null,
  welcomeBonusAvailable = false,
  onOpenBonus,
}) => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [panel, setPanel] = useState<'root' | 'settings' | 'referral'>('root');
  const [soundMuted, setSoundMuted] = useState(soundFx.getMuted());
  const [musicMuted, setMusicMuted] = useState(soundFx.getMusicMuted());
  const [volume, setVolume] = useState(soundFx.getVolume());
  const [musicVolume, setMusicVolume] = useState(soundFx.getMusicVolume());

  useEffect(() => {
    if (open) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }

    setEntered(false);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setPanel('root');
      document.body.style.overflow = '';
    }, 280);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const openDrawer = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.unlockAndStartMusic();
    soundFx.playClick();
    setOpen(true);
  };

  const closeDrawer = () => setOpen(false);

  const trigger = navItem ? (
    <button
      type="button"
      onClick={openDrawer}
      className={`relative flex w-full flex-col items-center justify-center gap-0.5 min-h-[52px] touch-manipulation select-none ${
        open ? 'text-rose-400' : 'text-zinc-400'
      }`}
      aria-label={t('menu', lang)}
    >
      <span className="relative inline-flex">
        <Menu className="w-5 h-5" />
        {welcomeBonusAvailable && <NotifBadge className="-top-2 -right-3" />}
      </span>
      <span className="text-[10px] font-semibold leading-none">{label ?? t('menu', lang)}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={openDrawer}
      className="relative flex items-center justify-center w-8 h-8 text-zinc-300 hover:text-white shrink-0 touch-manipulation"
      aria-label={t('menu', lang)}
      title={t('menu', lang)}
    >
      <Menu className="w-5 h-5" />
      {welcomeBonusAvailable && <NotifBadge className="-top-0.5 -right-0.5" />}
    </button>
  );

  const drawer =
    mounted &&
    createPortal(
      <div className="fixed inset-0 z-[500] flex" role="dialog" aria-modal="true">
        <button
          type="button"
          className={`absolute inset-0 border-0 cursor-default transition-opacity ease-out ${
            entered ? 'opacity-100 bg-black/60 backdrop-blur-sm' : 'opacity-0 bg-black/0'
          }`}
          style={{ transitionDuration: '280ms' }}
          aria-label="Close"
          onClick={closeDrawer}
        />

        <div
          className={`relative flex flex-col w-[80vw] max-w-xs h-full bg-[#0f0f14] border-r border-zinc-800 shadow-2xl overflow-y-auto will-change-transform transition-transform ease-out ${
            entered ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ transitionDuration: '280ms', transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800/60 shrink-0">
            <span className="text-sm font-bold text-white tracking-wide uppercase">
              {panel === 'settings'
                ? t('settings', lang)
                : panel === 'referral'
                  ? t('referralTitle', lang)
                  : 'GunGad'}
            </span>
            <button
              type="button"
              onClick={closeDrawer}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {panel === 'root' && (
            <nav className="flex flex-col gap-1 p-3">
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setPanel('settings');
                }}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70 active:bg-zinc-800 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-rose-500" />
                  {t('settings', lang)}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setPanel('referral');
                }}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70 active:bg-zinc-800 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-emerald-400" />
                  {t('referralTitle', lang)}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  if (onOpenBonus) onOpenBonus();
                  closeDrawer();
                }}
                className="relative flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70 active:bg-zinc-800 transition-colors"
              >
                <span className="relative inline-flex">
                  <Gift className="w-5 h-5 text-rose-400" />
                  {welcomeBonusAvailable && <NotifBadge className="-top-2 -right-2" />}
                </span>
                {t('bonusMenu', lang)}
                {welcomeBonusAvailable && (
                  <span className="ml-auto text-[10px] font-bold text-red-400 bg-red-950/50 px-2 py-0.5 rounded-full ring-1 ring-red-500/60">
                    1
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  if (onOpenSupport) {
                    onOpenSupport();
                  } else {
                    openSupport();
                  }
                  closeDrawer();
                }}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70 active:bg-zinc-800 transition-colors"
              >
                <LifeBuoy className="w-5 h-5 text-sky-400" />
                {t('support', lang)}
                <span className="ml-auto text-[10px] font-bold text-sky-500 bg-sky-900/40 px-2 py-0.5 rounded-full">
                  24/7
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  onToggleDemo();
                  closeDrawer();
                }}
                className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-semibold transition-colors ${
                  playMode === 'demo'
                    ? 'text-amber-300 bg-amber-950/40 hover:bg-amber-950/60'
                    : 'text-zinc-200 hover:bg-zinc-800/70 active:bg-zinc-800'
                }`}
              >
                <Gamepad2 className="w-5 h-5 text-amber-400" />
                {playMode === 'demo' ? t('exitDemoMode', lang) : t('demoMode', lang)}
                {playMode === 'demo' && (
                  <span className="ml-auto text-[10px] font-bold text-amber-500 bg-amber-900/40 px-2 py-0.5 rounded-full">
                    ON
                  </span>
                )}
              </button>
            </nav>
          )}

          {panel === 'referral' && (
            <div className="flex flex-col gap-4 p-4">
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setPanel('root');
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 self-start"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t('menu', lang)}
              </button>

              <div className="flex flex-col gap-3 bg-[#0a0a0d] border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-semibold text-zinc-200">{t('referralTitle', lang)}</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{t('referralDesc', lang)}</p>
                {telegramId ? (
                  <>
                    <p className="text-[10px] font-mono text-zinc-600 break-all">
                      {`https://t.me/${BOT_USERNAME}?start=ref${telegramId}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        shareReferralLink(telegramId, lang);
                      }}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold touch-manipulation"
                    >
                      <Share2 className="w-4 h-4" />
                      {t('referralShare', lang)}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-amber-400/90">{t('referralNeedTelegram', lang)}</p>
                )}
              </div>
            </div>
          )}

          {panel === 'settings' && (
            <div className="flex flex-col gap-4 p-4">
              <button
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setPanel('root');
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 self-start"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t('settings', lang)}
              </button>

              <div className="flex flex-col gap-3 bg-[#0a0a0d] border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    {soundMuted || volume <= 0 ? (
                      <VolumeX className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-rose-500" />
                    )}
                    {t('soundFx', lang)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = soundFx.toggleMute();
                      setSoundMuted(next);
                      soundFx.unlockAndStartMusic();
                      if (!next) soundFx.playClick();
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border ${
                      soundMuted
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                        : 'bg-rose-950/60 border-rose-700 text-rose-300'
                    }`}
                  >
                    {soundMuted ? t('off', lang) : t('on', lang)}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-zinc-500 uppercase">{t('soundVolume', lang)}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    disabled={soundMuted}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      soundFx.setVolume(v);
                      setVolume(v);
                      if (v > 0 && soundMuted) {
                        soundFx.setMuted(false);
                        setSoundMuted(false);
                      }
                      soundFx.unlockAndStartMusic();
                    }}
                    className="w-full accent-rose-600 disabled:opacity-40 h-1.5"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-[#0a0a0d] border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    {musicMuted || musicVolume <= 0 ? (
                      <Music2 className="w-4 h-4 text-zinc-500" />
                    ) : (
                      <Music className="w-4 h-4 text-rose-500" />
                    )}
                    {t('music', lang)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.unlockAndStartMusic();
                      const next = soundFx.toggleMusic();
                      setMusicMuted(next);
                      soundFx.playClick();
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase border ${
                      musicMuted
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                        : 'bg-rose-950/60 border-rose-700 text-rose-300'
                    }`}
                  >
                    {musicMuted ? t('off', lang) : t('on', lang)}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-zinc-500 uppercase">{t('musicVolume', lang)}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(musicVolume * 100)}
                    disabled={musicMuted}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      soundFx.setMusicVolume(v);
                      setMusicVolume(v);
                      if (v > 0 && musicMuted) {
                        soundFx.setMusicMuted(false);
                        setMusicMuted(false);
                      }
                      soundFx.unlockAndStartMusic();
                    }}
                    className="w-full accent-rose-600 disabled:opacity-40 h-1.5"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      {trigger}
      {drawer}
    </>
  );
};
