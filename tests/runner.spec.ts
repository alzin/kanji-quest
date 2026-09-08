import { completePreparation } from "./helpers/preparation";
import { expect, test, type Page } from "@playwright/test";

async function startDeterministicRun(page: Page, url = "run") {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  // Identity shuffles put each answer in the top lane for these integration tests.
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await completePreparation(page);
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
}

async function expectResult(page: Page, label: string, value: string) {
  await expect(page.getByText(label, { exact: true }).locator("..").getByText(value, { exact: true })).toBeVisible();
}

async function savedTotals(page: Page) {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("kanji-dash-v1")!);
    const cards = Object.values(saved.progress) as { correct: number; wrong: number }[];
    return {
      correct: cards.reduce((sum, card) => sum + card.correct, 0),
      wrong: cards.reduce((sum, card) => sum + card.wrong, 0),
      coins: saved.coins,
      runsCompleted: saved.runsCompleted,
    };
  });
}

test("combo score, correct answers, remaining questions and saved rewards agree", async ({ page }) => {
  await startDeterministicRun(page);
  await expect(page.getByText("5 left", { exact: true })).toBeVisible();
  await expect(page.getByText("×0", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(20_000);
  await expect(page.getByRole("heading", { name: "Run complete!", exact: true })).toBeVisible();
  await expect(page.getByText("5 / 5 answered", { exact: true })).toBeVisible();
  for (const [label, value] of [["Correct", "5"], ["Missed", "0"], ["Best combo", "×5"], ["Score", "1,500"], ["Answer accuracy", "100%"], ["Mon earned", "+15"]]) {
    await expectResult(page, label!, value!);
  }
  expect(await savedTotals(page)).toEqual({ correct: 5, wrong: 0, coins: 15, runsCompleted: 1 });
  await page.clock.fastForward(60_000);
  expect(await savedTotals(page)).toEqual({ correct: 5, wrong: 0, coins: 15, runsCompleted: 1 });
});

test("lesson pauses and three hearts preserve attempted counts and restart state", async ({ page }) => {
  await startDeterministicRun(page);
  for (let wrong = 1; wrong <= 2; wrong++) {
    await page.clock.fastForward(100_000);
    await expect(page.getByRole("button", { name: "Keep running", exact: true })).toBeVisible();
    await expect(page.getByText(`${5 - wrong} left`, { exact: true })).toBeVisible();
    expect(await savedTotals(page)).toEqual({ correct: 0, wrong, coins: 0, runsCompleted: 0 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Resume game", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.clock.fastForward(100_000);
    expect(await savedTotals(page)).toEqual({ correct: 0, wrong, coins: 0, runsCompleted: 0 });
    await page.getByRole("button", { name: "Keep running", exact: true }).click();
  }
  await page.clock.fastForward(100_000);
  await expect(page.getByRole("heading", { name: "Run ended", exact: true })).toBeVisible();
  await expect(page.getByText("3 / 5 answered · 2 not reached", { exact: true })).toBeVisible();
  for (const [label, value] of [["Correct", "0"], ["Missed", "3"], ["Best combo", "×0"], ["Score", "0"], ["Answer accuracy", "0%"], ["Mon earned", "+0"]]) {
    await expectResult(page, label!, value!);
  }
  expect(await savedTotals(page)).toEqual({ correct: 0, wrong: 3, coins: 0, runsCompleted: 1 });

  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await completePreparation(page);
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep running", exact: true })).toHaveCount(0);
  await expect(page.getByText("×0", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(20_000);
  await expect(page.getByRole("heading", { name: "Run complete!", exact: true })).toBeVisible();
  expect(await savedTotals(page)).toEqual({ correct: 5, wrong: 3, coins: 15, runsCompleted: 2 });
});

test("a repeated checkpoint earns one exact seal and bonus without advancing reviews early", async ({ page }) => {
  await startDeterministicRun(page, "run?gate=3");
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(40_000);
  await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
  await expect(page.getByText("12 / 12 answered", { exact: true })).toBeVisible();
  for (const [label, value] of [["Correct", "12"], ["Missed", "0"], ["Best combo", "×12"], ["Score", "7,800"], ["Answer accuracy", "100%"], ["Mon earned", "+50"]]) {
    await expectResult(page, label!, value!);
  }
  expect(await savedTotals(page)).toEqual({ correct: 12, wrong: 0, coins: 50, runsCompleted: 1 });
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("kanji-dash-v1")!));
  expect(initial.clearedChapters).toEqual([3]);
  expect(initial.gatesCleared).toBe(1);
  const initialCards = initial.progress as Record<string, { mastery: number; due: number }>;
  expect(Object.keys(initialCards)).toHaveLength(12);
  expect(Object.values(initialCards).every((card) => card.mastery === 1)).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await completePreparation(page);
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__kanjiDashPause)).toBe("function");
  await page.keyboard.press("ArrowUp");
  await page.clock.fastForward(40_000);
  await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
  await expectResult(page, "Score", "7,800");
  await expectResult(page, "Mon earned", "+0");
  expect(await savedTotals(page)).toEqual({ correct: 24, wrong: 0, coins: 50, runsCompleted: 2 });
  const repeated = await page.evaluate(() => JSON.parse(localStorage.getItem("kanji-dash-v1")!));
  expect(repeated.clearedChapters).toEqual([3]);
  expect(repeated.gatesCleared).toBe(1);
  for (const [character, before] of Object.entries(initialCards)) {
    expect(repeated.progress[character].mastery).toBe(1);
    expect(repeated.progress[character].due).toBe(before.due);
  }
});
