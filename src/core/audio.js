import { AUDIO, SFX, TRACKS } from '../data/audio.js';
import { DEFAULT_SETTINGS } from '../data/save.js';

export class AudioManager {
  constructor() {
    this.context = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.scene = 'menu';
    this.timer = null;
    this.step = 0;
    this.nextNote = 0;
    this.musicVoices = new Set();
    this.sfxVoices = new Set();
  }

  async unlock() {
    if (!this.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is unavailable');
      this.context = new Context();
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.musicGain.connect(this.context.destination);
      this.sfxGain.connect(this.context.destination);
      this.applyVolumes();
    }
    await this.context.resume();
    this.startMusic();
  }

  applyVolumes() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.musicGain.gain.setValueAtTime(
      this.settings.musicEnabled ? AUDIO.musicGain * this.settings.musicVolume / AUDIO.volumeMaximum : 0, now);
    this.sfxGain.gain.setValueAtTime(
      this.settings.sfxEnabled ? AUDIO.sfxGain * this.settings.sfxVolume / AUDIO.volumeMaximum : 0, now);
  }

  setSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    for (const key of ['musicEnabled', 'sfxEnabled'])
      if (typeof settings[key] === 'boolean') this.settings[key] = settings[key];
    for (const key of ['musicVolume', 'sfxVolume'])
      if (Number.isFinite(settings[key]))
        this.settings[key] = Math.max(0, Math.min(AUDIO.volumeMaximum, settings[key]));
    this.applyVolumes();
    if (this.settings.musicEnabled && this.settings.musicVolume > 0) this.startMusic();
    else this.pauseMusic();
  }

  setScene(scene) {
    if (!Object.hasOwn(TRACKS, scene)) throw new RangeError(`Unknown music scene: ${scene}`);
    if (scene === this.scene && this.timer) return;
    this.pauseMusic();
    this.scene = scene;
    this.step = 0;
    this.nextNote = this.context ? this.context.currentTime : 0;
    this.startMusic();
  }

  pitch(midi) {
    return AUDIO.referenceFrequency * 2 ** ((midi - AUDIO.referencePitch) / AUDIO.semitones);
  }

  voice(frequency, start, duration, wave, level, output, voices, endFrequency = null) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency != null) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + Math.min(AUDIO.leadAttack, duration / 3));
    envelope.gain.setValueAtTime(level, Math.max(start + AUDIO.leadAttack, start + duration - AUDIO.release));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    voices.add(oscillator);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  schedule() {
    if (!this.context || this.context.state !== 'running') return;
    const track = TRACKS[this.scene];
    const eighth = 60 / track.bpm / 2;
    const now = this.context.currentTime;
    if (this.nextNote < now - AUDIO.maxScheduleLag) this.nextNote = now;
    while (this.nextNote < now + AUDIO.lookAhead) {
      const step = this.step;
      const lead = track.lead[step % track.lead.length];
      if (lead != null) this.voice(this.pitch(lead), this.nextNote, eighth * AUDIO.leadGate,
        track.wave, AUDIO.leadLevel, this.musicGain, this.musicVoices);
      if (step % 2 === 0) {
        const bass = track.bass[(step / 2) % track.bass.length];
        if (bass != null) this.voice(this.pitch(bass), this.nextNote, eighth * AUDIO.bassGate,
          'triangle', AUDIO.bassLevel, this.musicGain, this.musicVoices);
        if (track.beats[(step / 2) % track.beats.length]) this.voice(
          AUDIO.beatFrequency, this.nextNote, AUDIO.beatDuration, 'square',
          AUDIO.beatLevel, this.musicGain, this.musicVoices, AUDIO.beatEndFrequency);
      }
      this.nextNote += eighth;
      this.step++;
    }
  }

  startMusic() {
    if (!this.context || this.context.state !== 'running' || this.timer ||
        !this.settings.musicEnabled || !this.settings.musicVolume) return;
    this.nextNote = this.context.currentTime;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), AUDIO.scheduleInterval);
  }

  pauseMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const voice of this.musicVoices) {
      try { voice.stop(); } catch { /* Already finished between ticks. */ }
    }
    this.musicVoices.clear();
  }

  play(event) {
    const effect = SFX[event];
    if (!effect || !this.context || this.context.state !== 'running' ||
        !this.settings.sfxEnabled || !this.settings.sfxVolume) return;
    const start = this.context.currentTime;
    for (let index = 0; index < effect.notes.length; index++) this.voice(
      this.pitch(effect.notes[index]), start + effect.duration * index,
      effect.duration * AUDIO.leadGate, effect.wave, effect.level,
      this.sfxGain, this.sfxVoices);
  }

  stop() {
    this.pauseMusic();
    for (const voice of this.sfxVoices) {
      try { voice.stop(); } catch { /* Already finished between ticks. */ }
    }
    this.sfxVoices.clear();
  }
}
