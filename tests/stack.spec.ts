import { test, expect, type Page } from "@playwright/test";
import { silenceSavePrompt } from "./helpers/savePrompt";
import { allKanji, CURRICULUM_VERSION } from "../src/data";
import type { StackState } from "../src/components/game/stack-math";

async function state(page: Page): Promise<StackState | null> {
  return page.evaluate(() => (window as any).__kanjiDashStack?.() ?? null);
}

export async function startSheet(page: Page, url = "run", saved?: unknown) {
  await page.clock.install(); await silenceSavePrompt(page);
  await page.addInitScript(() => { Math.random = () => 0.999; });
  if (saved) await page.addInitScript((s) => sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify(s)), saved);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Meet your new words" }).or(page.getByTestId("stack-start"))).toBeVisible();
  if (await page.getByRole("heading", { name: "Meet your new words" }).isVisible()) {
    const buttons = page.getByRole("region", { name: "Words in this run" }).getByRole("button");
    for (let i = 0; i < await buttons.count(); i++) await buttons.nth(i).click();
    await page.getByRole("button", { name: "Start stacking" }).click();
  }
  await expect(page.getByTestId("stack-start")).toBeVisible();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.getByTestId("stack-start").click();
  await expect(page.getByTestId("stack-game")).toBeVisible();
  await expect.poll(async () => !!(await state(page))?.current).toBe(true);
}

export function winningColumn(s: StackState): number {
  const p = s.current!;
  for (let c = 0; c < s.cols; c++) {
    const top = s.board.findIndex((row) => row[c] !== null), row = top < 0 ? s.rows - 1 : top - 1;
    if (row < 0 || p.y > row) continue;
    if ([[row + 1, c], [row, c - 1], [row, c + 1]].some(([r, col]) => s.board[r!]?.[col!]?.id === p.target)) return c;
  }
  return -1;
}

export async function clearSheet(page: Page) {
  let correct = 0;
  for (let i = 0; i < 60; i++) {
    const s = await state(page); if (!s || s.done) return correct;
    if (!s.current) { await page.clock.fastForward(500); continue; }
    const col = winningColumn(s); expect(col, JSON.stringify({ current: s.current, queue: s.queue, board: s.board })).toBeGreaterThanOrEqual(0);
    await page.getByTestId(`stack-column-${col}`).click();
    await page.getByTestId(`stack-column-${col}`).click();
    correct++;
    await page.clock.fastForward(500);
  }
  throw new Error("Sheet did not finish");
}

const reviewSave = () => ({ curriculumVersion: CURRICULUM_VERSION, unlockedChapters: [1, 13, 14], selectedLevel: "N5", clearedChapters: [], progress: Object.fromEntries(allKanji.map((k, i) => [k.c, { mastery: 2, ivl: 1, due: i < 12 ? 1 : 8_000_000_000_000, ease: 2.5, correct: 0, wrong: 0 }])), streak: { count: 0, last: "" } });

test("daily stack is the default, new words skip recall, and a sheet saves exact rewards once", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startSheet(page);
  const correct = await clearSheet(page);
  await expect(page.getByRole("heading", { name: "Today’s sheets complete" })).toBeVisible();
  await expect(page.getByTestId("result-correct")).toHaveText(String(correct));
  await expect(page.getByTestId("result-missed")).toHaveText("0");
  const read = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  const saved = await read();
  expect(saved.runsCompleted).toBe(1); expect(saved.coins).toBe(correct * 3);
  expect(Object.values(saved.progress).reduce((sum: number, p: any) => sum + p.correct, 0)).toBe(correct);
  expect(saved.stack.sheetsCleared).toBe(1); expect(saved.stack.lastSealDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.clock.fastForward(60000); expect(await read()).toEqual(saved);
});

test("two sheets chain, pause/blur freeze time, and the controls fit at 320px offline fonts", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**/fonts.gstatic.com/**", (route) => route.abort());
  await startSheet(page, "run?mode=stack", reviewSave());
  const before = await state(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.fastForward(100000);
  expect(await state(page)).toEqual(before);
  await page.getByRole("button", { name: "Resume sheet" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const buttons = page.getByRole("group", { name: "Stack columns" }).getByRole("button");
  for (let i = 0; i < 5; i++) { const b = await buttons.nth(i).boundingBox(); expect(b!.width).toBeGreaterThanOrEqual(44); expect(b!.height).toBeGreaterThanOrEqual(44); }
  await clearSheet(page);
  await expect(page.getByRole("heading", { name: "Sheet cleared", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next sheet", exact: true }).click();
  await clearSheet(page);
  await expect(page.getByTestId("stack-results")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!).runsCompleted)).toBe(2);
});

test("misses correct in place, retry grading is bounded, and holding is ungraded", async ({ page }) => {
  await startSheet(page);
  const initial = (await state(page))!;
  await page.getByTestId("stack-hold").click();
  expect((await state(page))!.hold?.target).toBe(initial.current?.target);
  expect(await page.evaluate(() => sessionStorage.getItem("kanji-dash-guest-v1"))).toBeNull();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("stack-feedback")).toContainText("·");
  await expect(page.getByRole("button", { name: "Keep running" })).toHaveCount(0);
  const ink = (await state(page))!; expect(ink.phase).toBe("ink");
  await page.clock.fastForward(1200);
  await clearSheet(page);
  await expect(page.getByTestId("result-missed")).toHaveText("1");
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(Object.values(saved.progress).reduce((sum: number, p: any) => sum + p.wrong, 0)).toBe(1);
  expect(saved.stack.quests.redeems).toBeGreaterThanOrEqual(1);
});

test("checkpoint requires typed production before awarding a seal", async ({ page }) => {
  await startSheet(page, "run?gate=1");
  await clearSheet(page);
  while (await page.getByRole("button", { name: "Next sheet", exact: true }).isVisible()) { await page.getByRole("button", { name: "Next sheet", exact: true }).click(); await clearSheet(page); }
  await expect(page.getByRole("heading", { name: "Typed Seal check" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!).gatesCleared)).toBe(0);
  for (let i = 0; i < 3; i++) {
    const written = await page.locator(".stack-page > p.font-serif").textContent();
    const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === written)!;
    await page.getByLabel("Type the reading").fill(vocab.f.map((f) => f.r || f.t).join(""));
    await page.getByRole("button", { name: "Check reading", exact: true }).click();
    await page.getByRole("button", { name: i === 2 ? "See my seal" : "Next reading", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Checkpoint cleared!", exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(saved.coins).toBe(50); expect(saved.clearedChapters).toEqual([1]); expect(saved.stack.quests.typed).toBe(1);
});

test("fluency is optional and a miss cannot move a not-due review", async ({ page }) => {
  const saved = reviewSave();
  for (const p of Object.values(saved.progress)) p.due = 8_000_000_000_000;
  await startSheet(page, "run?practice=fluency", saved);
  await page.keyboard.press("Space"); await page.clock.fastForward(1200); await clearSheet(page);
  await expect(page.getByTestId("stack-results")).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  for (const [c, p] of Object.entries(saved.progress)) expect(after.progress[c]).toMatchObject({ due: p.due, ivl: p.ivl, ease: p.ease, mastery: p.mastery });
  expect(after.stack.bestSprintMs).toBeGreaterThan(0);
});

test("marathon raises ink and ends cleanly on top-out under one long fake-clock frame", async ({ page }) => {
  const saved = reviewSave();
  for (const p of Object.values(saved.progress)) p.due = 8_000_000_000_000;
  await startSheet(page, "run?practice=marathon", saved);
  await page.clock.fastForward(300000);
  await expect(page.getByRole("heading", { name: "Sheet filled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry sheet" })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(after.runsCompleted).toBe(1); expect(after.stack.playMs).toBeLessThan(300000);
});

test("retry keeps the failed sheet even after its cards have been graded", async ({ page }) => {
  await startSheet(page);
  const original = (await state(page))!.words.map((w) => w.q.vocab.w);
  await page.clock.fastForward(300000);
  await page.getByRole("button", { name: "Retry sheet", exact: true }).click();
  expect((await state(page))!.words.map((w) => w.q.vocab.w)).toEqual(original);
  await clearSheet(page);
  await expect(page.getByTestId("stack-results")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!));
  expect(saved.runsCompleted).toBe(2); expect(saved.stack.sheetsCleared).toBe(1);
});
