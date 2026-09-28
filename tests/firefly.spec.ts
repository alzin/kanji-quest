import { expect, test, type Page } from "@playwright/test";
import { GATES_PER_ADVENTURE } from "../src/lib/firefly-catalog";
import { INTRO_SLOW, PACE } from "../src/components/game/firefly/simulation";
import { allVocab, correctReadings } from "../src/lib/words";
import { beginFirefly, clickToFireflyReady, inspectFirefly, savedFirefly, steerFirefly, travel, type FireflyInspection } from "./helpers/firefly";

const stubSpeech = (page: Page) => page.addInitScript(() => {
  (window as any).__spokenFirefly = [];
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { volume = 1; constructor(public text: string) {} } });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [], speak: (u: { text: string; volume: number }) => { if (u.volume > 0) (window as any).__spokenFirefly.push(u.text); }, cancel() {} } });
});
const distinctWords = (s: FireflyInspection) => new Set(s.recalls.map(r => r.word)).size;

test("one-click launch supports keys, lane taps, swipes, Burst, pause, blur and 320px reduced motion", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const launchMilliseconds = await beginFirefly(page, { known: true });
  await page.keyboard.press("1");
  expect((await inspectFirefly(page)).lane).toBe(0);
  await page.keyboard.press("d");
  expect((await inspectFirefly(page)).lane).toBe(1);
  await page.keyboard.press("ArrowRight");
  expect((await inspectFirefly(page)).lane).toBe(2);
  await page.getByRole("button", { name: "Move left", exact: true }).click();
  expect((await inspectFirefly(page)).lane).toBe(1);
  const field = page.locator(".ff-canvas");
  let box = (await field.boundingBox())!;
  await field.click({ position: { x: box.width * .2, y: box.height * .62 } });
  expect((await inspectFirefly(page)).lane).toBe(0);
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .62);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .62, { steps: 4 });
  await page.mouse.up();
  expect((await inspectFirefly(page)).lane).toBe(1);
  await page.keyboard.press("Space");
  expect((await inspectFirefly(page)).charges).toBe(0);
  await travel(page, 600);
  await expect(page.getByTestId("ff-call")).toHaveAttribute("data-mode", /reading|listen/);
  await page.screenshot({ path: info.outputPath("firefly-running.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Adventure paused" })).toBeVisible();
  const frozen = await inspectFirefly(page);
  await travel(page, 3000);
  await page.keyboard.press("ArrowLeft");
  expect(await inspectFirefly(page)).toEqual(frozen);
  await page.getByRole("button", { name: /Back to the trail/ }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("dialog", { name: "Adventure paused" })).toBeVisible();
  // Match a real return to the tab: Phaser has its own window-focus listener.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: /Back to the trail/ }).click();
  const beforeResume = (await inspectFirefly(page)).elapsed;
  await page.clock.runFor(150);
  expect((await inspectFirefly(page)).elapsed).toBeGreaterThan(beforeResume);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      await page.clock.runFor(50);
      const hostBounds = (await field.boundingBox())!;
      const canvasBounds = (await field.locator("canvas").boundingBox())!;
      return Math.abs(hostBounds.width - canvasBounds.width) <= 1 && Math.abs(hostBounds.height - canvasBounds.height) <= 1;
    }).toBe(true);
    // Resizing clears the WebGL buffer; render the settled layout before visual QA.
    await page.clock.runFor(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator(".ff-controls button, .ff-pause").all()) {
      const b = (await button.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    box = (await field.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    const call = (await page.getByTestId("ff-call").boundingBox())!, controls = (await page.locator(".ff-controls").boundingBox())!;
    expect(call.x).toBeGreaterThanOrEqual(box.x);
    expect(call.x + call.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(call.y + call.height).toBeLessThan(controls.y);
    const canvasBox = (await field.locator("canvas").boundingBox())!;
    expect(canvasBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(canvasBox.width).toBeCloseTo(box.width, 0);
    expect(canvasBox.height).toBeCloseTo(box.height, 0);
    await page.screenshot({ path: info.outputPath(`firefly-${viewport.width}.png`) });
  }
  expect(launchMilliseconds).toBeLessThan(5000);
  expect(errors).toEqual([]);
});

for (const first of ["grove", "bramble"] as const) for (const second of ["bridge", "moonpath"] as const) {
  test(`steers through every word gate, rescues companions and delivers via ${first}/${second}, then immediately replays`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    const pointer = first === "bramble";
    await beginFirefly(page, { known: true });
    const before = await savedFirefly(page);
    const { state } = await steerFirefly(page, { trails: [first, second], pointer });
    expect(state.phase).toBe("delivery");
    expect(state.elapsed).toBe(90);
    expect(state.hearts).toBe(3);
    expect([state.gatesResolved, state.gatesCorrect]).toEqual([GATES_PER_ADVENTURE, GATES_PER_ADVENTURE]);
    expect(state.trails).toEqual([first, second]);
    expect(state.rescued.length).toBe(6 + Number(first === "bramble") + Number(second === "moonpath"));
    const terminalSave = await savedFirefly(page);
    expect(terminalSave.runsCompleted).toBe(1);
    expect(terminalSave.runner.rescued.length).toBe(state.rescued.length);
    expect(terminalSave.runner.best.N5.standard).toBe(state.score);
    await page.clock.runFor(250);
    await page.screenshot({ path: info.outputPath(`delivery-${first}-${second}.png`) });
    await travel(page, 1900);
    await expect(page.getByRole("dialog", { name: "Adventure results" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Every light has a home." })).toBeVisible();
    await expect(page.getByTestId("ff-word-row")).toHaveCount(distinctWords(state));
    const saved = await savedFirefly(page);
    expect(saved.progress).toEqual(before.progress);
    expect(saved.runsCompleted).toBe(1);
    expect(saved.coins).toBe(0);
    expect(saved.runner.rescued.length).toBe(state.rescued.length);
    expect(saved.runner.best.N5.standard).toBe(state.score);
    await travel(page, 5000);
    expect(await savedFirefly(page)).toEqual(saved);
    await page.screenshot({ path: info.outputPath(`results-${first}-${second}.png`) });
    expect(await clickToFireflyReady(page, page.getByRole("button", { name: /^Run again/ }))).toBeLessThan(3000);
    expect((await inspectFirefly(page)).elapsed).toBeLessThan(1);
    expect((await inspectFirefly(page)).rescued).toEqual([]);
    expect((await inspectFirefly(page)).trails).toEqual([]);
    expect((await inspectFirefly(page)).recalls).toEqual([]);
    if (first === "grove" && second === "bridge") {
      await page.getByRole("button", { name: "Pause adventure" }).click();
      await page.getByRole("button", { name: "Leave this adventure" }).click();
      await page.getByRole("button", { name: /Spirit journal/ }).click();
      const journal = page.getByRole("dialog", { name: "Spirit journal" });
      await expect(journal.getByText("6 of 9 woodland friends found.", { exact: false })).toBeVisible();
      await journal.getByRole("button", { name: /River glass/ }).click();
      await expect(journal.getByRole("button", { name: /River glass/ })).toHaveAttribute("aria-pressed", "true");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "Light the lantern" })).toBeEnabled();
      const reloaded = await savedFirefly(page);
      expect(reloaded.runner.rescued).toEqual(saved.runner.rescued);
      expect(reloaded.runner.best).toEqual(saved.runner.best);
      expect(reloaded.runner.equippedLantern).toBe("azure");
      expect(reloaded.runsCompleted).toBe(1);
    }
    expect(errors).toEqual([]);
  });
}

test("the lantern call and its spoken paths are enough to answer with the number keys", async ({ page }) => {
  await beginFirefly(page, { known: true });
  const { state } = await steerFirefly(page, { until: s => s.gate?.mode === "reading" && s.gate.lead > 1.5 });
  const call = page.getByTestId("ff-call");
  await expect(call).toHaveAttribute("data-mode", "reading");
  const word = await call.locator(".ff-call-word").evaluate(element => {
    const visible = element.cloneNode(true) as HTMLElement;
    visible.querySelectorAll("rt").forEach(annotation => annotation.remove());
    return visible.textContent!;
  });
  const paths = await page.locator(".sr-only[aria-live]").textContent();
  const labels = [1, 2, 3].map(n => new RegExp(`[Pp]ath ${n} ([^,.]+)`).exec(paths!)![1]!.trim());
  const lane = labels.findIndex(label => correctReadings(word).has(label));
  expect(lane, `${word} among ${labels.join(" / ")}`).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(String(lane + 1));
  await travel(page, Math.ceil(state.gate!.lead / state.pace * 1000) + 200);
  const after = await inspectFirefly(page);
  expect(after.recalls.at(-1)).toMatchObject({ word, correct: true });
  await expect(page.getByTestId("ff-echo")).toContainText(word);
});

test("a wrong gate keeps every heart, speaks the correction, brings the word back and never moves practice reviews", async ({ page }, info) => {
  await stubSpeech(page);
  await beginFirefly(page, { known: true });
  const before = await savedFirefly(page);
  const { state } = await steerFirefly(page, { miss: [1], until: s => s.gatesResolved >= 5 });
  const miss = state.recalls[1]!;
  expect(miss.correct).toBe(false);
  expect(state.hearts).toBe(3);
  expect(state.recalls.slice(2, 4).some(r => r.word === miss.word)).toBe(true);
  const kana = allVocab.find(card => card.vocab.w === miss.word)!.kana;
  expect(await page.evaluate(() => (window as any).__spokenFirefly)).toContain(kana);
  expect(state.graded).toBe(0);
  expect((await savedFirefly(page)).progress).toEqual(before.progress);
  await page.screenshot({ path: info.outputPath("missed-word.png") });
});

test("fresh words are introduced slowly, recalled later and keep learning when the adventure is abandoned", async ({ page }) => {
  await beginFirefly(page);
  await travel(page, 500);
  await expect(page.getByTestId("ff-call")).toHaveAttribute("data-mode", "intro");
  const introduced = await inspectFirefly(page);
  await travel(page, 1000);
  expect((await inspectFirefly(page)).elapsed - introduced.elapsed).toBeCloseTo(INTRO_SLOW * PACE.standard.start, 1);
  const { state } = await steerFirefly(page, { until: s => s.graded >= 1 });
  const graded = state.recalls.find(r => r.graded)!;
  const intro = state.recalls.find(r => r.kanji === graded.kanji && r.mode === "intro")!;
  expect(graded.gate - intro.gate).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Pause adventure" }).click();
  await page.getByRole("button", { name: "Leave this adventure" }).click();
  await expect(page.getByRole("main", { name: "Firefly Rescue" })).toBeVisible();
  const save = await savedFirefly(page);
  expect(Object.keys(save.progress)).toEqual([graded.kanji]);
  expect(save.coins).toBe(0);
  expect(save.runsCompleted).toBe(0);
  expect(save.runner.rescued).toEqual([]);
});

test("failure keeps the score but not undelivered spirits, lists only met words, and guest replay has no save interruption", async ({ page }, info) => {
  await beginFirefly(page, { known: true, savePrompt: true });
  const { state } = await steerFirefly(page, { lose: true });
  expect(state.phase).toBe("lost");
  expect(state.rescued.length).toBeGreaterThan(0);
  await travel(page, 800);
  await expect(page.getByRole("heading", { name: "Rest your lantern." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep your progress" })).toHaveCount(0);
  await expect(page.getByTestId("ff-word-row")).toHaveCount(distinctWords(state));
  const save = await savedFirefly(page);
  expect(save.runner.rescued).toEqual([]);
  expect(save.runner.best.N5.standard).toBe(state.score);
  expect(save.runsCompleted).toBe(1);
  await page.screenshot({ path: info.outputPath("failed-rescue.png") });
  expect(await clickToFireflyReady(page, page.getByRole("button", { name: /^Run again/ }))).toBeLessThan(3000);
  expect((await inspectFirefly(page)).hearts).toBe(3);
  expect((await inspectFirefly(page)).rescued).toEqual([]);
  await page.getByRole("button", { name: "Pause adventure" }).click();
  await page.getByRole("button", { name: "Leave this adventure" }).click();
  await page.getByRole("link", { name: "← Camp", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Keep your progress" })).toBeVisible();
});

test("gentle journey exposes five hearts and progresses at 80 percent speed", async ({ page }) => {
  await beginFirefly(page, { known: true, gentle: true });
  await expect(page.getByLabel("5 of 5 hearts")).toBeVisible();
  const before = await inspectFirefly(page);
  await travel(page, 2000);
  const after = await inspectFirefly(page);
  expect(after.elapsed - before.elapsed).toBeGreaterThan(1.5);
  expect(after.elapsed - before.elapsed).toBeLessThan(1.7);
});
