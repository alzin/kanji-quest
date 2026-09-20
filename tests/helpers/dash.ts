import { expect, type Page } from "@playwright/test";
import {
  getDecisionX,
  getGameLayout,
  getGateSpeed,
  type RunnerState,
} from "../../src/components/game/runner-math";
export const dashState = (page: Page): Promise<RunnerState | null> =>
  page.evaluate(() => (window as any).__kanjiDashRunner?.() ?? null);
export async function dashReady(page: Page) {
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return page.locator(".dash-canvas canvas[data-ready]").count();
    })
    .toBe(1);
}
async function crossGate(page: Page) {
  // Drive time through the real engine after the real input, without making
  // slow screenshot capture or WebKit IPC part of a player's answer time.
  await page.clock.runFor(100);
  const s = (await dashState(page))!;
  const box = (await page.locator(".dash-canvas canvas").boundingBox())!;
  const layout = getGameLayout(box.width, box.height);
  const gate = s.gates.find((g) => g.resolved === -1)!;
  const seconds =
    (gate.x - getDecisionX(layout)) / getGateSpeed(box.width, layout);
  await page.clock.fastForward(Math.ceil(seconds * 1000) + 50);
  // A capped Phaser loop may skip the single frame emitted by fastForward.
  // Flush normal RAF frames so the scene observes the elapsed time.
  await page.clock.runFor(100);
}
export async function loseDash(page: Page) {
  for (let i = 0; i < 3; i++) {
    const s = (await dashState(page))!;
    const gate = s.gates.find((g) => g.resolved === -1)!;
    await page.getByTestId(`dash-lane-${(gate.correctLane + 1) % 3}`).click();
    await crossGate(page);
    await expect
      .poll(async () => (await dashState(page))?.wrong ?? 3, { timeout: 12000 })
      .toBe(i + 1);
    if (i < 2)
      await page
        .getByRole("button", { name: "Keep running", exact: true })
        .click();
  }
  await expect(
    page.getByRole("heading", { name: "Aki kept an ember." }),
  ).toBeVisible();
}
export async function completeDash(page: Page, wrongFirst = false) {
  let answered = 0;
  for (let i = 0; i < 12; i++) {
    const s = await dashState(page);
    if (!s || s.done) return;
    const gate = s.gates.find((g) => g.resolved === -1)!;
    const lane =
      wrongFirst && answered === 0
        ? (gate.correctLane + 1) % 3
        : gate.correctLane;
    await page.getByTestId(`dash-lane-${lane}`).click();
    await crossGate(page);
    await expect
      .poll(
        async () => {
          const next = await dashState(page);
          return next ? next.correct + next.wrong : -1;
        },
        { timeout: 12000 },
      )
      .not.toBe(s.correct + s.wrong);
    answered++;
    if (
      await page
        .getByRole("button", { name: "Keep running", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Keep running", exact: true })
        .click();
  }
  throw new Error("Dash did not finish");
}
