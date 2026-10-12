import { useCallback } from "react";
import { useUi } from "../store/ui";

/**
 * Os sons da arena. Os dois mp3 vieram do FDP (`public/sounds/`); o resto é
 * sintetizado na hora com WebAudio — uma explosão é um sopro de ruído com o
 * grave decaindo, e isso se descreve em cinco linhas melhor do que num arquivo.
 */
export type SoundName =
  | "bubble"
  | "victory"
  | "place"
  | "explode"
  | "pickup"
  | "die"
  | "tick"
  | "go"
  | "hurry"
  | "crush";

export const VOLUME = 0.5;

const files: Partial<Record<SoundName, string>> = {
  bubble: "/sounds/bubble.mp3",
  victory: "/sounds/victory.mp3",
};

const cache = new Map<SoundName, HTMLAudioElement>();
let context: AudioContext | null = null;

function audio() {
  if (!context && typeof AudioContext === "function") context = new AudioContext();
  if (context?.state === "suspended") void context.resume();
  return context;
}

function noise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function tone(
  ctx: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  seconds: number,
  volume: number,
  at = 0,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + seconds);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + seconds + 0.02);
}

const synth: Partial<Record<SoundName, (ctx: AudioContext, volume: number) => void>> = {
  place: (ctx, v) => tone(ctx, "square", 220, 110, 0.08, v * 0.5),
  explode: (ctx, v) => {
    const source = noise(ctx, 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(v, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    tone(ctx, "sine", 90, 30, 0.35, v * 0.8);
  },
  pickup: (ctx, v) => {
    tone(ctx, "square", 660, 660, 0.06, v * 0.35);
    tone(ctx, "square", 880, 880, 0.06, v * 0.35, 0.06);
    tone(ctx, "square", 1320, 1320, 0.1, v * 0.35, 0.12);
  },
  die: (ctx, v) => {
    tone(ctx, "sawtooth", 500, 60, 0.5, v * 0.4);
    tone(ctx, "square", 300, 40, 0.5, v * 0.25, 0.05);
  },
  tick: (ctx, v) => tone(ctx, "square", 880, 880, 0.08, v * 0.35),
  go: (ctx, v) => tone(ctx, "square", 1320, 1320, 0.3, v * 0.4),
  // O alarme do aperto: três sobe-e-desce.
  hurry: (ctx, v) => {
    for (let i = 0; i < 3; i++) {
      tone(ctx, "square", 660, 660, 0.12, v * 0.35, i * 0.28);
      tone(ctx, "square", 990, 990, 0.12, v * 0.35, i * 0.28 + 0.14);
    }
  },
  // O bloco do aperto assentando: um baque curto e grave.
  crush: (ctx, v) => tone(ctx, "triangle", 140, 45, 0.12, v * 0.6),
};

export function playSound(name: SoundName, volume = VOLUME) {
  if (!useUi.getState().soundEnabled) return;
  const file = files[name];
  if (file) {
    let element = cache.get(name);
    if (!element) {
      element = new Audio(file);
      cache.set(name, element);
    }
    element.volume = volume;
    element.currentTime = 0;
    void element.play().catch(() => {});
    return;
  }
  const ctx = audio();
  const make = synth[name];
  if (ctx && make) {
    try {
      make(ctx, volume);
    } catch {
      // sem áudio não há o que fazer
    }
  }
}

/** Acorda o áudio no primeiro gesto: o navegador só deixa tocar depois de um toque. */
export function unlockAudio() {
  audio();
}

export function useSound() {
  const enabled = useUi((state) => state.soundEnabled);
  return useCallback(
    (name: SoundName, volume?: number) => void (enabled && playSound(name, volume)),
    [enabled],
  );
}
