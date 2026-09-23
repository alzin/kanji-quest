import { expect, type Page } from "@playwright/test";
import type { StackState } from "../../src/components/game/stack-math";
export const riverState = (page: Page): Promise<StackState | null> =>
  page.evaluate(() => (window as any).__kanjiDashStack?.() ?? null);
export function riverWinningColumn(s: StackState) {
  const p = s.current!;
  for (let c = 0; c < s.cols; c++) {
    const top = s.board.findIndex((row) => row[c] !== null),
      row = top < 0 ? s.rows - 1 : top - 1;
    if (row < 0 || p.y > row) continue;
    if (
      [
        [row + 1, c],
        [row, c - 1],
        [row, c + 1],
      ].some(([r, col]) => s.board[r!]?.[col!]?.id === p.target)
    )
      return c;
  }
  return -1;
}
export async function clearRiver(page: Page) {
  for (let i = 0; i < 80; i++) {
    const s = await riverState(page);
    if (!s || s.done) return;
    if (!s.current) {
      await expect
        .poll(async () => {
          await page.clock.fastForward(600);
          await page.clock.runFor(100);
          const next = await riverState(page);
          return !next || next.done || !!next.current;
        })
        .toBe(true);
      continue;
    }
    const col = riverWinningColumn(s);
    expect(col).toBeGreaterThanOrEqual(0);
    await page.getByTestId(`stack-column-${col}`).click();
    await page.getByRole("button", { name: "Drop", exact: false }).click();
    await expect
      .poll(async () => (await riverState(page))?.feedbackId ?? -1)
      .not.toBe(s.feedbackId);
  }
  throw new Error("River did not finish");
}
