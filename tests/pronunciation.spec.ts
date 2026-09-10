import { expect, test } from "@playwright/test";
import { completePreparation } from "./helpers/preparation";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: { text: string; lang: string; voice: string }[] = [];
    (window as any).__speechLog = log;
    (window as any).__speechCancels = 0;
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
      text: string;
      constructor(text: string) { this.text = text; }
    } });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ lang: "en-US", name: "English" }, { lang: "ja-JP", name: "Japanese" }],
      speak: (u: SpeechSynthesisUtterance) => log.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? "" }),
      cancel: () => { (window as any).__speechCancels++; },
    } });
    Math.random = () => 0.999;
  });
});

test("preparation speaks exact kana, replays, and respects saved mute", async ({ page }) => {
  await page.goto("run");
  const reading = await page.getByTestId("study-reading").textContent();
  await expect.poll(() => page.evaluate(() => (window as any).__speechLog.at(-1))).toEqual({ text: reading, lang: "ja-JP", voice: "Japanese" });
  const count = await page.evaluate(() => (window as any).__speechLog.length);
  await page.getByRole("button", { name: "Replay Japanese pronunciation" }).click();
  expect(await page.evaluate(() => (window as any).__speechLog.length)).toBe(count + 1);
  const cancels = await page.evaluate(() => (window as any).__speechCancels);
  await page.getByRole("button", { name: "Mute Japanese voice", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__speechCancels)).toBeGreaterThan(cancels);
  await expect(page.getByRole("button", { name: "Mute sounds", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("region", { name: "Words in this run" }).getByRole("button").nth(1).click();
  expect(await page.evaluate(() => (window as any).__speechLog.length)).toBe(count + 1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Replay Japanese pronunciation" })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__speechLog.length)).toBe(0);
  await expect(page.getByRole("button", { name: "Mute sounds", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Mute sounds", exact: true }).click();
  await page.getByRole("button", { name: "Unmute Japanese voice", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__speechLog.length)).toBe(1);
  await expect(page.getByRole("button", { name: "Unmute sounds", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("region", { name: "Words in this run" }).getByRole("button").nth(1).click();
  await expect.poll(() => page.evaluate(() => (window as any).__speechLog.length)).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Replay Japanese pronunciation" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__speechLog.length)).toBe(1);
  await expect(page.getByRole("button", { name: "Unmute sounds", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("run speaks active gates and cancels speech on pause", async ({ page }) => {
  await page.clock.install();
  await page.goto("run");
  await completePreparation(page, { advanceClock: true });
  await page.evaluate(() => { (window as any).__speechLog.length = 0; });
  await page.clock.runFor(500);
  await expect.poll(() => page.evaluate(() => (window as any).__speechLog.length)).toBeGreaterThan(0);
  const cancels = await page.evaluate(() => (window as any).__speechCancels);
  await page.getByRole("button", { name: "Pause game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replay Japanese pronunciation" })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__speechCancels)).toBeGreaterThan(cancels);
  const count = await page.evaluate(() => (window as any).__speechLog.length);
  await page.clock.fastForward(5000);
  expect(await page.evaluate(() => (window as any).__speechLog.length)).toBe(count);
  await page.getByRole("button", { name: "Resume game", exact: true }).click();
  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => (window as any).__speechLog.length)).toBeGreaterThan(count + 1);
});
