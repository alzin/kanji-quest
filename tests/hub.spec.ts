import { expect, test, type Page } from "@playwright/test";
import { CURRICULUM_VERSION, LEVEL_CHAPTERS } from "../src/data";
import { nodeOfRegion } from "../src/components/game/world/layout";
import { silenceSavePrompt } from "./helpers/savePrompt";
import { campPanel, journeyLog } from "./helpers/hub";

const canvas = (page: Page) => page.locator("canvas[data-ready]");
const title = (page: Page) => page.getByRole("heading", { name: "A little Japanese. A whole new world." });

test.beforeEach(({ page }) => silenceSavePrompt(page));

test("a new traveller meets the title over the map, starts at the trailhead, and is not greeted twice", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(title(page)).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  await page.screenshot({ path: info.outputPath("title-over-map.png") });
  await page.getByRole("button", { name: "Start your journey" }).click();
  await expect(title(page)).toHaveCount(0);
  const trailhead = page.getByRole("region", { name: "The First Five checkpoint" });
  await expect(trailhead.getByText("YOU ARE HERE · N5 · REGION 1 OF 19")).toBeVisible();
  // A first step is a short walk in the woods; the checkpoint waits just below it.
  await expect(trailhead.getByRole("link", { name: "Walk today’s trail" })).toHaveAttribute("href", /mode=expedition/);
  await expect(trailhead.getByRole("link", { name: "Prepare checkpoint" })).toHaveAttribute("href", /gate=1/);
  await page.screenshot({ path: info.outputPath("map-start.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(canvas(page)).toBeVisible();
  await expect(title(page)).toHaveCount(0);
  // The wordmark brings the title back on request.
  await page.getByRole("button", { name: "Kanji Dash title screen" }).click();
  await expect(title(page)).toBeVisible();
  await expect(page).toHaveURL(/title=true/);
  await page.getByRole("button", { name: "Start your journey" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("camp opens from the HUD and from the tent; Escape and Back both return to the map", async ({ page }, info) => {
  await page.addInitScript((key) => sessionStorage.setItem(key, "1"), "kanji-dash-title-v1");
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(canvas(page)).toBeVisible();

  await page.getByRole("button", { name: "Camp", exact: true }).click();
  await expect(campPanel(page)).toBeVisible();
  await expect(page).toHaveURL(/panel=camp/);
  await expect(campPanel(page).getByText("Start at any level. Your next adventure uses N5.")).toBeVisible();
  await page.screenshot({ path: info.outputPath("camp.png") });
  await page.keyboard.press("Escape");
  await expect(campPanel(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Camp", exact: true }).click();
  await expect(campPanel(page)).toBeVisible();
  await page.goBack();
  await expect(campPanel(page)).toHaveCount(0);

  // The tent at the trailhead is the camp itself.
  await page.getByRole("button", { name: "Close checkpoint" }).click();
  const at = await canvas(page).evaluate((c: HTMLCanvasElement) => ({ x: Number(c.dataset["campX"]), y: Number(c.dataset["campY"]) }));
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect(campPanel(page)).toBeVisible();
});

test("the journey log lists every checkpoint and walks the map to any of them", async ({ page }) => {
  await page.addInitScript(({ version, seals }) => {
    sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify({
      curriculumVersion: version, selectedLevel: "N5", clearedChapters: seals, gatesCleared: seals.length, unlockedChapters: [],
      progress: {}, coins: 50, runsCompleted: 3, streak: { count: 0, last: "" },
    }));
  }, { version: CURRICULUM_VERSION, seals: [LEVEL_CHAPTERS.N5[0]!] });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("button", { name: "Journey log", exact: true }).click();
  await expect(journeyLog(page).getByRole("heading", { name: "The N5 Road", exact: true })).toBeVisible();
  const first = journeyLog(page).getByRole("list", { name: "N5 checkpoints" }).locator(":scope > li").first();
  await first.getByRole("button").first().click();
  await first.getByRole("button", { name: "Show on the map" }).click();
  await expect(journeyLog(page)).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-stop", String(nodeOfRegion(LEVEL_CHAPTERS.N5[0]!)!.index));
  await expect(page.getByRole("region", { name: "The First Five checkpoint" }).getByText("印 Seal stamped")).toBeVisible();
});

test("old camp, map and world addresses open the matching place on the map", async ({ page }) => {
  await page.addInitScript((key) => sessionStorage.setItem(key, "1"), "kanji-dash-title-v1");
  await page.goto("camp", { waitUntil: "domcontentloaded" });
  await expect(campPanel(page)).toBeVisible();
  await expect(page).toHaveURL(/\/\?panel=camp$/);
  await page.goto("map", { waitUntil: "domcontentloaded" });
  await expect(journeyLog(page)).toBeVisible();
  await expect(page).toHaveURL(/\/\?panel=journey$/);
  await page.goto("world", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-map")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("every screen wears the game frame: night-forest ground and a labelled way back to the map", async ({ page }) => {
  for (const path of ["practice", "collection", "privacy", "run?gate=1"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Map", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    const lightness = await page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.querySelector(".game-screen") ?? document.body).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return (r! + g! + b!) / 3;
    });
    expect(lightness, `${path} background`).toBeLessThan(90);
  }
});
