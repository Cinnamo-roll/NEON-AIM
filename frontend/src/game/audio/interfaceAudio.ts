export type InterfaceSound = "navigate" | "open" | "close" | "select";

type InterfaceVoice = {
  from: number;
  to: number;
  type: OscillatorType;
  gain: number;
  delay: number;
  duration: number;
};

const soundProfiles: Record<InterfaceSound, InterfaceVoice[]> = {
  navigate: [
    { from: 178, to: 238, type: "triangle", gain: 0.018, delay: 0, duration: 0.105 },
    { from: 356, to: 476, type: "sine", gain: 0.011, delay: 0.01, duration: 0.09 },
    { from: 712, to: 952, type: "sine", gain: 0.004, delay: 0.026, duration: 0.066 },
  ],
  open: [
    { from: 220, to: 294, type: "triangle", gain: 0.016, delay: 0, duration: 0.082 },
    { from: 440, to: 588, type: "sine", gain: 0.007, delay: 0.012, duration: 0.07 },
  ],
  close: [
    { from: 294, to: 220, type: "triangle", gain: 0.015, delay: 0, duration: 0.072 },
    { from: 588, to: 440, type: "sine", gain: 0.006, delay: 0.006, duration: 0.062 },
  ],
  select: [
    { from: 230, to: 205, type: "triangle", gain: 0.014, delay: 0, duration: 0.038 },
    { from: 690, to: 820, type: "sine", gain: 0.006, delay: 0.004, duration: 0.044 },
  ],
};

export function interfaceSoundLevel(volume: number, muted: boolean) {
  if (muted || !Number.isFinite(volume)) return 0;
  return Math.min(1, Math.max(0, volume));
}

class InterfaceAudioBus {
  private context: AudioContext | null = null;
  private playbackRevision = 0;

  private ensureContext() {
    if (this.context) return this.context;
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    this.context = new AudioContextConstructor();
    return this.context;
  }

  play(kind: InterfaceSound, volume: number, muted: boolean) {
    this.playbackRevision += 1;
    const level = interfaceSoundLevel(volume, muted);
    if (level <= 0 || typeof window === "undefined") return;

    try {
      const context = this.ensureContext();
      if (!context) return;
      void context.resume();
      const now = context.currentTime;
      const filter = context.createBiquadFilter();
      const compressor = context.createDynamicsCompressor();
      const output = context.createGain();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2800, now);
      filter.Q.setValueAtTime(0.45, now);
      compressor.threshold.setValueAtTime(-24, now);
      compressor.knee.setValueAtTime(14, now);
      compressor.ratio.setValueAtTime(3, now);
      compressor.attack.setValueAtTime(0.003, now);
      compressor.release.setValueAtTime(0.085, now);
      output.gain.setValueAtTime(0.9, now);
      filter.connect(compressor).connect(output).connect(context.destination);

      const voices = soundProfiles[kind];
      let endedVoices = 0;
      for (const voice of voices) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + voice.delay;
        const attack = Math.min(0.005, voice.duration * 0.16);
        oscillator.type = voice.type;
        oscillator.frequency.setValueAtTime(voice.from, start);
        oscillator.frequency.exponentialRampToValueAtTime(
          voice.to,
          start + voice.duration * 0.72,
        );
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(level * voice.gain, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + voice.duration);
        oscillator.connect(gain).connect(filter);
        oscillator.addEventListener("ended", () => {
          oscillator.disconnect();
          gain.disconnect();
          endedVoices += 1;
          if (endedVoices === voices.length) {
            filter.disconnect();
            compressor.disconnect();
            output.disconnect();
          }
        }, { once: true });
        oscillator.start(start);
        oscillator.stop(start + voice.duration + 0.012);
      }
    } catch {
      // Browsers may reject audio before the first user gesture. Navigation must still work.
    }
  }

  playFallback(kind: InterfaceSound, volume: number, muted: boolean) {
    const revision = this.playbackRevision;
    queueMicrotask(() => {
      if (revision === this.playbackRevision) this.play(kind, volume, muted);
    });
  }
}

export const interfaceAudio = new InterfaceAudioBus();
