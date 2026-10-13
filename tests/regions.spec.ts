import { expect, test } from "@playwright/test";
import { completePreparation } from "./helpers/preparation";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

test("short checkpoints open the next focused set immediately and survive reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto("run?mode=runner&gate=13", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "This N5 checkpoint is locked" })).toBeVisible();
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("list", { name: "N5 checkpoints" }).locator(":scope > li")).toHaveCount(19);
  await expect(page.getByText("0 / 19 earned", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" }).first()).toHaveAttribute("href", /gate=1/);
  await page.goto("run?mode=runner&gate=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Words in this run" }).getByRole("button")).toHaveCount(5);
  await completePreparation(page, { advanceClock: true });
  await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(20_000);
  await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
  await expect(page.getByText("Next region open: Counting to Ten · 5 kanji", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Prepare next region", exact: true }).click();
  await expect(page).toHaveURL(/gate=13/);
  await expect(page.getByRole("region", { name: "Words in this run" }).getByRole("button")).toHaveCount(5);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Learn before you run", exact: true })).toBeVisible();
  const save = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(save.curriculumVersion).toBe(2);
  expect(save.clearedChapters).toEqual([1]);
  expect(save.coins).toBe(50);
  expect(Object.keys(save.progress).sort()).toEqual(["一", "二", "三", "四", "五"].sort());
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("1 / 19 earned", { exact: true })).toBeVisible();
  await expect(page.getByText("Region 2 · Next checkpoint", { exact: true })).toBeVisible();
});

test("the whole journey and its region filters fit a narrow phone", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("dialog", { name: "Journey log" }).getByRole("heading", { level: 2 })).toHaveText(["The Kanji Journey", "The N5 Road", "The N4 Road", "The N3 Road", "The N2 Road", "The N1 Road"]);
  await expect(page.getByText("0 / 196 earned", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^N1 / })).toBeDisabled();
  for (const [level, count] of [["N5", 19], ["N4", 36], ["N3", 70], ["N2", 71]] as const) {
    await page.getByRole("button", { name: new RegExp(`^${level} `) }).click();
    const stops = page.getByRole("list", { name: `${level} checkpoints` }).locator(":scope > li");
    await expect(stops).toHaveCount(count);
    // Choosing a road brings its next checkpoint into view, opened.
    await expect(page.getByText("Region 1 · Next checkpoint", { exact: true })).toBeInViewport();
    await expect(stops.first().getByRole("button", { expanded: true })).toHaveCount(1);
    await expect(stops.last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${level.toLowerCase()}-regions.png`) });
  }
  // Any checkpoint opens to show its words; a locked one says how it opens.
  const locked = page.getByRole("list", { name: "N2 checkpoints" }).locator(":scope > li").nth(1);
  await locked.getByRole("button").click();
  await expect(locked.getByText("Region 2 · Locked", { exact: true })).toBeVisible();
  await expect(locked.getByText("Opens when you clear Family & Childhood, or reach 55% mastery progress there.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(0);
  await page.getByRole("button", { name: /^N4 / }).click();
  await page.goto("collection", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^36 / }).click();
  await expect(page.getByRole("status")).toHaveText("5 kanji · Describing Spaces");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
