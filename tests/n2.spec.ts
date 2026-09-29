import { expect, test } from "@playwright/test";
import { completePreparation } from "./helpers/preparation";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

test("a new N2 learner studies, earns a checkpoint seal and reloads without earlier seals", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.clock.install();
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Save your progress" })).toBeEnabled();
  await page.getByRole("button", { name: /^N2 / }).click();
  await expect(page.getByRole("heading", { name: "The N2 Road", exact: true })).toBeVisible();
  await expect(page.getByText("0 / 71 earned", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(1);
  await page.goto("run?mode=runner&gate=126", { waitUntil: "domcontentloaded" });
  for (let run = 0; run < 2; run++) {
    await completePreparation(page, { advanceClock: true });
    await expect(page.getByLabel("Kanji runner game")).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
    await page.keyboard.press("ArrowUp");
    await page.clock.fastForward(40_000);
    await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
    const save = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
    expect(save.selectedLevel).toBe("N2");
    expect(save.clearedChapters).toEqual([126]);
    expect(save.coins).toBe(50);
    expect(save.runsCompleted).toBe(run + 1);
    expect(Object.keys(save.progress)).toHaveLength(5);
    await expect(page.getByRole("link", { name: "Prepare next region", exact: true })).toHaveAttribute("href", /gate=127/);
    if (run === 0) await page.reload({ waitUntil: "domcontentloaded" });
  }
});

test("later N2 checkpoints remain locked within the road", async ({ page }) => {
  for (const mode of ["runner", "stack"]) {
    await page.goto(`run?mode=${mode}&gate=127`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "This N2 checkpoint is locked" })).toBeVisible();
    await expect(page.getByText(/Earn all .*seals first/)).toHaveCount(0);
  }
});
