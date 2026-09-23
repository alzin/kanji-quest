import { expect, test } from "@playwright/test";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

for (const route of ["camp", "map", "collection", "practice"] as const) {
  test(`a new learner can switch N4/N3 on ${route} and keep the selection after reload`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Save your progress" })).toBeEnabled();
    for (const [level, count, first] of [["N4", 189, "本"], ["N3", 341, "夫"]] as const) {
      const tab = page.getByRole("button", { name: new RegExp(`^${level} `) });
      await expect(tab).toBeEnabled();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-pressed", "true");
      if (route === "camp") {
        await expect(page.getByTestId("mastery-summary")).toHaveText(`0/${count} mastered · 0% mastery progress`);
        await expect(page.getByText(`Browsing ${level}. Your daily adventure continues on N5 until you earn the required seals.`)).toBeVisible();
      } else if (route === "map") {
        await expect(page.getByRole("heading", { name: `The ${level} Road`, exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Prepare checkpoint" })).toHaveCount(0);
      } else if (route === "collection") {
        await expect(page.getByRole("status")).toHaveText(`${count} kanji · All regions`);
      } else {
        await expect(page.getByLabel(`Trace ${first}`, { exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Learn today’s N5 words", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Next kanji", exact: true }).click();
        await expect(page.getByText(`2 / ${count}`, { exact: true })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^N3 / })).toHaveAttribute("aria-pressed", "true");
    const save = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
    expect(save.selectedLevel).toBe("N3");
    expect(save.clearedChapters).toEqual([]);
    expect(save.coins).toBe(0);
    await page.getByRole("link", { name: "Dojo", exact: true }).click();
    await expect(page.getByLabel("Trace 夫", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
