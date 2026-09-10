import { expect, test } from "@playwright/test";
import { studyWords, recallWords } from "./helpers/preparation";

test("requires every word and both recall checks without grading preparation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto("run", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Learn before you run" })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem("kanji-dash-v1"));
  await expect(page.getByRole("button", { name: "Check my recall" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Start run", exact: true })).toHaveCount(0);
  await page.clock.fastForward(100_000);
  await expect(page.getByLabel("Kanji runner game")).toHaveCount(0);

  // Browsing alone does not mark a word studied, and writing is available before a run.
  const list = page.getByRole("region", { name: "Words in this run" });
  await list.getByRole("button").last().click();
  await expect(list.getByRole("status")).toHaveText("0 / 5 words studied");
  await list.getByRole("button").first().click();
  await page.getByRole("button", { name: "Practice writing this kanji" }).click();
  await expect(page.getByLabel("Trace 一", { exact: true })).toBeVisible();
  await expect(page.locator('canvas[aria-hidden="true"]')).toHaveCSS("opacity", "0.2");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Close writing practice" }).click();

  const answers = await studyWords(page);
  const recall = page.getByRole("region", { name: "Recall check" });
  await expect(recall.locator("ruby")).toHaveCount(0);
  const choices = recall.getByRole("button");
  for (let i = 0; i < 3; i++) {
    if ((await choices.nth(i).textContent()) !== answers[0]!.reading) { await choices.nth(i).click(); break; }
  }
  await expect(recall.getByRole("status")).toContainText("Let’s learn that once more.");
  await page.clock.fastForward(2_000);
  await expect(page.getByText("Check 1 of 10", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try this word again" })).toHaveCount(0);
  await expect(recall.getByRole("button", { name: answers[0]!.reading, exact: true })).toBeEnabled();

  // A correct retry advances automatically, and leaving cancels the pending advance.
  await recall.getByRole("button", { name: answers[0]!.reading, exact: true }).click();
  await expect(recall.getByRole("status")).toContainText("Correct.");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await expect(recall.getByRole("button", { name: answers[0]!.reading, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back to word list", exact: true }).click();
  await page.clock.fastForward(2_000);
  await expect(page.getByRole("heading", { name: "Learn before you run", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check my recall", exact: true }).click();
  await recallWords(page, answers);
  expect(await page.evaluate(() => localStorage.getItem("kanji-dash-v1"))).toBe(before);
  await page.getByRole("button", { name: "Start run", exact: true }).click();
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(20_000);
  await expect(page.getByRole("heading", { name: "Run complete!", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Learn before you run" })).toBeVisible();
  await expect(list.getByRole("status")).toHaveText("0 / 5 words studied");
});

test("reload and checkpoint links always enter preparation", async ({ page }) => {
  await page.goto("run?gate=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Learn before you run" })).toBeVisible();
  await page.getByRole("button", { name: "I’ve studied this word", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Learn before you run" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Words in this run" }).getByRole("status")).toHaveText("0 / 12 words studied");
  await expect(page.getByLabel("Kanji runner game")).toHaveCount(0);
});
