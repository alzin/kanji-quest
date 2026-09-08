import { expect, test } from "@playwright/test";
import {
  comboDetuneCents,
  comboPitch,
  getSoundEnabled,
  haptic,
  isAudioRunning,
  MILESTONE_BELLS,
  normalizeSoundPreference,
  PENTATONIC_LADDER,
  planSound,
  play,
  setSoundEnabled,
  SOUND_IDS,
  SOUND_PREF_KEY,
  STAMP_LAND_SECONDS,
  subscribeSound,
  unlock,
  type SoundId,
  type SoundOpts,
  type Voice,
} from "../../src/lib/sfx";

// The planner is pure and runs in Node; the store tests below fake a window.
test.describe.configure({ mode: "serial" });

const isOsc = (v: Voice) => v.kind === "osc";
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test.describe("pentatonic ladder", () => {
  test("starts at D4 and never wraps at the top", () => {
    expect(comboPitch(1)).toBe(293.66);
    expect(comboPitch(0)).toBe(comboPitch(1));
    expect(comboPitch(11)).toBe(1174.66);
    expect(comboPitch(12)).toBe(1174.66);
    expect(comboPitch(40)).toBe(1174.66);
    for (let c = 1; c < 40; c++) expect(comboPitch(c + 1)).toBeGreaterThanOrEqual(comboPitch(c));
    expect(PENTATONIC_LADDER).toHaveLength(11);
    expect(comboPitch(Number.NaN)).toBe(293.66);
  });

  test("detune is deterministic and within ±6 cents", () => {
    for (let c = 0; c <= 60; c++) {
      const d = comboDetuneCents(c);
      expect(d).toBe(comboDetuneCents(c));
      expect(d).toBeGreaterThanOrEqual(-6);
      expect(d).toBeLessThanOrEqual(6);
      expect(Number.isInteger(d)).toBe(true);
    }
    expect(comboDetuneCents(-3)).toBe(comboDetuneCents(0));
  });
});

test.describe("planSound", () => {
  test("correct climbs the ladder and grows with the combo", () => {
    for (const combo of [1, 2, 3, 4, 5, 7, 8, 12, 30]) {
      const plan = planSound("correct", { combo });
      const first = plan.voices.find(isOsc);
      expect(first?.freq).toBe(comboPitch(combo));
      expect(first?.wave).toBe("triangle");
      expect(first?.decayMs).toBe(Math.min(320, 220 + 8 * combo));
      expect(first?.detuneCents ?? 0).toBe(comboDetuneCents(combo));
      const second = plan.voices.some((v) => near(v.at, 0.06));
      expect(second).toBe(combo >= 5);
      const sub = plan.voices.some((v) => isOsc(v) && v.wave === "sine" && near(v.freq, comboPitch(combo) / 2));
      expect(sub).toBe(combo >= 8);
      expect(plan.haptic).toBe(10);
      expect(plan.minIntervalMs).toBe(40);
    }
    const idx = 4; // combo 5 -> ladder index 4, second pluck two rungs up
    const combo5 = planSound("correct", { combo: 5 });
    expect(combo5.voices.find((v) => near(v.at, 0.06) && isOsc(v))?.freq).toBe(PENTATONIC_LADDER[idx + 2]);
    expect(planSound("correct").voices.find(isOsc)?.freq).toBe(293.66);
  });

  test("comboMilestone rings one, two or three orin strikes in order", () => {
    for (const [combo, count] of [[3, 1], [5, 1], [8, 1], [10, 2], [15, 2], [20, 3], [30, 3]] as const) {
      const plan = planSound("comboMilestone", { combo });
      const strikes = plan.voices.filter((v) => MILESTONE_BELLS.includes(v.freq));
      expect(strikes.map((v) => v.freq)).toEqual(MILESTONE_BELLS.slice(0, count));
      expect(plan.voices.every((v) => v.ceremony === true)).toBe(true);
      expect(strikes[0]?.at).toBe(0.06);
      expect(strikes[0]?.lfo).toEqual({ hz: 6, depth: 0.1 });
      expect(plan.haptic).toEqual([12, 40, 12]);
    }
  });

  test("wrong is a taiko, schedules the fwip, and adds the temple bell on the last heart", () => {
    const three = planSound("wrong", { hearts: 3 });
    const one = planSound("wrong", { hearts: 1 });
    for (const plan of [three, one]) {
      const first = plan.voices[0];
      expect(first?.kind).toBe("osc");
      expect(first?.freq).toBe(150);
      expect(first?.freqEnd).toBe(55);
      expect(plan.voices.some((v) => v.kind === "noise" && near(v.at, 0.2))).toBe(true);
    }
    expect(one.voices.some((v) => v.freq === 196 && v.at >= 0.35)).toBe(true);
    expect(three.voices.some((v) => v.freq === 196)).toBe(false);
    expect(planSound("wrong").voices.some((v) => v.freq === 196)).toBe(false);
    expect(three.haptic).toEqual([35, 50, 35]);
    expect(one.haptic).toEqual([35, 50, 35, 80, 20]);
  });

  test("every id plans safely with and without options", () => {
    const opts: SoundOpts[] = [{}, { combo: 0 }, { combo: 25, dir: -1, hearts: 1, earned: 0, level: 0.65 }, { combo: -4, earned: 1e9, level: 7 }];
    for (const id of SOUND_IDS) {
      for (const o of [undefined, ...opts]) {
        const plan = o ? planSound(id, o) : planSound(id);
        expect(plan.id).toBe(id);
        expect(plan.voices.length).toBeGreaterThan(0);
        expect(plan.minIntervalMs).toBeGreaterThanOrEqual(40);
        let prev = -Infinity;
        for (const v of plan.voices) {
          expect(v.at).toBeGreaterThanOrEqual(0);
          expect(v.at).toBeGreaterThanOrEqual(prev);
          prev = v.at;
          expect(v.gain).toBeLessThanOrEqual(0.5);
          expect(v.gain).toBeGreaterThanOrEqual(0);
          expect(v.freq).toBeGreaterThan(0);
          expect(v.attackMs + v.decayMs).toBeLessThanOrEqual(1200);
          if (v.kind === "noise") expect(v.filter).toBeDefined();
          if (v.freqEnd !== undefined) expect(v.freqEnd).toBeGreaterThan(0);
        }
      }
    }
    expect(SOUND_IDS).toHaveLength(24);
    expect(new Set(SOUND_IDS).size).toBe(24);
  });

  test("rate limits and ceremony flags follow the catalogue", () => {
    expect(planSound("laneChange", { dir: -1 }).minIntervalMs).toBe(50);
    expect(planSound("strokeEnd").minIntervalMs).toBe(80);
    expect(planSound("laneChange", { dir: -1 }).voices[0]?.freq).toBe(1200);
    expect(planSound("laneChange", { dir: 1 }).voices[0]?.freq).toBe(850);
    for (const id of ["stamp", "comboMilestone", "lastHeart", "coins", "runComplete", "checkpointPassed", "checkpointFailed", "sealEarned", "streakBell"] as const) {
      expect(planSound(id).voices.every((v) => v.ceremony === true), id).toBe(true);
    }
    for (const id of ["tap", "laneChange", "pause", "resume", "lessonOpen", "strokeEnd", "dojoFail", "unmute", "sheet"] as const) {
      expect(planSound(id).voices.some((v) => v.ceremony === true), id).toBe(false);
    }
  });

  test("coins count out the reward", () => {
    expect(planSound("coins", { earned: 0 }).voices).toHaveLength(1);
    expect(planSound("coins", { earned: 0 }).voices[0]?.gain).toBe(0.03);
    expect(planSound("coins", { earned: 15 }).voices).toHaveLength(3);
    expect(planSound("coins").voices).toHaveLength(3);
    expect(planSound("coins", { earned: 15 }).voices.map((v) => v.freq)).toEqual([2637, 3136, 3520]);
    expect(planSound("coins", { earned: 15 }).voices.map((v) => v.at)).toEqual([0, 0.07, 0.14]);
  });

  test("results ceremonies land on the stamp", () => {
    const passed = planSound("checkpointPassed", { earned: 50 });
    expect(passed.voices[0]?.at).toBe(STAMP_LAND_SECONDS);
    expect(passed.voices[0]?.freq).toBe(95);
    expect(passed.voices.some((v) => v.freq === 1318.5)).toBe(true);
    expect(passed.voices.some((v) => v.freq === 2637)).toBe(true);
    expect(Math.max(...passed.voices.map((v) => v.at))).toBeLessThan(1.6);
    expect(Array.isArray(passed.haptic)).toBe(true);

    // Coin ticks share 2637 Hz with the E6 bell's second partial; tell them apart by envelope.
    const isCoinTick = (v: Voice) => v.attackMs === 1 && v.decayMs === 69;
    const seal = planSound("sealEarned");
    expect(seal.voices[0]?.at).toBe(STAMP_LAND_SECONDS);
    expect(seal.voices.filter(isCoinTick).map((v) => v.freq)).toEqual([2637, 3136, 3520]);
    expect(passed.voices.filter(isCoinTick)).toHaveLength(3);
    expect(planSound("checkpointPassed", { earned: 0 }).voices.filter(isCoinTick)).toHaveLength(1);

    const complete = planSound("runComplete", { earned: 0 });
    expect(complete.voices.filter(isOsc).filter((v) => v.wave === "triangle").map((v) => v.freq)).toEqual([587.33, 783.99, 880, 1174.66]);
    expect(complete.voices.filter(isCoinTick)).toHaveLength(1);
    expect(complete.voices.find(isCoinTick)?.at).toBe(0.9);

    expect(planSound("runEnded").haptic).toBeUndefined();
    expect(planSound("checkpointFailed").haptic).toBeUndefined();
    expect(planSound("keepRunning").voices.some((v) => isOsc(v) && v.wave === "triangle" && v.freq === 293.66)).toBe(true);
    expect(planSound("dojoPass").voices.some((v) => v.freq === 95 && near(v.at, 0.15))).toBe(true);
    expect(planSound("stamp", { level: 0.5 }).voices[0]?.gain).toBeCloseTo(0.15, 10);
    expect(planSound("resume").voices.filter((v) => v.kind === "noise")).toHaveLength(4);
  });

  test("planning never touches the DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(() => SOUND_IDS.forEach((id: SoundId) => planSound(id))).not.toThrow();
  });
});

test.describe("preference and engine in Node", () => {
  test("normalizeSoundPreference only honours 'off'", () => {
    expect(normalizeSoundPreference("off")).toBe(false);
    for (const raw of ["on", undefined, null, 42, "OFF", "", {}]) expect(normalizeSoundPreference(raw)).toBe(true);
    expect(SOUND_PREF_KEY).toBe("kanji-dash-sound");
  });

  test("engine is a silent no-op without Web Audio", () => {
    expect(getSoundEnabled()).toBe(true);
    expect(isAudioRunning()).toBe(false);
    expect(() => unlock()).not.toThrow();
    expect(() => play("correct", { combo: 3 })).not.toThrow();
    expect(() => play("wrong")).not.toThrow();
    expect(() => haptic([10, 20])).not.toThrow();
    expect(isAudioRunning()).toBe(false);
  });

  test("store loads lazily from its own key, persists, and notifies", () => {
    const store = new Map<string, string>();
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, String(value)); },
        removeItem: (key: string) => { store.delete(key); },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    store.set(SOUND_PREF_KEY, "off");
    const g = globalThis as { window?: unknown };
    g.window = fakeWindow;
    try {
      expect(getSoundEnabled()).toBe(false);
      let notified = 0;
      const unsubscribe = subscribeSound(() => { notified += 1; });
      setSoundEnabled(true);
      expect(getSoundEnabled()).toBe(true);
      expect(store.get(SOUND_PREF_KEY)).toBe("on");
      expect(notified).toBe(1);
      expect(isAudioRunning()).toBe(false); // no AudioContext on the fake window: nothing created
      setSoundEnabled(false);
      expect(store.get(SOUND_PREF_KEY)).toBe("off");
      expect(notified).toBe(2);
      expect(() => play("tap")).not.toThrow();
      unsubscribe();
      setSoundEnabled(true);
      expect(notified).toBe(2);
      expect(store.has("kanji-dash-v1")).toBe(false);
      expect([...store.keys()]).toEqual([SOUND_PREF_KEY]);
    } finally {
      delete g.window;
    }
  });

  test("renderer schedules voices on a recorder-style context", () => {
    // Mirrors the e2e recorder stub: AudioParams log setValueAtTime, oscillator.start
    // records the first frequency setValueAtTime, buffer sources record as noise.
    type Logged = { type: string; freq: number; at: number };
    const log: Logged[] = [];
    let contexts = 0;
    const param = () => {
      const values: number[] = [];
      return {
        value: 0,
        values,
        setValueAtTime: (v: number) => { values.push(v); },
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      };
    };
    const node = () => ({ connect: () => {}, disconnect: () => {} });
    const created: StubContext[] = [];
    class StubContext {
      state = "running";
      currentTime = 0;
      sampleRate = 48_000;
      destination = node();
      onstatechange: unknown = null;
      constructor() { contexts += 1; created.push(this); }
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createGain() { return { ...node(), gain: param() }; }
      createBiquadFilter() { return { ...node(), type: "lowpass", frequency: param(), Q: param(), gain: param() }; }
      createDynamicsCompressor() {
        return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
      }
      createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
      createBufferSource() {
        return { ...node(), buffer: null, loop: false, onended: null, start: (t: number) => { log.push({ type: "noise", freq: 0, at: t }); }, stop: () => {} };
      }
      createOscillator() {
        const frequency = param();
        const self = {
          ...node(), type: "sine", frequency, detune: param(), onended: null,
          start: (t: number) => { log.push({ type: self.type, freq: frequency.values[0] ?? -1, at: t }); },
          stop: () => {},
        };
        return self;
      }
    }
    const g = globalThis as { window?: unknown };
    g.window = { AudioContext: StubContext, localStorage: { getItem: () => null, setItem: () => {} }, addEventListener: () => {} };
    try {
      expect(getSoundEnabled()).toBe(true);
      play("correct", { combo: 1 }); // nothing before unlock: no context yet
      expect(contexts).toBe(0);
      expect(log).toHaveLength(0);

      unlock();
      expect(contexts).toBe(1);
      expect(isAudioRunning()).toBe(true);
      unlock();
      expect(contexts).toBe(1); // singleton

      play("correct", { combo: 1 });
      const triangles = log.filter((v) => v.type === "triangle").map((v) => v.freq);
      expect(triangles).toEqual([293.66]);
      expect(log.some((v) => v.type === "noise")).toBe(true);
      play("correct", { combo: 2 }); // same id inside the 40 ms window: coalesced
      expect(log.filter((v) => v.type === "triangle")).toHaveLength(1);

      play("wrong", { hearts: 1 });
      expect(log.some((v) => v.type === "sine" && v.freq === 150 && v.at === 0)).toBe(true);
      expect(log.some((v) => v.type === "noise" && Math.abs(v.at - 0.2) < 1e-9)).toBe(true);
      expect(log.some((v) => v.type === "sine" && v.freq === 196 && v.at >= 0.35)).toBe(true);

      play("comboMilestone", { combo: 3 });
      expect(log.some((v) => v.type === "sine" && v.freq === 1318.5)).toBe(true);
      play("mastered"); // within 100 ms of the milestone: dropped
      expect(log.some((v) => v.type === "triangle" && v.freq === 1174.66)).toBe(false);

      play("checkpointPassed", { earned: 50 });
      expect(log.some((v) => v.type === "sine" && v.freq === 95 && Math.abs(v.at - STAMP_LAND_SECONDS) < 1e-9)).toBe(true);
      expect(log.every((v) => v.at >= 0)).toBe(true);

      // Muting suspends nothing loudly and play() becomes a no-op again.
      const before = log.length;
      setSoundEnabled(false);
      play("tap");
      expect(log).toHaveLength(before);
      setSoundEnabled(true);
    } finally {
      // Release the singleton so the next test can install its own recorder.
      for (const c of created) c.state = "closed";
      delete g.window;
    }
  });

  test("a minimal recorder without detune or frequency ramps still starts every voice", async () => {
    // Plucks shape their pitch through osc.detune and glides through frequency
    // ramps; a recorder that omits them must not lose the start() the e2e keys on.
    // The 8-voice cap is wall-clock: let the previous test's voices end first.
    await new Promise((resolve) => setTimeout(resolve, 600));
    type Logged = { type: string; freq: number; at: number };
    const log: Logged[] = [];
    const setOnly = () => ({ value: 0, setValueAtTime: () => {} });
    const full = () => ({
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    });
    const node = () => ({ connect: () => {}, disconnect: () => {} });
    const created: MinimalContext[] = [];
    class MinimalContext {
      state = "running";
      currentTime = 0;
      sampleRate = 48_000;
      destination = {};
      constructor() { created.push(this); }
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createGain() { return { ...node(), gain: full() }; }
      createBiquadFilter() { return { ...node(), type: "lowpass", frequency: setOnly(), Q: setOnly() }; }
      createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
      createBufferSource() {
        return { ...node(), buffer: null, loop: false, start: (t: number) => { log.push({ type: "noise", freq: 0, at: t }); }, stop: () => {} };
      }
      createOscillator() {
        let first = -1;
        const self = {
          ...node(),
          type: "sine",
          frequency: { value: 0, setValueAtTime: (v: number) => { if (first < 0) first = v; } },
          start: (t: number) => { log.push({ type: self.type, freq: first, at: t }); },
          stop: () => {},
        };
        return self; // no detune param, no ramps, no compressor
      }
    }
    const g = globalThis as { window?: unknown };
    g.window = { AudioContext: MinimalContext, localStorage: { getItem: () => null, setItem: () => {} }, addEventListener: () => {} };
    try {
      unlock();
      expect(isAudioRunning()).toBe(true);
      play("keepRunning");
      expect(log.filter((v) => v.type === "noise").map((v) => v.at)).toEqual([0, 0.05]);
      expect(log.filter((v) => v.type === "triangle")).toEqual([{ type: "triangle", freq: 293.66, at: 0.05 }]);
      play("wrong", { hearts: 2 }); // the taiko glide has no ramp to use either
      expect(log.some((v) => v.type === "sine" && v.freq === 150 && v.at === 0)).toBe(true);
      // Five keepRunning voices are still live, so the taiko's skin is the 8th and
      // the fwip (9th non-ceremony voice) is dropped by the cap: 3 noises in total.
      expect(log.filter((v) => v.type === "noise")).toHaveLength(3);
    } finally {
      for (const c of created) c.state = "closed";
      delete g.window;
    }
  });
});
