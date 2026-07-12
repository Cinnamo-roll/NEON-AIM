export type TrainingSound = "hit" | "fast" | "miss" | "tick" | "start" | "end" | "combo";

export interface AudioLevelSource {
  master: () => number;
  hit: () => number;
  miss: () => number;
  combo: () => number;
  muted: () => boolean;
}

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

  play(kind: TrainingSound) {
    const level = effectiveSoundLevel(kind, this.levels);
    if (level <= 0) return;
    const context = this.ensure();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const frequency = {
      hit: 600,
      fast: 820,
      miss: 125,
      tick: 360,
      start: 620,
      end: 180,
      combo: 920,
    }[kind];
    oscillator.type = kind === "miss" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(70, frequency * (kind === "end" ? 0.55 : 1.35)),
      now + 0.09,
    );
    gain.gain.setValueAtTime(Math.max(0.001, level * 0.065), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(now + 0.12);
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
