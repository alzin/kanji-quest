import { expect, test, type Page } from "@playwright/test";
import { kanjiOfLevel, kanjiOfChapter, LEVEL_CHAPTERS } from "../src/data";
import { completePreparation, studyWords } from "./helpers/preparation";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

async function unlockN4(page: Page, reviews = false) {
  await page.addInitScript(({ reviews }) => {
    Math.random = () => 0.999;
    if (sessionStorage.getItem("kanji-dash-guest-v1")) return;
    sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify({
      selectedLevel: "N4", clearedChapters: [1, 2, 3, 4, 5, 6], gatesCleared: 6,
      coins: 300, runsCompleted: 6, streak: { count: 0, last: "" },
      progress: reviews ? { 一: { mastery: 3, due: 0, ivl: 30, ease: 2.5, correct: 6, wrong: 0 } } : {},
    }));
  }, { reviews });
}

test("N4 previews explain the unlock and direct checkpoint links cannot bypass it", async ({ page }) => {
  await page.goto("map", { waitUntil: "domcontentloaded" });
  // Wait for hydration before clicking an SSR-rendered level button.
  await expect(page.getByRole("button", { name: "Save your progress" })).toBeEnabled();
  await page.getByRole("button", { name: /^N4 / }).click();
  await expect(page.getByRole("heading", { name: "The N4 Road", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue the N5 road" })).toBeVisible();
  await page.goto("run?gate=7", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "This N4 checkpoint is locked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learn before you run" })).toHaveCount(0);
  const save = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(save.progress).toEqual({});
  expect(save.coins).toBe(0);
  expect(save.clearedChapters).toEqual([]);
});

test("the selected road persists across home, searchable collection, dojo, and daily preparation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await unlockN4(page, true);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("img", { name: "N4 mastery progress 0%", exact: true })).toBeVisible();
  await expect(page.getByText("1 to review", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Kanji", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`${kanjiOfLevel("N4").length} kanji · All regions`);
  await page.getByRole("button", { name: "Region 1", exact: true }).click();
  await page.getByRole("searchbox").fill("わたし");
  await page.getByRole("button", { name: "私 — I; private · Unseen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close kanji details" }).click();
  await page.getByRole("button", { name: /^N5 / }).click();
  await expect(page.getByRole("status")).toHaveText("96 kanji · All regions");
  await page.getByRole("button", { name: /^N4 / }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /^N4 / })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Dojo", exact: true }).click();
  await expect(page.getByLabel("Trace 本", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("run", { waitUntil: "domcontentloaded" });
  const words = page.getByRole("region", { name: "Words in this run" });
  await expect(words.getByRole("status")).toHaveText("1 / 6 words viewed");
  const before = await page.evaluate(() => sessionStorage.getItem("kanji-dash-guest-v1"));
  await studyWords(page);
  expect(await page.evaluate(() => sessionStorage.getItem("kanji-dash-guest-v1"))).toBe(before);
});

test("an N4 checkpoint prepares, grades, stamps its own seal and only rewards the first clearance", async ({ page }) => {
  await unlockN4(page);
  await page.clock.install();
  await page.goto("run?gate=7", { waitUntil: "domcontentloaded" });
  for (let run = 0; run < 2; run++) {
    await completePreparation(page, { advanceClock: true });
    await expect(page.getByLabel("Kanji runner game")).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
    await page.keyboard.press("ArrowUp");
    await page.clock.fastForward(40_000);
    await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
    expect(saved.clearedChapters).toEqual([...LEVEL_CHAPTERS.N5, 7].sort((a, b) => a - b));
    expect(saved.coins).toBe(350);
    expect(saved.runsCompleted).toBe(7 + run);
    expect(Object.keys(saved.progress)).toHaveLength(kanjiOfChapter(7).length);
    await expect(page.getByRole("link", { name: "Prepare next region", exact: true })).toHaveAttribute("href", /gate=26/);
    if (run === 0) await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.getByRole("button", { name: "Back to map", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The N4 Road", exact: true })).toBeVisible();
  await expect(page.getByText("1 / 36 earned", { exact: true })).toBeVisible();
  await page.goto("run?gate=8", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "This N4 checkpoint is locked" })).toBeVisible();
});

test("the N5 seal opens the N4 road without resetting either level", async ({ page }) => {
  await unlockN4(page);
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^N5 / }).click();
  await expect(page.getByText("JLPT N5 kanji seal earned!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start the N4 road →", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The N4 Road", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(6); // Access to the old first N4 theme is preserved.
  await expect(page.getByText("0 / 36 earned", { exact: true })).toBeVisible();
});
