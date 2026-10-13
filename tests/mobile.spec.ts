import { completePreparation } from "./helpers/preparation";
import { expect, test, type Page } from "@playwright/test";
import { skipTitle } from "./helpers/hub";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("every screen keeps a clear, thumb-sized way back to the map at 320px", async ({ page }) => {
  await skipTitle(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas[data-ready]")).toBeVisible();
  for (const name of ["Camp", "Journey log"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Camp", exact: true }).click();
  const camp = page.getByRole("dialog", { name: "Your camp" });
  await expect(camp.getByRole("heading", { name: "Your camp" })).toBeVisible();
  const close = await camp.getByRole("button", { name: "Close your camp" }).boundingBox();
  expect(close!.width).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(camp).toHaveCount(0);

  await page.getByRole("button", { name: "Journey log", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The N5 Road", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Journey log" })).toHaveCount(0);

  for (const [path, heading] of [["practice", "Stroke Dojo"], ["collection", "Kanji Collection"]] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    const map = page.getByRole("link", { name: "Map", exact: true });
    const box = await map.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await map.click();
    await expect(page.getByTestId("world-map")).toBeVisible();
  }
});

for (const [width, height] of [[375, 667], [375, 812], [1280, 800]] as const) {
  test(`the map HUD, position card, road strip and checkpoint panel never overlap at ${width}×${height}`, async ({ page }) => {
    await skipTitle(page);
    await page.setViewportSize({ width, height });
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "The First Five checkpoint" })).toBeVisible();
    const boxes = await page.evaluate(() => [".hub-hud", ".world-position", ".world-roads", ".world-panel"].flatMap((selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === "none") return [];
      const r = element.getBoundingClientRect();
      // The HUD row spans the width; only its controls take space.
      const parts = selector === ".hub-hud" ? [...element.children].map((child) => child.getBoundingClientRect()) : [r];
      return parts.map((b) => ({ selector, left: b.left, top: b.top, right: b.right, bottom: b.bottom }));
    }));
    for (const a of boxes) for (const b of boxes) {
      if (a.selector === b.selector) continue;
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `${a.selector} overlaps ${b.selector}`).toBe(false);
    }
    await expectNoHorizontalOverflow(page);
  });
}

test("leaves the run canvas and pause control unobstructed on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("run?mode=runner&gate=1", { waitUntil: "domcontentloaded" });
  await completePreparation(page);
  const game = page.getByLabel("Kanji runner game");
  await expect(game).toBeVisible();
  await page.getByRole("button", { name: "Pause game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toHaveAttribute("aria-pressed", "true");
  const canvas = await game.boundingBox();
  expect(canvas!.x).toBeGreaterThanOrEqual(0);
  expect(canvas!.y).toBeGreaterThanOrEqual(0);
  expect(canvas!.width).toBe(320);
  expect(canvas!.height).toBe(568);
  await expectNoHorizontalOverflow(page);
});

test("searches kanji and keeps detail dismissal and focus accessible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("collection", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: /^Search kanji/ }).fill("日");
  const tile = page.getByRole("button", { name: /^日 —/ });
  await expect(tile).toBeVisible();
  await expect(page.getByRole("button", { name: /^一 —/ })).toHaveCount(0);
  await tile.click();

  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "Close kanji details", exact: true });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  const details = dialog.getByRole("region", { name: "Readings, mnemonic, and vocabulary" });
  await details.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(details.getByRole("listitem").last()).toBeInViewport({ ratio: 1 });
  await expect(close).toBeInViewport();
  await close.click();
  await expect(dialog).not.toBeVisible();
  await expect(tile).toBeFocused();

  await tile.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(tile).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
});

test("fits the tracing pad and its controls on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("practice", { waitUntil: "domcontentloaded" });
  const pad = page.getByLabel("Trace 一", { exact: true });
  await expect(pad).toBeVisible();
  // Wait for the guide to paint; SSR can expose the pad before touch handlers hydrate.
  await expect.poll(() => page.locator('main canvas[aria-hidden="true"]').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  })).toBe(true);
  const bounds = await pad.boundingBox();
  expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThanOrEqual(1);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await expectNoHorizontalOverflow(page);

  for (const name of ["Clear", "Check", "Previous kanji", "Next kanji"]) {
    const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole("button", { name: "Previous kanji", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await pad.tap();
  await expect(page.getByText("Your strokes:")).toHaveText("Your strokes: 1");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Your strokes:")).toHaveText("Your strokes: 0");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Next kanji", exact: true }).click();
  await expect(page.getByLabel("Trace 二", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous kanji", exact: true })).toBeEnabled();
});

test("keeps the sound toggle inside the viewport and clear of the pause control", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("run?mode=runner&gate=1", { waitUntil: "domcontentloaded" });
  await completePreparation(page);
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  const mute = await page.getByRole("button", { name: "Mute sounds", exact: true }).boundingBox();
  const pause = await page.getByRole("button", { name: "Pause game", exact: true }).boundingBox();
  expect(mute!.x).toBeGreaterThanOrEqual(0);
  expect(mute!.y).toBeGreaterThanOrEqual(0);
  expect(mute!.x + mute!.width).toBeLessThanOrEqual(320);
  expect(mute!.y + mute!.height).toBeLessThanOrEqual(568);
  expect(mute!.width).toBeGreaterThanOrEqual(44);
  expect(mute!.height).toBeGreaterThanOrEqual(44);
  const separated = mute!.x >= pause!.x + pause!.width || pause!.x >= mute!.x + mute!.width
    || mute!.y >= pause!.y + pause!.height || pause!.y >= mute!.y + mute!.height;
  expect(separated).toBe(true);
  await expectNoHorizontalOverflow(page);

  await page.goto("camp", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Mute sounds", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
