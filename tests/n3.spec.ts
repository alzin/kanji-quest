import { expect, test, type Page } from "@playwright/test";
import { CURRICULUM_VERSION, LEVEL_CHAPTERS } from "../src/data";
import { completePreparation } from "./helpers/preparation";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

async function unlockN3(page: Page) {
  await page.addInitScript(({ version, seals }) => {
    Math.random = () => 0.999;
    if (sessionStorage.getItem("kanji-dash-guest-v1")) return;
    sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify({ curriculumVersion: version,
      selectedLevel: "N3", clearedChapters: seals, gatesCleared: seals.length, unlockedChapters: [],
      progress: {}, coins: 300, runsCompleted: 55, streak: { count: 0, last: "" } }));
  }, { version: CURRICULUM_VERSION, seals: [...LEVEL_CHAPTERS.N5, ...LEVEL_CHAPTERS.N4] });
}

test("N3 can be previewed but direct runner and stack checkpoint links stay locked", async ({ page }) => {
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Save your progress" })).toBeEnabled();
  await page.getByRole("button", { name: /^N3 / }).click();
  await expect(page.getByRole("heading", { name: "The N3 Road", exact: true })).toBeVisible();
  await expect(page.getByText("Earn all 36 N4 checkpoint seals to unlock N3 lessons and runs.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue the N4 road" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(0);
  for (const mode of ["runner", "stack"]) {
    await page.goto(`run?mode=${mode}&gate=56`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "This N3 checkpoint is locked" })).toBeVisible();
  }
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!).coins)).toBe(0);
});

test("N4 completion opens N3 and its selection persists through collection, dojo and home", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await unlockN3(page);
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Save your progress" })).toBeEnabled();
  await page.getByRole("button", { name: /^N4 / }).click();
  await expect(page.getByText("JLPT N4 kanji seal earned!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start the N3 road →", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The N3 Road", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.grid[aria-hidden="true"]').evaluate((grid) => {
    const bounds = grid.getBoundingClientRect();
    return [...grid.children].every((seal) => {
      const rect = seal.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    });
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("n3-map.png") });
  await page.getByRole("link", { name: "Kanji", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("341 kanji · All regions");
  await page.getByRole("searchbox").fill("夫");
  await page.getByRole("button", { name: /^夫 —/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close kanji details" }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /^N3 / })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Dojo", exact: true }).click();
  await expect(page.getByLabel("Trace 夫", { exact: true })).toBeVisible();
  await page.goto("camp", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mastery-summary")).toHaveText("0/341 mastered · 0% mastery progress");
});

test("N3 checkpoint rewards once, retains its seal, and opens the next region", async ({ page }) => {
  await unlockN3(page);
  await page.clock.install();
  await page.goto("run?mode=runner&gate=56", { waitUntil: "domcontentloaded" });
  for (let run = 0; run < 2; run++) {
    await completePreparation(page, { advanceClock: true });
    await expect(page.getByLabel("Kanji runner game")).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
    await page.keyboard.press("ArrowUp");
    await page.clock.fastForward(40_000);
    await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
    expect(saved.clearedChapters).toEqual([...LEVEL_CHAPTERS.N5, ...LEVEL_CHAPTERS.N4, 56].sort((a,b) => a-b));
    expect(saved.coins).toBe(350);
    expect(saved.runsCompleted).toBe(56 + run);
    expect(Object.keys(saved.progress)).toHaveLength(5);
    await expect(page.getByRole("link", { name: "Prepare next region", exact: true })).toHaveAttribute("href", /gate=57/);
    if (run === 0) await page.reload({ waitUntil: "domcontentloaded" });
  }
});
