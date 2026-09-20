import { test, expect, type Page } from "@playwright/test";
import { silenceSavePrompt } from "./helpers/savePrompt";

// Observe real Web Audio nodes, including the audio clock and generated PCM buffers.
function installProbe() {
  const w = window as any;
  w.__musicProbe = { contexts: 0, starts: 0, active: 0, max: 0, gains: [] as number[], silent: 0 };
  const Native = w.AudioContext || w.webkitAudioContext;
  if (!Native) return;
  class ObservedContext extends Native {
    constructor() { super(); w.__musicProbe.contexts++; }
    createGain() {
      const gain = super.createGain(), set = gain.gain.setTargetAtTime.bind(gain.gain);
      gain.gain.setTargetAtTime = (...args: [number, number, number]) => { w.__musicProbe.gains.push(args[0]); return set(...args); };
      return gain;
    }
    createBufferSource() {
      const node = super.createBufferSource();
      const start = node.start.bind(node), stop = node.stop.bind(node);
      let tracked = false;
      const ended = () => { if (tracked) { tracked = false; w.__musicProbe.active--; } };
      node.addEventListener("ended", ended);
      node.start = (...args: number[]) => {
        // SFX noise is shorter than 1 s; music instruments are 1.35–3.2 s.
        if (node.buffer && node.buffer.duration > 1) {
          tracked = true; w.__musicProbe.starts++; w.__musicProbe.active++;
          w.__musicProbe.max = Math.max(w.__musicProbe.max, w.__musicProbe.active);
          if (!node.buffer.getChannelData(0).some((v: number) => Math.abs(v) > .01)) w.__musicProbe.silent++;
        }
        return start(...args);
      };
      node.stop = (...args: number[]) => { ended(); return stop(...args); };
      return node;
    }
  }
  w.AudioContext = ObservedContext; w.webkitAudioContext = ObservedContext;
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { constructor(public text: string) {} } });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    getVoices: () => [], speak: (speech: unknown) => { w.__lastSpeech = speech; }, cancel: () => {},
  } });
}
const probe = (page: Page) => page.evaluate(() => (window as any).__musicProbe as { contexts: number; starts: number; active: number; max: number; gains: number[]; silent: number });
async function start(page: Page) {
  await page.goto("run?mode=expedition");
  await expect(page.getByRole("button", { name: "Follow the trail" })).toBeEnabled();
  await page.getByRole("button", { name: "Follow the trail" }).click();
}
const pause = (page: Page) => page.getByRole("button", { name: "Pause adventure" }).click();
const resume = (page: Page) => page.getByRole("button", { name: "Back to the trail" }).click();
test.beforeEach(async ({ page }) => { await silenceSavePrompt(page); await page.addInitScript(installProbe); });

test("music starts on a gesture, ducks for Japanese, and survives pause without extra contexts", async ({ page }) => {
  test.skip(!await page.evaluate(() => "AudioContext" in window || "webkitAudioContext" in window), "Windows Playwright WebKit has no Web Audio implementation; graceful fallback is tested separately.");
  await page.goto("run?mode=expedition");
  await expect(page.getByRole("button", { name: "Follow the trail" })).toBeEnabled();
  expect((await probe(page)).contexts).toBe(0);
  await page.getByRole("button", { name: "Open field notes" }).click();
  await expect.poll(async () => (await probe(page)).starts).toBeGreaterThan(0);
  await expect.poll(async () => (await probe(page)).gains.at(-1)).toBe(.045);
  await page.evaluate(() => (window as any).__lastSpeech.onend());
  await expect.poll(async () => (await probe(page)).gains.at(-1)).toBe(.3);
  await page.getByRole("button", { name: "Ready for the trail" }).click();
  await pause(page);
  await expect.poll(async () => (await probe(page)).active).toBe(0);
  const paused = (await probe(page)).starts;
  await page.waitForTimeout(400); expect((await probe(page)).starts).toBe(paused);
  await resume(page);
  await expect.poll(async () => (await probe(page)).starts).toBeGreaterThan(paused);
  expect((await probe(page)).contexts).toBe(1); expect((await probe(page)).silent).toBe(0);
  expect((await probe(page)).max).toBeLessThanOrEqual(32);
  await pause(page);
  await page.getByRole("link", { name: "Leave unfinished adventure" }).click();
  await expect.poll(async () => (await probe(page)).active).toBe(0);
  const stopped = (await probe(page)).starts;
  await page.waitForTimeout(400); expect((await probe(page)).starts).toBe(stopped);
});

test("music mute persists separately from effects and master mute silences both", async ({ page }) => {
  test.skip(!await page.evaluate(() => "AudioContext" in window || "webkitAudioContext" in window), "Windows Playwright WebKit has no Web Audio implementation; graceful fallback is tested separately.");
  await start(page); await expect.poll(async () => (await probe(page)).starts).toBeGreaterThan(0);
  await pause(page);
  await page.getByRole("button", { name: "Mute background music" }).click();
  await expect(page.getByRole("button", { name: "Mute sounds", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => localStorage.getItem("kanji-dash-music"))).toBe("off");
  await resume(page); await expect.poll(async () => (await probe(page)).active).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Follow the trail" })).toBeEnabled();
  await pause(page);
  await expect(page.getByRole("button", { name: "Enable background music" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Enable background music" }).click();
  await resume(page); await expect.poll(async () => (await probe(page)).starts).toBeGreaterThan(0);
  await pause(page); await page.getByRole("button", { name: "Mute sounds", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mute background music" })).toHaveAttribute("aria-pressed", "false");
  await resume(page); await expect.poll(async () => (await probe(page)).active).toBe(0);
  await pause(page); await page.getByRole("button", { name: "Unmute sounds", exact: true }).click();
  await resume(page); await expect.poll(async () => (await probe(page)).active).toBeGreaterThan(0);
  expect((await probe(page)).contexts).toBe(1);
});

test("a hidden page stops the soundtrack and waits for the player to resume", async ({ page }) => {
  test.skip(!await page.evaluate(() => "AudioContext" in window || "webkitAudioContext" in window), "Windows Playwright WebKit has no Web Audio implementation; graceful fallback is tested separately.");
  await start(page); await expect.poll(async () => (await probe(page)).starts).toBeGreaterThan(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(async () => (await probe(page)).active).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByRole("dialog", { name: "Adventure paused" })).toBeVisible();
  await resume(page); await expect.poll(async () => (await probe(page)).active).toBeGreaterThan(0);
});

test("an unsupported audio device still offers a playable trail and saved music controls", async ({ page }) => {
  await page.addInitScript(() => { delete (window as any).AudioContext; delete (window as any).webkitAudioContext; });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await start(page); await expect(page.locator("canvas[data-player-x]")).toBeVisible();
  await pause(page); await page.getByRole("button", { name: "Mute background music" }).click();
  await page.reload(); await expect(page.getByRole("button", { name: "Follow the trail" })).toBeEnabled();
  await pause(page); await expect(page.getByRole("button", { name: "Enable background music" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
