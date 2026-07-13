export type TrainingSound = "hit" | "fast" | "miss" | "tick" | "start" | "end" | "combo";

export interface AudioLevelSource {
  master: () => number;
  hit: () => number;
  miss: () => number;
  combo: () => number;
  muted: () => boolean;
}

type AudioVoice = [number, OscillatorType, number, number, number, number];

const safeLevel = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function effectiveSoundLevel(kind: TrainingSound, levels: AudioLevelSource) {
  if (levels.muted()) return 0;
  const channel = kind === "hit" || kind === "fast"
    ? levels.hit()
    : kind === "miss"
      ? levels.miss()
      : kind === "combo"
        ? levels.combo()
        : 1;
  return safeLevel(levels.master()) * safeLevel(channel);
}

export function countdownWarningSeconds(previousRemaining: number, currentRemaining: number, limit = 10) {
  const previousSecond = Math.ceil(Math.max(0, previousRemaining));
  const currentSecond = Math.ceil(Math.max(0, currentRemaining));
  if (currentSecond >= previousSecond) return [];
  const warnings: number[] = [];
  for (let second = Math.min(limit, previousSecond - 1); second >= Math.max(1, currentSecond); second -= 1) {
    warnings.push(second);
  }
  return warnings;
}

export class AudioManager {
  private context: AudioContext | null = null;
  private readonly levels: AudioLevelSource;

  constructor(levels: AudioLevelSource) {
    this.levels = levels;
  }

  private ensure() {
    this.context ??= new AudioContext();
    void this.context.resume();
    return this.context;
  }

  private playVoices(voices: AudioVoice[], level: number) {
    const context = this.ensure();
    const now = context.currentTime;
    for (const [frequency, type, gainScale, delay, duration, pitchScale] of voices) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * pitchScale), start + duration * 0.72);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, level * 0.062 * gainScale), start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.015);
    }
  }

  play(kind: TrainingSound) {
    const level = effectiveSoundLevel(kind, this.levels);
    if (level <= 0) return;
    const voices: Record<TrainingSound, AudioVoice[]> = {
      hit: [[610, "sine", 1, 0, 0.105, 1.48], [1280, "triangle", 0.34, 0, 0.052, 0.78]],
      fast: [[760, "sine", 1, 0, 0.11, 1.55], [1660, "triangle", 0.42, 0.004, 0.058, 0.82]],
      miss: [[132, "sawtooth", 0.72, 0, 0.12, 0.56], [76, "triangle", 0.48, 0.012, 0.14, 0.72]],
      tick: [[360, "sine", 0.8, 0, 0.09, 1.35]],
      start: [[620, "sine", 0.8, 0, 0.13, 1.42], [930, "triangle", 0.38, 0.035, 0.1, 1.24]],
      end: [[210, "sine", 0.8, 0, 0.18, 0.55], [420, "triangle", 0.32, 0.025, 0.16, 0.72]],
      combo: [[880, "sine", 0.82, 0, 0.13, 1.32], [1180, "triangle", 0.44, 0.035, 0.12, 1.24], [1540, "sine", 0.25, 0.07, 0.1, 1.12]],
    };

    this.playVoices(voices[kind], level);
  }

  playCountdown(second: number) {
    const level = effectiveSoundLevel("tick", this.levels);
    if (level <= 0) return;
    const step = Math.min(3, Math.max(1, Math.round(second)));
    const frequency = 600 + (3 - step) * 150;
    const voices: AudioVoice[] = [
      [frequency, "sine", 1.08, 0, 0.12, 1.18],
      [frequency * 1.5, "triangle", 0.34, 0.012, 0.08, 1.08],
    ];
    if (step === 1) voices.push([frequency * 2, "sine", 0.22, 0.035, 0.09, 1.04]);
    this.playVoices(voices, level);
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
