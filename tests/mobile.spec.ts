import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("keeps thumb navigation available and every screen clear at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(4);

  for (const [name, heading] of [
    ["Home", "Run. Answer. Remember."],
    ["Map", "The N5 Road"],
    ["Dojo", "Stroke Dojo"],
    ["Kanji", "Kanji Collection"],
  ] as const) {
    const link = navigation.getByRole("link", { name, exact: true });
    await link.click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    const target = await link.boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);

    // The final card or tile row must be reachable above the fixed tab bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => page.getByRole("main").evaluate((main) => {
      const navigation = document.querySelector('nav[aria-label="Main navigation"]')!;
      return main.lastElementChild!.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top;
    })).toBeLessThanOrEqual(0);
    const bar = await navigation.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(Math.abs(bar!.y + bar!.height - viewportHeight)).toBeLessThanOrEqual(1);
    await expect(navigation).toHaveCSS("position", "fixed");
  }
});

test("moves navigation to the top when the viewport becomes wide", async ({ page }) => {
  await page.goto("map", { waitUntil: "domcontentloaded" });
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toHaveCSS("position", "fixed");

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(navigation).not.toHaveCSS("position", "fixed");
  const bar = await navigation.boundingBox();
  const heading = await page.getByRole("heading", { name: "The N5 Road", exact: true }).boundingBox();
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(heading!.y);
  await expect(navigation.getByRole("link", { name: "Map", exact: true })).toHaveAttribute("aria-current", "page");
  await expectNoHorizontalOverflow(page);
});

test("leaves the run canvas and pause control unobstructed on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("run?gate=1", { waitUntil: "domcontentloaded" });
  const game = page.getByLabel("Kanji runner game");
  await expect(game).toBeVisible();
  await page.getByRole("button", { name: "Pause game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume game", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
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
  // A short mobile viewport must still allow reading the full detail body.
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
  await page.goto("run?gate=1", { waitUntil: "domcontentloaded" });
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

  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Mute sounds", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
