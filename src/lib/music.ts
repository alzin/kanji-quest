import { useEffect, useRef, useSyncExternalStore } from "react";
import { getGameAudio, getSoundEnabled, subscribeSound, unlock } from "./sfx";

export type MusicScene = "forest" | "shrine" | "puzzle" | "run";
type Instrument = "bell" | "bass" | "pad";
export type MusicNote = { midi: number; instrument: Instrument; gain: number };
export const MUSIC_PREF_KEY = "kanji-dash-music";
export const MUSIC_TEMPO: Record<MusicScene, number> = { forest: 82, shrine: 70, puzzle: 94, run: 108 };
const MELODY = [[74, 0, 78, 81, 78, 0, 76, 74], [71, 0, 74, 78, 81, 78, 0, 74], [71, 74, 0, 78, 76, 0, 74, 71], [69, 0, 73, 76, 81, 0, 76, 73]];
const ROOTS = [50, 47, 43, 45];

/** An original 16-bar woodland score; no downloaded music or audio files. */
export function musicStep(scene: MusicScene, step: number): MusicNote[] {
  const bar = Math.floor(step / 8) % 4, beat = step % 8, variation = Math.floor(step / 32) % 4;
  const notes: MusicNote[] = [];
  const root = ROOTS[bar]!;
  const melody = MELODY[bar]![variation === 2 ? 7 - beat : beat]!;
  if (melody && !(scene === "shrine" && beat % 2)) notes.push({ midi: melody + (variation === 3 ? -12 : 0), instrument: "bell", gain: .19 });
  if (beat === 0 || (scene === "run" && beat === 4)) notes.push({ midi: root, instrument: "bass", gain: .25 });
  if (beat === 0) notes.push({ midi: root + 12, instrument: "pad", gain: .13 });
  if ((scene === "puzzle" || scene === "run") && beat % 2 === 1) notes.push({ midi: root + (beat === 3 ? 19 : 24), instrument: "bell", gain: .055 });
  return notes;
}

let enabled = true, loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { enabled = localStorage.getItem(MUSIC_PREF_KEY) !== "off"; } catch { /* Storage is optional. */ }
  window.addEventListener("storage", (e) => {
    if (e.key !== MUSIC_PREF_KEY && e.key !== null) return;
    try { enabled = localStorage.getItem(MUSIC_PREF_KEY) !== "off"; } catch { enabled = true; }
    sync(); listeners.forEach((l) => l());
  });
}
export function getMusicEnabled() { load(); return enabled; }
export function setMusicEnabled(on: boolean) {
  load(); enabled = on;
  try { localStorage.setItem(MUSIC_PREF_KEY, on ? "on" : "off"); } catch { /* Storage is optional. */ }
  if (on) unlock();
  sync(); listeners.forEach((l) => l());
}
export function useMusicEnabled() {
  return useSyncExternalStore((listener) => { load(); listeners.add(listener); return () => { listeners.delete(listener); }; }, getMusicEnabled, () => true);
}

type Session = { owner: object; scene: MusicScene; paused: boolean };
let session: Session | null = null, timer: ReturnType<typeof setInterval> | undefined;
let audioContext: AudioContext | null = null, bus: GainNode | null = null;
let nextBeat = 0, step = 0;
const playing = new Map<AudioBufferSourceNode, GainNode>();
const samples = new Map<string, AudioBuffer>();
const ducks = new Set<object>();
let audible = false;

export function duckMusic(token: object) { ducks.add(token); updateGain(); }
export function releaseMusicDuck(token: object) { ducks.delete(token); updateGain(); }
function updateGain() {
  if (!bus || !audioContext) return;
  try {
    bus.gain.cancelScheduledValues(audioContext.currentTime);
    bus.gain.setTargetAtTime(ducks.size ? .045 : .3, audioContext.currentTime, ducks.size ? .035 : .25);
  } catch { /* Cosmetic audio never interrupts play. */ }
}

function stopNotes() {
  for (const [source, gain] of playing) {
    source.onended = null;
    try { source.stop(); } catch { /* Already stopped. */ }
    source.disconnect(); gain.disconnect();
  }
  playing.clear(); audible = false; nextBeat = 0;
}
function sample(context: AudioContext, midi: number, instrument: Instrument): AudioBuffer {
  const key = `${instrument}-${midi}`;
  const existing = samples.get(key); if (existing) return existing;
  const duration = instrument === "pad" ? 3.2 : instrument === "bass" ? 1.9 : 1.35;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0), frequency = 440 * 2 ** ((midi - 69) / 12);
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate, phase = 2 * Math.PI * frequency * t;
    const attack = Math.min(1, t / (instrument === "pad" ? .3 : .008));
    const release = Math.min(1, (duration - t) / .1);
    const envelope = attack * release * Math.exp(-t * (instrument === "pad" ? .8 : instrument === "bass" ? 2.5 : 4.8));
    const tone = instrument === "bell" ? Math.sin(phase) + .28 * Math.sin(phase * 2) + .07 * Math.sin(phase * 3)
      : Math.sin(phase) + .1 * Math.sin(phase * 2);
    data[i] = tone * envelope * .5;
  }
  samples.set(key, buffer); return buffer;
}

function sync() {
  try {
    const audio = getGameAudio();
    if (!session || session.paused || !getMusicEnabled() || !getSoundEnabled() || document.hidden || !audio) { stopNotes(); return; }
    if (audioContext !== audio.context || !bus) {
      stopNotes(); try { bus?.disconnect(); } catch { /* Stale graph. */ }
      audioContext = audio.context; samples.clear(); bus = audioContext.createGain();
      bus.gain.value = ducks.size ? .045 : .3;
      bus.connect(audio.output); updateGain();
    }
    const now = audio.context.currentTime;
    if (!nextBeat || nextBeat < now - .5) nextBeat = now + .06;
    // Schedule against the audio clock, not frame rate. At most one short lookahead window.
    while (nextBeat < now + .18) {
      for (const note of musicStep(session.scene, step)) {
        if (playing.size >= 32) break;
        const source = audio.context.createBufferSource(), gain = audio.context.createGain();
        source.buffer = sample(audio.context, note.midi, note.instrument);
        gain.gain.value = note.gain;
        source.connect(gain); gain.connect(bus!); playing.set(source, gain);
        source.onended = () => { playing.delete(source); source.disconnect(); gain.disconnect(); };
        source.start(nextBeat); audible = true;
      }
      nextBeat += 60 / MUSIC_TEMPO[session.scene] / 2; step = (step + 1) % 128;
    }
  } catch { stopNotes(); }
}

/** Read-only diagnostics: useful for audio QA without exposing answers or save data. */
export function musicStatus() { return { audible, voices: playing.size, scene: session?.scene ?? null, paused: session?.paused ?? false, ducked: ducks.size > 0 }; }

export function useGameMusic(scene: MusicScene, paused = false) {
  const owner = useRef({}).current;
  useEffect(() => {
    session = { owner, scene, paused }; step = 0;
    const off = subscribeSound(sync);
    document.addEventListener("visibilitychange", sync);
    timer = setInterval(sync, 100); sync();
    return () => {
      off(); document.removeEventListener("visibilitychange", sync);
      if (session?.owner !== owner) return;
      clearInterval(timer); timer = undefined; session = null; stopNotes();
      try { bus?.disconnect(); } catch { /* Optional audio. */ } bus = null;
    };
  }, [owner]);
  useEffect(() => { if (session?.owner === owner) { session = { owner, scene, paused }; sync(); } }, [owner, scene, paused]);
}
