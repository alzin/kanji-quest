import { test, expect, type Page } from "@playwright/test";
import { allKanji } from "../src/data";
import { vocabKana } from "../src/lib/words";
import { silenceSavePrompt } from "./helpers/savePrompt";

test.beforeEach(({ page }) => silenceSavePrompt(page));

async function enterTrail(page: Page, path = "river") {
  await page.goto("run?mode=expedition", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: path === "river" ? /Follow the river/ : /Follow the lanterns/ }).click();
  while (await page.getByRole("button", { name: "Meet the next word" }).isVisible()) await page.getByRole("button", { name: "Meet the next word" }).click();
  if (await page.getByRole("button", { name: "Step onto the trail" }).isVisible()) await page.getByRole("button", { name: "Step onto the trail" }).click();
  await expect(page.getByTestId("trail-encounter")).toBeVisible();
}

async function completeTrail(page: Page, mistake = false, hints = false) {
  let count = 0;
  while (!(await page.getByTestId("trail-results").isVisible())) {
    if (await page.getByTestId("trail-camp").isVisible()) {
      await page.getByRole("button", { name: hints ? /Carry the moss/ : /Carry the firefly/ }).click();
    }
    expect(count++).toBeLessThan(25);
    const word = (await page.locator(".trail-word").innerText()).trim();
    const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === word)!;
    expect(vocab).toBeDefined();
    const typed = await page.getByLabel("Word reading", { exact: true }).isVisible();
    if (hints) await page.getByRole("button", { name: "A little help?" }).click();
    if (typed) {
      await page.getByLabel("Word reading", { exact: true }).fill(vocab.r);
      await page.getByRole("button", { name: "Light the lantern" }).click();
    } else {
      const meaning = await page.getByRole("heading", { name: "What does this word mean?" }).isVisible();
      const answer = meaning ? vocab.m : vocabKana(vocab);
      if (mistake && count === 1) {
        const buttons = page.getByRole("group", { name: "Choose an answer" }).getByRole("button");
        for (let i = 0; i < await buttons.count(); i++) {
          if ((await buttons.nth(i).locator("span").innerText()) !== answer) { await buttons.nth(i).click(); break; }
        }
        await expect(page.getByText("A new chance to remember.", { exact: true })).toBeVisible();
        await expect(page.getByTestId("aki-companion")).toHaveAttribute("data-mood", "miss");
        await expect(page.getByTestId("answer-effects")).toContainText("Keep going!");
      } else await page.getByRole("group", { name: "Choose an answer" }).getByText(answer, { exact: true }).click();
    }
    if (!mistake && !hints) {
      await expect(page.getByTestId("aki-companion")).toHaveAttribute("data-mood", count % 3 === 0 ? "celebrate" : "correct");
      await expect(page.getByTestId("answer-effects")).toContainText("+3 mon");
      await expect(page.locator(".trail-live-score")).toHaveAttribute("aria-label", new RegExp(`${count * 3} mon, ${count} recall streak`));
    }
    await page.getByRole("button", { name: /Continue along the trail|Gather your discoveries/ }).click();
  }
  return count;
}

test("a complete adventure saves exactly one reward, independent grades and typed recalls", async ({ page }, info) => {
  await enterTrail(page);
  expect(await completeTrail(page)).toBe(10);
  await expect(page.getByRole("heading", { name: "Five lanterns. A brighter forest." })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(saved.coins).toBe(30); expect(saved.runsCompleted).toBe(1);
  expect(Object.values(saved.progress).map((p: any) => p.correct)).toEqual([1, 1, 1, 1]);
  expect(Object.values(saved.progress).reduce((n: number, p: any) => n + p.prod, 0)).toBe(2);
  expect(saved.stack.quests.typed).toBe(1);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!).coins)).toBe(30);
  await page.screenshot({ path: info.outputPath("expedition-results.png"), fullPage: true });
  await page.getByRole("link", { name: "Back to camp", exact: true }).last().click();
  await expect(page.getByText("2/3", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("stat-mon")).toContainText("30");
});

test("a missed word returns, rewards cannot be farmed with retries, and pause traps input", async ({ page }) => {
  await enterTrail(page, "shrine");
  await page.getByRole("button", { name: "Pause adventure" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("1");
  await expect(page.locator(".trail-feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the trail" }).click();
  expect(await completeTrail(page, true)).toBe(11);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(saved.coins).toBe(27);
  expect(Object.values(saved.progress).reduce((n: number, p: any) => n + p.wrong, 0)).toBe(1);
});

test("hints can light the forest without earning independent mastery or reward", async ({ page }) => {
  await enterTrail(page);
  await completeTrail(page, false, true);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(saved.coins).toBe(0);
  expect(Object.values(saved.progress).every((p: any) => p.correct === 0 && p.prod === 0 && p.mastery === 1)).toBe(true);
});

test("home and playable trail fit 320px with offline fonts and reduced motion", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto("./");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await enterTrail(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.locator(".trail-answers button").all()) {
    const bounds = await button.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator(".forest-mote").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".aki-sprite")).toHaveCSS("animation-name", "none");
  await page.screenshot({ path: info.outputPath("expedition-320px.png"), fullPage: true });
});
