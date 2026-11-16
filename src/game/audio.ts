import type { MusicContext } from './combatLogic';

// Original D Dorian / A Aeolian modal progressions (no copyrighted melodies)
// MIDI pitches for bass, string chord voicings, harp arpeggios, flute & combat ostinato
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 4-bar chord roots & triads in D Dorian (exploration) & D Minor (combat)
const EXPLORATION_BARS = [
  { root: 38, chord: [50, 57, 62, 65], melody: [74, null, 76, 77, 76, null, 74, 72] }, // Dm7
  { root: 41, chord: [53, 57, 60, 64], melody: [72, null, 69, null, 72, 74, 76, null] }, // Fmaj7
  { root: 43, chord: [55, 59, 62, 67], melody: [79, null, 76, 74, 72, null, 74, null] }, // G (Dorian IV)
  { root: 40, chord: [52, 55, 59, 62], melody: [71, null, 69, null, 67, null, 69, null] }, // Em7 -> Dm
];

const FOREST_MELODY_BARS = [
  [81, null, 79, null, 76, 74, null, 72],
  [74, null, null, 76, 77, null, 76, null],
  [79, null, 77, 76, 74, null, null, null],
  [72, null, 74, null, 69, null, null, null],
];

// Warm hearth progression in F Major / D Dorian for Osada Líska
const VILLAGE_MELODY_BARS = [
  [69, null, 72, null, 74, null, 72, null],
  [76, null, 74, 72, 69, null, null, null],
  [74, null, 76, 79, 77, null, 76, null],
  [72, null, 69, null, 65, null, null, null],
];

const COMBAT_BARS = [
  { root: 38, fifth: 45, ostinato: [50, 57, 50, 58, 50, 57, 50, 53], brass: [50, 57, 62] },
  { root: 36, fifth: 43, ostinato: [48, 55, 48, 57, 48, 55, 48, 52], brass: [48, 55, 60] },
  { root: 34, fifth: 41, ostinato: [46, 53, 46, 55, 46, 53, 46, 50], brass: [46, 53, 58] },
  { root: 33, fifth: 40, ostinato: [45, 52, 45, 55, 45, 53, 45, 52], brass: [45, 52, 57] },
];

export function clampMusicStepTime(nextStepTime: number, currentTime: number): number {
  if (!Number.isFinite(nextStepTime) || nextStepTime < currentTime - 0.32) {
    return currentTime + 0.04;
  }
  return nextStepTime;
}

class MiddleEarthAudio {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Adaptive stem sub-buses under musicGain
  private explorationBus: GainNode | null = null;
  private villageBus: GainNode | null = null;
  private forestBus: GainNode | null = null;
  private caveBus: GainNode | null = null;
  private encounterBus: GainNode | null = null;
  private combatBus: GainNode | null = null;

  // Ambient wind nodes
  private windOsc: OscillatorNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;

  // Cached procedural noise buffers (created once per AudioContext)
  private brownNoiseBuffer: AudioBuffer | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;

  // State
  private muted = false;
  private musicVolume = 0.7;
  private sfxVolume = 0.85;
  private paused = false;
  private tabHidden = false;
  private ambienceStarted = false;
  private wantsAmbience = false;
  private musicContext: MusicContext = 'silent';
  private victoryPlayedForPhase = false;
  private villageSongUnlocked = false;

  // Lookahead music sequencer state (single-instance safety)
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;

  private canActivateAudio(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return ua ? ua.hasBeenActive : true;
  }

  private ensureContext(fromGesture = false): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx && !fromGesture && !this.canActivateAudio()) {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.01;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.compressor = comp;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1.0;
      master.connect(comp);
      this.masterGain = master;

      const music = ctx.createGain();
      music.gain.value = this.computeTargetMusicGain();
      music.connect(master);
      this.musicGain = music;

      const sfx = ctx.createGain();
      sfx.gain.value = this.sfxVolume * 0.62;
      sfx.connect(master);
      this.sfxGain = sfx;

      // Sub-buses for smooth adaptive stem crossfading
      this.explorationBus = ctx.createGain();
      this.explorationBus.gain.value = 0.85;
      this.explorationBus.connect(music);

      this.villageBus = ctx.createGain();
      this.villageBus.gain.value = 0.0;
      this.villageBus.connect(music);

      this.forestBus = ctx.createGain();
      this.forestBus.gain.value = 0.0;
      this.forestBus.connect(music);

      this.caveBus = ctx.createGain();
      this.caveBus.gain.value = 0.0;
      this.caveBus.connect(music);

      this.encounterBus = ctx.createGain();
      this.encounterBus.gain.value = 0.0;
      this.encounterBus.connect(music);

      this.combatBus = ctx.createGain();
      this.combatBus.gain.value = 0.0;
      this.combatBus.connect(music);

      this.buildNoiseBuffers(ctx);
      this.applyStemCrossfade(0.05);
    }

    if (this.ctx.state === 'suspended' && !this.tabHidden && (fromGesture || this.canActivateAudio())) {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private buildNoiseBuffers(ctx: AudioContext): void {
    const brownLen = ctx.sampleRate * 3;
    const brown = ctx.createBuffer(1, brownLen, ctx.sampleRate);
    const bData = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < brownLen; i++) {
      const white = Math.random() * 2 - 1;
      bData[i] = (last + 0.02 * white) / 1.02;
      last = bData[i];
      bData[i] *= 2.2;
    }
    this.brownNoiseBuffer = brown;

    const whiteLen = ctx.sampleRate * 1;
    const white = ctx.createBuffer(1, whiteLen, ctx.sampleRate);
    const wData = white.getChannelData(0);
    for (let i = 0; i < whiteLen; i++) {
      wData[i] = Math.random() * 2 - 1;
    }
    this.whiteNoiseBuffer = white;
  }

  private computeTargetMusicGain(): number {
    if (this.muted || this.musicContext === 'silent') return 0;
    const pauseFactor = this.paused ? 0.28 : 1.0;
    return this.musicVolume * 0.42 * pauseFactor;
  }

  public unlockFromGesture(): void {
    const ctx = this.ensureContext(true);
    if (!ctx) return;
    if (this.wantsAmbience && !this.ambienceStarted) {
      this.startAmbience(true);
    }
    if (this.musicContext !== 'silent' && this.schedulerId === null) {
      this.startMusicScheduler();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1.0, this.ctx.currentTime, 0.06);
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.computeTargetMusicGain(), this.ctx.currentTime, 0.08);
    }
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.computeTargetMusicGain(), this.ctx.currentTime, 0.08);
    }
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.62, this.ctx.currentTime, 0.06);
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.computeTargetMusicGain(), this.ctx.currentTime, 0.14);
    }
    if (this.windGain && this.ctx) {
      this.windGain.gain.setTargetAtTime(paused ? 0.02 : 0.065, this.ctx.currentTime, 0.14);
    }
  }

  public setTabHidden(hidden: boolean): void {
    this.tabHidden = hidden;
    if (!this.ctx) return;
    if (hidden) {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (this.ctx.state === 'suspended' && this.canActivateAudio()) {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMusicContext(next: MusicContext): void {
    if (next === this.musicContext) return;
    const prev = this.musicContext;
    this.musicContext = next;

    if (next !== 'victory') {
      this.victoryPlayedForPhase = false;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    if (next !== 'silent' && this.schedulerId === null) {
      this.startMusicScheduler();
    }

    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.computeTargetMusicGain(), ctx.currentTime, 0.25);
    }

    if (next === 'combat' && prev !== 'combat' && prev !== 'silent') {
      this.playCombatHornCue();
    }

    if (next === 'victory' && !this.victoryPlayedForPhase) {
      this.victoryPlayedForPhase = true;
      this.playVictoryResolution();
    }

    this.applyStemCrossfade(next === 'combat' ? 0.45 : 0.9);
  }

  public getMusicContext(): MusicContext {
    return this.musicContext;
  }

  public setVillageSongUnlocked(unlocked: boolean): void {
    this.villageSongUnlocked = unlocked;
  }

  private applyStemCrossfade(tau: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.musicContext;

    const expTarget = m === 'exploration' || m === 'forest' ? 0.85 : m === 'village' ? 0.48 : m === 'encounter' ? 0.35 : m === 'victory' ? 0.4 : 0.05;
    const vilTarget = m === 'village' ? 0.92 : 0.0;
    const forTarget = m === 'forest' ? 0.9 : m === 'exploration' ? 0.22 : 0.0;
    const cavTarget = m === 'cave' ? 0.92 : 0.0;
    const encTarget = m === 'encounter' ? 0.95 : m === 'combat' ? 0.45 : 0.0;
    const comTarget = m === 'combat' ? 0.98 : 0.0;

    this.explorationBus?.gain.setTargetAtTime(expTarget, t, tau);
    this.villageBus?.gain.setTargetAtTime(vilTarget, t, tau);
    this.forestBus?.gain.setTargetAtTime(forTarget, t, tau);
    this.caveBus?.gain.setTargetAtTime(cavTarget, t, tau);
    this.encounterBus?.gain.setTargetAtTime(encTarget, t, tau * 0.7);
    this.combatBus?.gain.setTargetAtTime(comTarget, t, tau * 0.6);
  }

  public startAmbience(fromGesture = false): void {
    this.wantsAmbience = true;
    const ctx = this.ensureContext(fromGesture);
    if (!ctx || !this.sfxGain) return;

    if (this.musicContext === 'silent') {
      this.setMusicContext('exploration');
    } else if (this.schedulerId === null) {
      this.startMusicScheduler();
    }

    if (this.ambienceStarted || !this.brownNoiseBuffer) return;
    this.ambienceStarted = true;

    const noise = ctx.createBufferSource();
    noise.buffer = this.brownNoiseBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 330;
    filter.Q.value = 1.3;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.065;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noise.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.sfxGain);
    noise.start();
    this.windSource = noise;
    this.windOsc = lfo;
  }

  // -------------------------------------------------------------------------
  // Lookahead Procedural Fantasy Music Sequencer
  // -------------------------------------------------------------------------

  private startMusicScheduler(): void {
    if (typeof window === 'undefined' || !this.ctx) return;
    if (this.schedulerId !== null) return; // Single-instance scheduler guard
    this.nextStepTime = this.ctx.currentTime + 0.08;

    this.schedulerId = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || this.muted || this.musicContext === 'silent') {
        return;
      }
      this.nextStepTime = clampMusicStepTime(this.nextStepTime, this.ctx.currentTime);
      const horizon = this.ctx.currentTime + 0.28;
      while (this.nextStepTime < horizon) {
        this.scheduleMusicStep(this.stepIndex, this.nextStepTime);
        // Step duration: slightly brisker during combat/encounter for dramatic energy
        const stepSec =
          this.musicContext === 'combat'
            ? 0.24
            : this.musicContext === 'encounter'
              ? 0.31
              : 0.39;
        this.nextStepTime += stepSec;
        this.stepIndex = (this.stepIndex + 1) % 32; // 4 bars × 8 eighth-steps
      }
    }, 100);
  }

  private scheduleMusicStep(step: number, time: number): void {
    if (!this.ctx || this.musicContext === 'victory') return;
    const barIdx = Math.floor(step / 8) % 4;
    const beatStep = step % 8;
    const expBar = EXPLORATION_BARS[barIdx];
    const comBar = COMBAT_BARS[barIdx];

    // 1. Warm Exploration String Ensemble (on downbeat of each bar)
    if (beatStep === 0 && this.explorationBus) {
      this.playStringPad(expBar.root, 3.1, 0.22, this.explorationBus, time);
      for (let i = 0; i < 3; i++) {
        this.playStringPad(expBar.chord[i], 3.0, 0.095, this.explorationBus, time);
      }
    }

    // 2. Gentle Celtic/Elven Harp Arpeggio (steps 0, 2, 4, 6)
    if (beatStep % 2 === 0 && this.explorationBus) {
      const harpNote = expBar.chord[(beatStep / 2) % expBar.chord.length];
      this.playHarpPluck(harpNote, 1.3, 0.11, this.explorationBus, time);
    }

    // 3. Lyrical Flute Melody (Exploration & Forest)
    const expMelody = expBar.melody[beatStep];
    if (expMelody !== null && this.explorationBus && (this.musicContext === 'exploration' || this.musicContext === 'encounter')) {
      this.playFluteNote(expMelody, 0.72, 0.11, this.explorationBus, time);
    }
    const forestNote = FOREST_MELODY_BARS[barIdx][beatStep];
    if (forestNote !== null && this.forestBus) {
      this.playFluteNote(forestNote, 0.85, 0.12, this.forestBus, time);
      if (beatStep === 0) {
        this.playHarpPluck(forestNote - 12, 1.8, 0.09, this.forestBus, time);
      }
    }

    // 3b. Peaceful Osada Líska Village Hearth Motif (+ Forgotten Song melody when unlocked)
    if (this.villageBus && this.musicContext === 'village') {
      const vilNote = VILLAGE_MELODY_BARS[barIdx][beatStep];
      if (vilNote !== null) {
        this.playHarpPluck(vilNote, 1.6, 0.12, this.villageBus, time);
        if (this.villageSongUnlocked) {
          this.playFluteNote(vilNote + 12, 0.95, 0.1, this.villageBus, time);
        }
      }
      if (beatStep === 0) {
        this.playStringPad(expBar.root, 3.2, 0.14, this.villageBus, time);
      }
    }

    // 3c. Old Mines Subterranean Low Echoes
    if (this.caveBus && this.musicContext === 'cave') {
      if (beatStep === 0) {
        this.playStringPad(expBar.root - 12, 3.4, 0.2, this.caveBus, time);
      }
      if (beatStep === 4) {
        this.playHarpPluck(expBar.chord[0] - 12, 2.0, 0.08, this.caveBus, time);
      }
    }

    // 4. Encounter Low Tension Pulse (contrabass pulse + frame drum heartbeat)
    if (this.encounterBus && (this.musicContext === 'encounter' || this.musicContext === 'combat')) {
      if (beatStep === 0 || beatStep === 3 || beatStep === 6) {
        this.playTimpaniHit(midiToFreq(comBar.root - 12), 0.28, 0.18, this.encounterBus, time);
      }
      if (beatStep === 0 || beatStep === 4) {
        this.playLowStringStab(comBar.root, 0.55, 0.14, this.encounterBus, time);
      }
    }

    // 5. Combat Driving String Ostinato, War Drums & Heroic Brass Fifths
    if (this.combatBus && this.musicContext === 'combat') {
      const ostNote = comBar.ostinato[beatStep];
      this.playLowStringStab(ostNote, 0.22, beatStep % 2 === 0 ? 0.15 : 0.1, this.combatBus, time);

      if (beatStep === 0 || beatStep === 4) {
        this.playTimpaniHit(52, 0.4, 0.32, this.combatBus, time);
      } else if (beatStep === 2 || beatStep === 6 || beatStep === 7) {
        this.playTimpaniHit(74, 0.16, 0.16, this.combatBus, time);
      }

      if (beatStep === 0 && (barIdx === 0 || barIdx === 2)) {
        this.playBrassHorn(comBar.brass[0], 1.5, 0.13, this.combatBus, time);
        this.playBrassHorn(comBar.brass[1], 1.5, 0.1, this.combatBus, time);
      }
    }
  }

  private playStringPad(midi: number, dur: number, amp: number, dest: AudioNode, time: number): void {
    const ctx = this.ctx!;
    const freq = midiToFreq(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1150, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.42);
    gain.gain.setValueAtTime(amp * 0.88, time + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    // Dual slightly detuned oscillators for lush ensemble warmth
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detune, time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
    filter.connect(gain);
    gain.connect(dest);
  }

  private playHarpPluck(midi: number, dur: number, amp: number, dest: AudioNode, time: number): void {
    const ctx = this.ctx!;
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, time);
    filter.frequency.exponentialRampToValueAtTime(650, time + dur * 0.8);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.04);
  }

  private playFluteNote(midi: number, dur: number, amp: number, dest: AudioNode, time: number): void {
    const ctx = this.ctx!;
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    vib.frequency.value = 5.2;
    vibGain.gain.value = freq * 0.012;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.09);
    gain.gain.setValueAtTime(amp * 0.85, time + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    vib.start(time);
    osc.stop(time + dur + 0.05);
    vib.stop(time + dur + 0.05);
  }

  private playLowStringStab(midi: number, dur: number, amp: number, dest: AudioNode, time: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(380, time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  private playBrassHorn(midi: number, dur: number, amp: number, dest: AudioNode, time: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, time);
    filter.frequency.linearRampToValueAtTime(1450, time + 0.25);
    filter.frequency.exponentialRampToValueAtTime(520, time + dur);
    filter.Q.value = 1.6;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.16);
    gain.gain.setValueAtTime(amp * 0.85, time + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private playTimpaniHit(freq: number, dur: number, amp: number, dest: AudioNode, time: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.45, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.72), time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.04);
  }

  private playCombatHornCue(): void {
    if (this.muted || !this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime + 0.02;
    this.playBrassHorn(50, 0.9, 0.16, this.musicGain, now);
    this.playBrassHorn(57, 1.1, 0.14, this.musicGain, now + 0.12);
  }

  public playVictoryResolution(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    const now = ctx.currentTime + 0.03;
    // Uplifting D Major heroic cadence: A4 -> D5 -> F#5 -> A5
    const notes = [69, 74, 78, 81];
    notes.forEach((m, idx) => {
      const t = now + idx * 0.22;
      this.playBrassHorn(m - 12, 1.5, 0.15, this.musicGain!, t);
      this.playHarpPluck(m, 1.9, 0.16, this.musicGain!, t);
      this.playStringPad(m - 12, 2.4, 0.12, this.musicGain!, t);
    });
  }

  // -------------------------------------------------------------------------
  // Layered Combat, Magic & Environment SFX
  // -------------------------------------------------------------------------

  public playFootstep(inWater = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = inWater ? 'sine' : 'triangle';
    const base = inWater ? 255 : 94;
    const jitter = 0.9 + Math.random() * 0.2;
    osc.frequency.setValueAtTime(base * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(inWater ? 105 : 38, now + 0.09);

    gain.gain.setValueAtTime(inWater ? 0.12 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.11);

    if (inWater && this.whiteNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.05, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      src.start(now, 0, 0.13);
    }
  }

  public playSwing(comboStep = 0): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const isStaff = comboStep === 1;

    // Air whoosh via cached noise buffer
    if (this.whiteNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isStaff ? 620 : 1250 + comboStep * 200, now);
      filter.frequency.exponentialRampToValueAtTime(isStaff ? 220 : 380, now + 0.19);
      filter.Q.value = 1.8;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now, 0, 0.21);
    }

    // Blade steel ring or low staff swoosh
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isStaff ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isStaff ? 210 : 880 + comboStep * 140, now);
    osc.frequency.exponentialRampToValueAtTime(isStaff ? 85 : 320, now + 0.16);
    gain.gain.setValueAtTime(isStaff ? 0.16 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playHit(heavy = false, isStaffImpact = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    // Body thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 165 : isStaffImpact ? 205 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + (heavy ? 0.21 : 0.13));

    gain.gain.setValueAtTime(heavy ? 0.44 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.22 : 0.14));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.23);

    // Metallic Glamdring clash / wooden crack layer
    if (this.whiteNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = isStaffImpact ? 'lowpass' : 'highpass';
      filter.frequency.value = isStaffImpact ? 850 : 1700;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(heavy ? 0.24 : 0.15, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      src.start(now, 0, 0.11);
    }
  }

  public playFlashOfLight(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const freqs = [523.25, 783.99, 1046.5, 1318.5, 1567.98];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.025);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, now + 0.6);
      gain.gain.setValueAtTime(0.14, now + idx * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + idx * 0.025);
      osc.stop(now + 0.72);
    });
  }

  public playFireSpell(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    if (this.whiteNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.48);
      filter.Q.value = 0.9;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now, 0, 0.5);
    }

    const roar = ctx.createOscillator();
    const rGain = ctx.createGain();
    roar.type = 'sawtooth';
    roar.frequency.setValueAtTime(145, now);
    roar.frequency.exponentialRampToValueAtTime(55, now + 0.36);
    rGain.gain.setValueAtTime(0.16, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    roar.connect(rGain);
    rGain.connect(this.sfxGain);
    roar.start(now);
    roar.stop(now + 0.4);
  }

  public playShockwave(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.65);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.7);

    // Resonant staff slam crack
    const ring = ctx.createOscillator();
    const rGain = ctx.createGain();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(440, now);
    ring.frequency.exponentialRampToValueAtTime(220, now + 0.45);
    rGain.gain.setValueAtTime(0.18, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    ring.connect(rGain);
    rGain.connect(this.sfxGain);
    ring.start(now);
    ring.stop(now + 0.5);
  }

  public playShieldBlock(parry = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const freqs = parry ? [587.33, 880, 1174.66] : [440, 659.25];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = parry ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.015);
      gain.gain.setValueAtTime(parry ? 0.22 : 0.16, now + i * 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (parry ? 0.36 : 0.22));
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.015);
      osc.stop(now + (parry ? 0.38 : 0.24));
    });
  }

  public playArrowShoot(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(155, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playEnemyAlert(combat = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(combat ? 125 : 155, now);
    osc.frequency.exponentialRampToValueAtTime(combat ? 82 : 115, now + 0.22);

    filter.type = 'lowpass';
    filter.frequency.value = 520;

    gain.gain.setValueAtTime(combat ? 0.18 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playEnemyDefeat(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.34);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playQuestChime(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.14, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.46);
    });
  }

  public dispose(): void {
    if (this.schedulerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.windOsc) {
      try {
        this.windOsc.stop();
      } catch {
        // ignore
      }
      this.windOsc = null;
    }
    if (this.windSource) {
      try {
        this.windSource.stop();
      } catch {
        // ignore
      }
      this.windSource = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.compressor = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.explorationBus = null;
    this.villageBus = null;
    this.forestBus = null;
    this.caveBus = null;
    this.encounterBus = null;
    this.combatBus = null;
    this.brownNoiseBuffer = null;
    this.whiteNoiseBuffer = null;
    this.ambienceStarted = false;
  }
}

export const gameAudio = new MiddleEarthAudio();

