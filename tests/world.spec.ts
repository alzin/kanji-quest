import { expect, test, type Page } from "@playwright/test";
import { CURRICULUM_VERSION, LEVEL_CHAPTERS } from "../src/data";
import { nodeOfRegion } from "../src/components/game/world/layout";
import { silenceSavePrompt } from "./helpers/savePrompt";

// An N4 traveller: N5 sealed, five N4 seals, and region 30 two steps along.
const SEALS = [...LEVEL_CHAPTERS.N5, 7, 26, 27, 28, 29];
const HERE = nodeOfRegion(30)!.index;

test.beforeEach(async ({ page }) => {
  await silenceSavePrompt(page);
  await page.addInitScript(({ version, seals }) => {
    if (sessionStorage.getItem("kanji-dash-guest-v1")) return;
    sessionStorage.setItem("kanji-dash-guest-v1", JSON.stringify({
      curriculumVersion: version, selectedLevel: "N4", clearedChapters: seals, gatesCleared: seals.length, unlockedChapters: [],
      progress: {}, coins: 300, runsCompleted: 30, streak: { count: 0, last: "" },
      checkpointSteps: { learned: [30], stacked: [30], rescued: [] },
    }));
  }, { version: CURRICULUM_VERSION, seals: SEALS });
});

const canvas = (page: Page) => page.locator("canvas[data-ready]");

test("the world map is home: every road, opened on the learner's own checkpoint", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The old /world address still leads home.
  await page.goto("world", { waitUntil: "domcontentloaded" });
  await expect(canvas(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  // A traveller with progress is never shown the title card.
  await expect(page.getByRole("heading", { name: "A little Japanese. A whole new world." })).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-here", String(HERE));
  await expect(canvas(page)).toHaveAttribute("data-stop", String(HERE));
  await expect(page.getByRole("heading", { name: "You are on the N4 road" })).toBeVisible();
  await expect(page.getByText("中山道 Nakasendō · Region 6 of 36")).toBeVisible();
  const roads = page.getByRole("navigation", { name: "Roads of the journey" }).getByRole("button");
  await expect(roads).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Show the N4 road, 5 of 36 seals" })).toHaveAttribute("aria-pressed", "true");
  const panel = page.getByRole("region", { name: "Everyday Essentials checkpoint" });
  await expect(panel.getByText("YOU ARE HERE · N4 · REGION 6 OF 36")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Continue · Firefly Rescue" })).toHaveAttribute("href", /gate=30/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("world-here.png") });
  expect(errors).toEqual([]);
});

test("the traveller walks the road by keys and buttons, and the camera visits any road", async ({ page }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(canvas(page)).toHaveAttribute("data-stop", String(HERE));
  // North is further along the journey.
  await page.keyboard.press("ArrowUp");
  await expect(canvas(page)).toHaveAttribute("data-stop", String(HERE + 1));
  const next = page.getByRole("region", { name: "Letters & Languages checkpoint" });
  await expect(next.getByText("N4 · REGION 7 OF 36")).toBeVisible();
  await expect(next.getByText("Opens when you clear Everyday Essentials, or reach 55% mastery progress there.")).toBeVisible();
  await next.getByRole("button", { name: "‹ Previous stop" }).click();
  await page.getByRole("region", { name: "Everyday Essentials checkpoint" }).getByRole("button", { name: "‹ Previous stop" }).click();
  const sealed = page.getByRole("region", { name: "Getting Along checkpoint" });
  await expect(sealed.getByText("印 Seal stamped")).toBeVisible();
  await expect(sealed.getByRole("link", { name: "Repeat checkpoint" })).toHaveAttribute("href", /gate=29/);

  await page.getByRole("button", { name: /^Show the N1 road/ }).click();
  await expect(canvas(page)).toHaveAttribute("data-road", "N1");
  await expect(page.getByRole("button", { name: /^Show the N1 road/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "You are here" }).click();
  await expect(canvas(page)).toHaveAttribute("data-stop", String(HERE));
  await expect(canvas(page)).toHaveAttribute("data-road", "N4");
  await expect(page.getByRole("region", { name: "Everyday Essentials checkpoint" })).toBeVisible();
});

test("the forest's Map button asks before leaving an unfinished trail, then returns to the traveller's stop", async ({ page }) => {
  await page.goto("run?mode=expedition", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas[data-ready]")).toBeVisible();
  await expect(page.getByText("N4 · Region 6 of 36")).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const leave = page.getByRole("dialog", { name: "Leave the trail?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Back to the trail" }).click();
  await expect(leave).toHaveCount(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("link", { name: "Leave unfinished adventure" }).click();
  await expect(canvas(page)).toHaveAttribute("data-here", String(HERE));
  await expect(canvas(page)).toHaveAttribute("data-stop", String(HERE));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("region", { name: "Everyday Essentials checkpoint" })).toBeVisible();
  await page.getByRole("link", { name: "Walk today’s trail" }).click();
  await expect(page.getByTestId("forest-adventure")).toBeVisible();
});

test("a checkpoint's way back lands on its own stop, not the learner's next one", async ({ page }) => {
  await page.goto("run?gate=29", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-stop", String(nodeOfRegion(29)!.index));
  await expect(page.getByRole("region", { name: "Getting Along checkpoint" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
