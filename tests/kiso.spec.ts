import { test, expect, type Page } from "@playwright/test";
import { CURRICULUM_VERSION, allKanji } from "../src/data";
import { vocabKana } from "../src/lib/words";
import { silenceSavePrompt } from "./helpers/savePrompt";
import { clearRiver } from "./helpers/river";
import { completeDash, dashReady } from "./helpers/dash";

// A complete multi-stage walk, budgeted like the Kodama walks in expedition.spec.ts.
test.setTimeout(240_000);

test.beforeEach(async ({ page }) => {
  await silenceSavePrompt(page);
  await page.clock.install();
  await page.addInitScript((version) => {
    if (sessionStorage.getItem("kanji-dash-guest-v1")) return;
    sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify({
      curriculumVersion: version, selectedLevel: "N4", clearedChapters: [], unlockedChapters: [],
      progress: {}, coins: 0, runsCompleted: 0, streak: { count: 0, last: "" },
    }));
  }, CURRICULUM_VERSION);
});

const saved = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
const VERBS = ["Light the andon", "Rebuild the footbridge", "Climb the misty pass"];

async function reachSite(page: Page, index: number) {
  await page.getByRole("button", { name: "Follow the trail" }).click();
  await page.getByRole("button", { name: VERBS[index] }).click();
  if (await page.getByRole("dialog", { name: "Field notes" }).isVisible())
    await page.getByRole("button", { name: "Ready for the trail" }).click();
  await expect(page.getByTestId(index === 1 ? "crossing-intro" : index === 2 ? "dash-intro" : "forest-word")).toBeVisible();
}

async function answerOpenEncounter(page: Page) {
  let count = 0;
  while (await page.locator(".forest-encounter[open]").isVisible()) {
    expect(count++).toBeLessThan(12);
    const word = (await page.getByTestId("forest-word").innerText()).trim();
    const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === word)!;
    expect(vocab).toBeDefined();
    if (await page.getByLabel("Word reading", { exact: true }).isVisible()) {
      await expect(page.getByRole("heading", { name: "What does the pass remember?" })).toBeVisible();
      await page.getByLabel("Word reading", { exact: true }).fill(vocab.r);
      await page.getByRole("button", { name: "Offer the word" }).click();
    } else {
      const meaning = await page.getByRole("heading", { name: "Every word holds a little light." }).isVisible();
      await page.getByRole("group", { name: "Choose an answer" }).getByText(meaning ? vocab.m : vocabKana(vocab), { exact: true }).click();
    }
    await expect(page.locator(".forest-feedback")).toHaveCount(0);
  }
  return count;
}

test("an N4 learner walks Kiso Post Town end to end and saves exactly one reward and four N4 grades", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("run?mode=expedition", { waitUntil: "domcontentloaded" });
  const canvas = page.locator("canvas[data-ready]");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-area", "kiso");
  await expect(page.getByText("CHAPTER 02 • N4 POST ROAD")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Light the inn’s paper lantern" })).toBeVisible();
  await expect(page.getByText("Rain has washed the post town’s words away.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Follow the trail" })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("kiso-start.png") });

  // The andon: four meanings.
  await reachSite(page, 0);
  let checks = await answerOpenEncounter(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-restored", "1");
  await expect(page.getByRole("heading", { name: "Cross the swollen stream" })).toBeVisible();

  // The footbridge: River of Words over the swollen stream.
  await reachSite(page, 1);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1_000)));
  await page.getByRole("button", { name: "Place the word stones" }).click();
  await expect.poll(async () => {
    await page.clock.runFor(50);
    return page.locator(".river-canvas canvas[data-ready]").count();
  }).toBe(1);
  await clearRiver(page);
  await page.getByRole("button", { name: "Restore the crossing" }).click();
  await page.clock.resume();
  checks += 4;
  await expect(page.locator("canvas")).toHaveAttribute("data-restored", "2");
  await expect(page.getByRole("heading", { name: "Carry light up the misty pass" })).toBeVisible();

  // The misty pass: Lantern Dash, then the shrine's typed recall.
  await reachSite(page, 2);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1_000)));
  await page.getByRole("button", { name: "Begin the lantern dash" }).click();
  await dashReady(page);
  await completeDash(page);
  await page.getByRole("button", { name: "Return to the shrine path" }).click();
  await page.clock.resume();
  await expect(page.locator("canvas")).toHaveAttribute("data-lantern-delivered", "true");
  await expect(page.getByText("The mist parts. Your lantern lights the climb to the shrine.")).toBeVisible();
  checks += 4;
  await page.getByRole("button", { name: "Wake the pass shrine" }).click();
  checks += await answerOpenEncounter(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-restored", "3");
  expect(checks).toBe(14);
  await page.screenshot({ path: info.outputPath("kiso-restored.png") });

  await page.getByRole("button", { name: "View your discoveries" }).click();
  const results = page.getByRole("dialog", { name: "Adventure complete" });
  await expect(results.getByText("KISO POST TOWN · RESTORED")).toBeVisible();
  await expect(results.getByRole("heading", { name: "The pass remembers." })).toBeVisible();

  const save = await saved(page);
  expect(save.selectedLevel).toBe("N4");
  expect(save.coins).toBe(42);
  expect(save.runsCompleted).toBe(1);
  const graded = Object.keys(save.progress);
  expect(graded).toHaveLength(4);
  const n4 = new Set(allKanji.filter((k) => k.ch === 7).map((k) => k.c));
  expect(graded.every((c) => n4.has(c))).toBe(true);
  expect(Object.values(save.progress).map((p: any) => p.correct)).toEqual([1, 1, 1, 1]);
  expect(Object.values(save.progress).reduce((n: number, p: any) => n + p.prod, 0)).toBe(2);
  expect(save.stack.quests.typed).toBe(1);
  expect(errors).toEqual([]);
});

test("Kiso keeps the 320px layout, keyboard travel and reduced-motion rules", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("run?mode=expedition", { waitUntil: "domcontentloaded" });
  const canvas = page.locator("canvas[data-ready]");
  await expect(canvas).toHaveAttribute("data-area", "kiso");
  await expect(page.getByRole("button", { name: "Follow the trail" })).toBeEnabled();
  const before = Number(await canvas.getAttribute("data-player-x"));
  // Kiso starts at the inn on the east side; the road runs west.
  await page.keyboard.down("a");
  await page.waitForTimeout(250);
  await page.keyboard.up("a");
  expect(Number(await canvas.getAttribute("data-player-x"))).toBeLessThan(before - 10);
  await reachSite(page, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
