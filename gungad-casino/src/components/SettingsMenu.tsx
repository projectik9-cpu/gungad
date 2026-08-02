import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { Menu, Volume2, VolumeX, Music, Music2 } from 'lucide-react';

interface SettingsMenuProps {
  lang: Language;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ lang }) => {
  const [open, setOpen] = useState(false);
  const [soundMuted, setSoundMuted] = useState(soundFx.getMuted());
  const [musicMuted, setMusicMuted] = useState(soundFx.getMusicMuted());
  const [volume, setVolume] = useState(soundFx.getVolume());
  const [musicVolume, setMusicVolume] = useState(soundFx.getMusicVolume());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          soundFx.unlockAndStartMusic();
          soundFx.playClick();
          setOpen((v) => !v);
        }}
        className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 bg-[#121217] border border-zinc-800 text-zinc-300 hover:text-white rounded-lg sm:rounded-xl shrink-0"
        aria-label={t('settings', lang)}
        title={t('settings', lang)}
      >
        <Menu className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[#111116] border border-zinc-800 rounded-2xl shadow-2xl p-3 z-[300] flex flex-col gap-3">
          <div className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            {t('settings', lang)}
          </div>

          {/* Sound FX */}
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

          {/* Music */}
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
};
