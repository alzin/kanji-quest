import { expect, test } from "@playwright/test";
import { completePreparation } from "./helpers/preparation";
import { silenceSavePrompt } from "./helpers/savePrompt";
import { dashState } from "./helpers/dash";
import {
  getDecisionX,
  getGameLayout,
  getGateSpeed,
} from "../src/components/game/runner-math";

test("Lantern Dash supports touch, keyboard, pause, rotation and reduced motion", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await silenceSavePrompt(page);
  await page.clock.install();
  await page.goto("run?mode=runner", { waitUntil: "domcontentloaded" });
  await completePreparation(page, { advanceClock: true, pauseClock: true });
  const canvas = page.locator(".dash-canvas canvas[data-ready]");
  await expect(canvas).toBeVisible();
  await page.keyboard.press("1");
  expect((await dashState(page))?.targetLane).toBe(0);
  await page.clock.runFor(180);
  await page.getByTestId("dash-lane-2").click();
  expect((await dashState(page))?.targetLane).toBe(2);
  await page.clock.runFor(200);
  await page.screenshot({ path: info.outputPath("lantern-running.png") });
  await page.keyboard.press("Escape");
  const paused = await dashState(page);
  await expect(page.getByRole("dialog", { name: "Run paused" })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.clock.runFor(1500);
  expect(await dashState(page)).toEqual(paused);
  await page.screenshot({ path: info.outputPath("lantern-paused.png") });
  await page.getByRole("button", { name: "Resume the dash" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.clock.runFor(150);
    await expect
      .poll(async () => (await canvas.boundingBox())?.width)
      .toBe(viewport.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = (await canvas.boundingBox())!;
    const layout = getGameLayout(box.width, box.height);
    const s = (await dashState(page))!;
    const time =
      (s.gates.find((g) => g.resolved === -1)!.x - getDecisionX(layout)) /
      getGateSpeed(box.width, layout);
    expect(time).toBeGreaterThan(1);
    for (const button of await page
      .locator(".dash-lane-choices button")
      .all()) {
      const b = (await button.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.screenshot({
      path: info.outputPath(`lantern-${viewport.width}.png`),
    });
  }
  expect(errors).toEqual([]);
});
