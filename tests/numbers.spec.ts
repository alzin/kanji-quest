import { expect, test, type Page } from "@playwright/test";
import { allKanji, kanjiOfChapter } from "../src/data/n5";

type Progress = { mastery: number; ivl: number; ease: number; due: number; correct: number; wrong: number };

function progress(mastery: number, due = Date.now() + 86_400_000): Progress {
  return { mastery, ivl: mastery === 3 ? 21 : 1, ease: 2.5, due, correct: 4, wrong: 1 };
}

async function seedSave(page: Page, cards: Record<string, Progress>, clearedChapters: number[] = []) {
  await page.addInitScript((save) => {
    localStorage.setItem("kanji-dash-v1", JSON.stringify(save));
  }, {
    progress: cards,
    streak: { count: 0, last: "" },
    coins: 37,
    runsCompleted: 4,
    gatesCleared: clearedChapters.length,
    clearedChapters,
  });
}

test("keeps due reviews, partial mastery, and exact checkpoint seals consistent across screens", async ({ page }) => {
  const cards = Object.fromEntries(kanjiOfChapter(1).map((kanji) => [kanji.c, progress(2)]));
  cards["半"] = progress(3, Date.now() - 1_000);
  await seedSave(page, cards, [3]);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("1 to review", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "N5 mastery progress 12%", exact: true })).toBeVisible();
  await expect(page.getByText(`1/${allKanji.length}`, { exact: true })).toBeVisible();
  await expect(page.getByText("4 runs", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByText("1 / 6 earned", { exact: true })).toBeVisible();
  const regions = page.getByRole("main").locator("ol > li");
  await expect(regions.nth(0).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
  await expect(regions.nth(0).getByText("67% progress · 0/16 mastered", { exact: true })).toBeVisible();
  await expect(regions.nth(0).getByText("Seal stamped ✓", { exact: true })).toHaveCount(0);
  await expect(regions.nth(1).getByRole("link", { name: "Checkpoint gate" })).toBeVisible();
  await expect(regions.nth(2).getByText("Seal stamped ✓", { exact: true })).toBeVisible();
  await expect(page.getByText("JLPT N5 kanji seal earned!", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Kanji", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`${allKanji.length} kanji · All regions`);
  await page.getByRole("button", { name: "一 — one · Reviewing", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Seen 5× · 4 correct · 1 missed", { exact: true })).toBeVisible();
});

test("does not display 100% before every kanji is mastered", async ({ page }) => {
  const cards = Object.fromEntries(allKanji.map((kanji) => [kanji.c, progress(3)]));
  cards[allKanji[0]!.c] = progress(2);
  await seedSave(page, cards);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("img", { name: "N5 mastery progress 99%", exact: true })).toBeVisible();
  await expect(page.getByText(`${allKanji.length - 1}/${allKanji.length}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Caught up", { exact: true })).toBeVisible();
});

test("shows an empty run when all eligible kanji are waiting for their review date", async ({ page }) => {
  const cards = Object.fromEntries(kanjiOfChapter(1).map((kanji) => [kanji.c, progress(1)]));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedSave(page, cards);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Caught up", { exact: true })).toBeVisible();
  await page.goto("run", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Nothing to run right now", exact: true })).toBeVisible();
  await expect(page.getByLabel("Kanji runner game")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ignores checkpoint numbers outside the integer chapter range", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const gate of ["1.5", "0", "7", "-1"]) {
    await page.goto(`run?gate=${gate}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Daily run", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pause game", exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test("refreshes due reviews over time and saved totals from another tab", async ({ page, context }) => {
  const start = new Date("2026-09-06T03:00:00Z");
  await page.clock.install({ time: start });
  await seedSave(page, { "一": progress(1, start.getTime() + 60_000) });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("37 mon", { exact: false })).toBeVisible();
  await expect(page.getByText("1 to review", { exact: true })).toHaveCount(0);
  await page.clock.runFor(61_000);
  await expect(page.getByText("1 to review", { exact: true })).toBeVisible();

  const other = await context.newPage();
  await other.goto("./", { waitUntil: "domcontentloaded" });
  await other.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("kanji-dash-v1")!);
    save.coins = 123;
    save.runsCompleted = 9;
    save.progress["一"].mastery = 3;
    localStorage.setItem("kanji-dash-v1", JSON.stringify(save));
  });
  await expect(page.getByText("123 mon", { exact: false })).toBeVisible();
  await expect(page.getByText("9 runs", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "N5 mastery progress 1%", exact: true })).toBeVisible();
  await expect(page.getByText(`1/${allKanji.length}`, { exact: true })).toBeVisible();
  await other.close();
});
