import { completePreparation } from "./helpers/preparation";
import { expect, test, type Page } from "@playwright/test";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

type VoiceLog = { type: string; freq: number; at: number };

// A recorder in place of Web Audio: every source node logs its start so the
// tests can read the planned voices without a real audio thread.
function installAudioRecorder() {
  const w = window as any;
  w.__sfxLog = [] as VoiceLog[];
  w.__ctxCount = 0;
  const param = (log?: (value: number) => void) => ({
    value: 0,
    setValueAtTime(value: number) { log?.(value); return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });
  const node = (extra: Record<string, unknown> = {}) => ({
    connect() { return this; },
    disconnect() {},
    ...extra,
  });
  class RecorderContext {
    state = "running";
    currentTime = 0;
    sampleRate = 48000;
    destination = {};
    onstatechange: null | (() => void) = null;
    constructor() { w.__ctxCount += 1; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() { return node({ gain: param() }); }
    createBiquadFilter() { return node({ type: "lowpass", frequency: param(), Q: param(), gain: param(), detune: param() }); }
    createDynamicsCompressor() {
      return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), reduction: 0 });
    }
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    }
    createBufferSource() {
      return node({
        buffer: null,
        loop: false,
        onended: null,
        start(at = 0) { w.__sfxLog.push({ type: "noise", freq: 0, at }); },
        stop() {},
      });
    }
    createOscillator() {
      let freq: number | null = null;
      const osc = node({
        type: "sine",
        frequency: param((value) => { if (freq === null) freq = value; }),
        detune: param(),
        onended: null,
        start(at = 0) { w.__sfxLog.push({ type: (osc as any).type, freq: freq ?? 0, at }); },
        stop() {},
      });
      return osc;
    }
  }
  w.AudioContext = RecorderContext;
  w.webkitAudioContext = RecorderContext;
}

async function prepare(page: Page) {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.addInitScript(installAudioRecorder);
  // Identity shuffles put each answer in the top lane, as in runner.spec.ts.
  await page.addInitScript(() => { Math.random = () => 0.999; });
}

async function startRun(page: Page, url = "run", pauseClock = false) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await completePreparation(page, { advanceClock: pauseClock, pauseClock });
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
}

const readLog = (page: Page) => page.evaluate(() => (window as any).__sfxLog as VoiceLog[]);
const ctxCount = (page: Page) => page.evaluate(() => (window as any).__ctxCount as number);

test("correct answers climb the pentatonic ladder", async ({ page }) => {
  await prepare(page);
  await startRun(page);
  await page.keyboard.press("ArrowUp"); // keydown is the activation that unlocks audio
  for (let gate = 0; gate < 5; gate++) await page.clock.fastForward(3_500);
  await expect(page.getByRole("heading", { name: "Run complete!", exact: true })).toBeVisible();
  await expect(page.getByText("Score", { exact: true }).locator("..").getByText("1,500", { exact: true })).toBeVisible();

  const log = await readLog(page);
  expect(await ctxCount(page)).toBe(1);
  // Only the pluck fundamentals at the answer moment (combo >= 5 adds a second pluck at +0.06 s);
  // the sixth triangle at offset 0 is the run-complete arpeggio's first note.
  const triangles = log.filter((voice) => voice.type === "triangle" && voice.at < 0.001).map((voice) => voice.freq);
  expect(triangles.length).toBeGreaterThanOrEqual(6);
  expect(triangles[5]).toBeCloseTo(587.33, 2);
  const ladder = triangles.slice(0, 5);
  for (const [index, expected] of [293.66, 329.63, 392, 440, 493.88].entries()) {
    expect(ladder[index]).toBeCloseTo(expected, 2);
  }
  expect(log.some((voice) => voice.type === "sine" && voice.freq === 150)).toBe(false);
});

test("a miss schedules the taiko and the paper fwip, the third miss adds the temple bell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await prepare(page);
  await startRun(page, "run", true);
  // No steering: a lane-neutral key is still a user activation that unlocks audio,
  // and the runner then misses every gate on its own.
  await page.keyboard.press("Shift");
  expect(await ctxCount(page)).toBe(1);

  for (let miss = 1; miss <= 3; miss++) {
    await page.clock.fastForward(100_000);
    if (miss < 3) {
      await expect(page.getByRole("button", { name: "Keep running", exact: true })).toBeVisible();
      await expect(page.getByText(`${5 - miss} left`, { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Run ended", exact: true })).toBeVisible();
    }
    const log = await readLog(page);
    const taiko = log.filter((voice) => voice.type === "sine" && voice.freq === 150);
    expect(taiko).toHaveLength(miss);
    const fwip = log.filter((voice) => voice.type === "noise" && Math.abs(voice.at - 0.2) < 0.001);
    expect(fwip.length).toBeGreaterThanOrEqual(miss);
    // The temple bell sounds once per run, at +0.35 s of the miss that leaves the last heart.
    const bell = log.filter((voice) => voice.type === "sine" && voice.freq === 196);
    expect(bell).toHaveLength(miss >= 2 ? 1 : 0);
    if (miss >= 2) expect(Math.abs(bell[0]!.at - 0.35)).toBeLessThan(0.001);
    if (miss === 3) break;

    // Advance frames through the lesson entrance before testing its button.
    await page.clock.runFor(1_000);
    const plucksBefore = log.filter((voice) => voice.type === "triangle" && Math.abs(voice.freq - 293.66) < 0.01).length;
    await page.getByRole("button", { name: "Keep running", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keep running", exact: true })).toHaveCount(0);
    const after = await readLog(page);
    // "Keep running": the exhale noise plus a D4 root-note pluck 50 ms later.
    const plucks = after.filter((voice) => voice.type === "triangle" && Math.abs(voice.freq - 293.66) < 0.01);
    expect(plucks).toHaveLength(plucksBefore + 1);
    expect(Math.abs(plucks[plucks.length - 1]!.at - 0.05)).toBeLessThan(0.001);
  }
  await expect(page.getByRole("heading", { name: "Run ended", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mute persists under its own key and creates no context", async ({ page }) => {
  await prepare(page);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Save your progress" })).toBeEnabled();
  const saveBefore = await page.evaluate(() => sessionStorage.getItem("kanji-dash-guest-v1"));
  const mute = page.getByRole("button", { name: "Mute sounds", exact: true });
  await expect(mute).toBeVisible();
  await mute.click();
  await expect(page.getByRole("button", { name: "Unmute sounds", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("kanji-dash-sound"))).toBe("off");
  expect(await page.evaluate(() => sessionStorage.getItem("kanji-dash-guest-v1"))).toBe(saveBefore);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Unmute sounds", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await ctxCount(page)).toBe(0);

  // Check the HUD before this short checkpoint finishes.
  await startRun(page, "run?gate=1");
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(1_000);
  expect(await readLog(page)).toEqual([]);
  expect(await ctxCount(page)).toBe(0);

  const unmute = page.getByRole("button", { name: "Unmute sounds", exact: true });
  await expect(unmute).toBeVisible();
  await unmute.click();
  await expect(page.getByRole("button", { name: "Mute sounds", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await ctxCount(page)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("kanji-dash-sound"))).toBe("on");
  const log = await readLog(page);
  expect(log.length).toBeGreaterThan(0);
  expect(log.some((voice) => voice.type === "sine" && voice.freq === 1050)).toBe(true); // the clapper "kon"
});
