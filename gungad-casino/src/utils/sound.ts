class SoundController {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private musicMuted: boolean = false;
  private volume: number = 0.7;
  private musicVolume: number = 0.35;
  private clickAudio: HTMLAudioElement | null = null;
  private musicAudio: HTMLAudioElement | null = null;
  private musicStarted: boolean = false;

  constructor() {
    this.isMuted = localStorage.getItem('gungad_sound_muted') === 'true';
    this.musicMuted = localStorage.getItem('gungad_music_muted') === 'true';
    const savedVol = parseFloat(localStorage.getItem('gungad_sound_volume') || '');
    const savedMusicVol = parseFloat(localStorage.getItem('gungad_music_volume') || '');
    if (!Number.isNaN(savedVol)) this.volume = Math.min(1, Math.max(0, savedVol));
    if (!Number.isNaN(savedMusicVol)) this.musicVolume = Math.min(1, Math.max(0, savedMusicVol));
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private fxGain(): number {
    return this.isMuted ? 0 : this.volume;
  }

  private getClickAudio(): HTMLAudioElement {
    if (!this.clickAudio) {
      this.clickAudio = new Audio('/click.mp3');
      this.clickAudio.preload = 'auto';
    }
    this.clickAudio.volume = Math.min(1, this.fxGain() * 0.8);
    return this.clickAudio;
  }

  private getMusicAudio(): HTMLAudioElement {
    if (!this.musicAudio) {
      this.musicAudio = new Audio('/bg-music.mp3');
      this.musicAudio.loop = true;
      this.musicAudio.preload = 'auto';
    }
    this.musicAudio.volume = this.musicMuted ? 0 : this.musicVolume;
    return this.musicAudio;
  }

  /** Call once after first user gesture to unlock autoplay */
  public unlockAndStartMusic() {
    if (this.musicStarted && !this.musicMuted) {
      const m = this.getMusicAudio();
      if (m.paused) void m.play().catch(() => {});
      return;
    }
    this.musicStarted = true;
    if (this.musicMuted) return;
    const m = this.getMusicAudio();
    void m.play().catch(() => {});
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('gungad_sound_muted', String(this.isMuted));
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('gungad_sound_muted', String(this.isMuted));
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    localStorage.setItem('gungad_music_muted', String(this.musicMuted));
    const m = this.getMusicAudio();
    if (this.musicMuted) {
      m.pause();
    } else {
      this.musicStarted = true;
      m.volume = this.musicVolume;
      void m.play().catch(() => {});
    }
    return this.musicMuted;
  }

  public setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    localStorage.setItem('gungad_music_muted', String(this.musicMuted));
    const m = this.getMusicAudio();
    if (muted) m.pause();
    else {
      m.volume = this.musicVolume;
      void m.play().catch(() => {});
    }
  }

  public getMusicMuted(): boolean {
    return this.musicMuted;
  }

  public setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem('gungad_sound_volume', String(this.volume));
    if (this.clickAudio) this.clickAudio.volume = Math.min(1, this.fxGain() * 0.8);
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMusicVolume(v: number) {
    this.musicVolume = Math.min(1, Math.max(0, v));
    localStorage.setItem('gungad_music_volume', String(this.musicVolume));
    if (this.musicAudio) {
      this.musicAudio.volume = this.musicMuted ? 0 : this.musicVolume;
    }
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public playClick() {
    if (this.isMuted || this.volume <= 0) return;
    try {
      const audio = this.getClickAudio();
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // ignore
    }
  }

  public playChip() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const g = 0.2 * this.volume;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2400, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(g, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  public playWin() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.12 * this.volume, this.ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + idx * 0.08);
      osc.stop(this.ctx.currentTime + idx * 0.08 + 0.25);
    });
  }

  public playBigWin() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51, 1760];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.06);
      gain.gain.setValueAtTime(0.15 * this.volume, this.ctx.currentTime + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.06 + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + idx * 0.06);
      osc.stop(this.ctx.currentTime + idx * 0.06 + 0.4);
    });
  }

  public playLoss() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.2 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  public playSpinTick() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900 + Math.random() * 200, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.08 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  public playCard() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.12 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.07);
  }

  public playExplosion() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    whiteNoise.start();
  }

  public playGem() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1600, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }
}

export const soundFx = new SoundController();
