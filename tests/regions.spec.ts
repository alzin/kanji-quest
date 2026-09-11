import { expect, test } from "@playwright/test";
import { completePreparation } from "./helpers/preparation";

test("short checkpoints open the next focused set immediately and survive reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto("run?gate=13", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "This N5 checkpoint is locked" })).toBeVisible();
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(19);
  await expect(page.getByText("0 / 19 earned", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Prepare checkpoint" }).first().click();
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

test("both road maps and their region filters fit a narrow phone", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("map", { waitUntil: "domcontentloaded" });
  for (const [level, count] of [["N5", 19], ["N4", 36]] as const) {
    await page.getByRole("button", { name: new RegExp(`^${level} `) }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(count);
    await expect(page.getByText(`Region ${count}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${level.toLowerCase()}-regions.png`) });
    await page.getByRole("heading", { level: 2 }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${level.toLowerCase()}-first-region.png`) });
  }
  await page.getByRole("link", { name: "Kanji", exact: true }).click();
  await page.getByRole("button", { name: "Region 36", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("5 kanji · Describing Spaces");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
