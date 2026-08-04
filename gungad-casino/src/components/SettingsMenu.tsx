import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import {
  Menu,
  Volume2,
  VolumeX,
  Music,
  Music2,
  Settings,
  LifeBuoy,
  Gamepad2,
  ChevronLeft,
} from 'lucide-react';

const SUPPORT_URL = 'https://t.me/gungad_bot';

interface SettingsMenuProps {
  lang: Language;
  playMode: 'real' | 'demo';
  onToggleDemo: () => void;
  /** Dropdown opens upward (for bottom nav) */
  dropUp?: boolean;
  /** Bottom-nav style: icon + label column */
  navItem?: boolean;
  label?: string;
}

function openSupport() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(SUPPORT_URL);
      return;
    }
  } catch {
    // fall through
  }
  window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer');
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  lang,
  playMode,
  onToggleDemo,
  dropUp = false,
  navItem = false,
  label,
}) => {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'root' | 'settings'>('root');
  const [soundMuted, setSoundMuted] = useState(soundFx.getMuted());
  const [musicMuted, setMusicMuted] = useState(soundFx.getMusicMuted());
  const [volume, setVolume] = useState(soundFx.getVolume());
  const [musicVolume, setMusicVolume] = useState(soundFx.getMusicVolume());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel('root');
      }
    };
    // click (not mousedown) — avoids race that eats the toggle click
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const close = () => {
    setOpen(false);
    setPanel('root');
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.unlockAndStartMusic();
    soundFx.playClick();
    setOpen((v) => {
      if (v) setPanel('root');
      return !v;
    });
  };

  const menuPanel = open && (
    <div
      className={`absolute ${navItem ? 'left-1/2 -translate-x-1/2' : 'left-0'} w-64 bg-[#111116] border border-zinc-800 rounded-2xl shadow-2xl p-2 z-[300] flex flex-col gap-1 ${
        dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {panel === 'root' && (
        <>
          <button
            onClick={() => {
              soundFx.playClick();
              setPanel('settings');
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70"
          >
            <Settings className="w-4 h-4 text-rose-500" />
            {t('settings', lang)}
          </button>
          <button
            onClick={() => {
              soundFx.playClick();
              openSupport();
              close();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70"
          >
            <LifeBuoy className="w-4 h-4 text-sky-400" />
            {t('support', lang)}
          </button>
          <button
            onClick={() => {
              soundFx.playClick();
              onToggleDemo();
              close();
            }}
            className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-800/70 ${
              playMode === 'demo' ? 'text-amber-300' : 'text-zinc-200'
            }`}
          >
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            {playMode === 'demo' ? t('exitDemoMode', lang) : t('demoMode', lang)}
          </button>
        </>
      )}

      {panel === 'settings' && (
        <div className="flex flex-col gap-3 p-1">
          <button
            onClick={() => {
              soundFx.playClick();
              setPanel('root');
            }}
            className="flex items-center gap-1.5 px-1 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-300"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {t('settings', lang)}
          </button>

          <div className="flex flex-col gap-2 bg-[#0a0a0d] border border-zinc-800 rounded-xl p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                {soundMuted || volume <= 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-rose-500" />
                )}
                {t('soundFx', lang)}
              </span>
              <button
                onClick={() => {
                  const next = soundFx.toggleMute();
                  setSoundMuted(next);
                  soundFx.unlockAndStartMusic();
                  if (!next) soundFx.playClick();
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                  soundMuted
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                    : 'bg-rose-950/60 border-rose-700 text-rose-300'
                }`}
              >
                {soundMuted ? t('off', lang) : t('on', lang)}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('soundVolume', lang)}</span>
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
                className="w-full accent-rose-600 disabled:opacity-40"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 bg-[#0a0a0d] border border-zinc-800 rounded-xl p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                {musicMuted || musicVolume <= 0 ? (
                  <Music2 className="w-3.5 h-3.5 text-zinc-500" />
                ) : (
                  <Music className="w-3.5 h-3.5 text-rose-500" />
                )}
                {t('music', lang)}
              </span>
              <button
                onClick={() => {
                  soundFx.unlockAndStartMusic();
                  const next = soundFx.toggleMusic();
                  setMusicMuted(next);
                  soundFx.playClick();
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                  musicMuted
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                    : 'bg-rose-950/60 border-rose-700 text-rose-300'
                }`}
              >
                {musicMuted ? t('off', lang) : t('on', lang)}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{t('musicVolume', lang)}</span>
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
                className="w-full accent-rose-600 disabled:opacity-40"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={navItem ? 'relative w-full' : 'relative'} ref={ref}>
      {navItem ? (
        <button
          type="button"
          onClick={toggle}
          className={`flex w-full flex-col items-center justify-center gap-0.5 min-h-[52px] touch-manipulation select-none ${
            open ? 'text-rose-400' : 'text-zinc-400'
          }`}
          aria-label={t('menu', lang)}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-semibold leading-none">
            {label ?? t('menu', lang)}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center justify-center w-8 h-8 bg-transparent text-zinc-300 hover:text-white shrink-0 touch-manipulation"
          aria-label={t('menu', lang)}
          title={t('menu', lang)}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      {menuPanel}
    </div>
  );
};
