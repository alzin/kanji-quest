import { test, expect, type Page } from "@playwright/test";
import { allKanji } from "../src/data";
import { vocabKana } from "../src/lib/words";
import { silenceSavePrompt } from "./helpers/savePrompt";
import { clearRiver, riverState } from "./helpers/river";
import { completeDash, dashState, loseDash, dashReady } from "./helpers/dash";

test.beforeEach(async ({ page }) => {
  await silenceSavePrompt(page);
  await page.clock.install();
});

async function enterTrail(page: Page) {
  await page.goto("run?mode=expedition", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas[data-ready]")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Follow the trail" }),
  ).toBeEnabled();
}
async function reachSite(page: Page, index: number) {
  await page.getByRole("button", { name: "Follow the trail" }).click();
  const button = page.getByRole("button", {
    name: ["Light the lantern", "Restore the bridge", "Run the mist trail"][
      index
    ],
  });
  await button.click();
  if (await page.getByRole("dialog", { name: "Field notes" }).isVisible())
    await page.getByRole("button", { name: "Ready for the trail" }).click();
  await expect(
    page.getByTestId(
      index === 1
        ? "crossing-intro"
        : index === 2
          ? "dash-intro"
          : "forest-word",
    ),
  ).toBeVisible();
}
test("correct answers advance automatically, pause holds feedback, and misses wait for Continue", async ({ page }) => {
  await enterTrail(page);
  await reachSite(page, 0);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
  const word = (await page.getByTestId("forest-word").innerText()).trim();
  const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === word)!;
  await page.getByRole("group", { name: "Choose an answer" }).getByText(vocab.m, { exact: true }).click();
  await expect(page.locator(".forest-feedback")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open field notes" }).click();
  await expect(page.getByRole("dialog", { name: "Field notes" })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.getByTestId("forest-word")).toHaveText(word);
  await page.getByRole("button", { name: "Ready for the trail" }).click();
  await page.getByRole("button", { name: "Pause encounter" }).click();
  await page.clock.runFor(2000);
  await expect(page.getByTestId("forest-word")).toHaveText(word);
  await page.getByRole("button", { name: "Back to the trail" }).click();
  await page.clock.runFor(1100);
  await expect(page.locator(".forest-feedback")).toHaveCount(0);
  await expect(page.getByTestId("forest-word")).not.toHaveText(word);
  const nextWord = (await page.getByTestId("forest-word").innerText()).trim();
  const nextVocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === nextWord)!;
  for (const button of await page.locator(".forest-answers button").all()) {
    if ((await button.locator("span").innerText()) !== nextVocab.m) {
      await button.click();
      break;
    }
  }
  await page.clock.runFor(2000);
  await expect(page.getByTestId("forest-word")).toHaveText(nextWord);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".forest-feedback")).toHaveCount(0);
});

test("all six river lanes fill the board and align with their controls after resizing", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1916, height: 910 });
  await enterTrail(page);
  await reachSite(page, 0);
  while (await page.locator(".forest-encounter[open]").isVisible()) {
    const word = (await page.getByTestId("forest-word").innerText()).trim();
    const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === word)!;
    await page
      .getByRole("group", { name: "Choose an answer" })
      .getByText(vocab.m, { exact: true })
      .click();
    await expect(page.locator(".forest-feedback")).toHaveCount(0);
  }
  await reachSite(page, 1);
  await page.clock.pauseAt(
    new Date(await page.evaluate(() => Date.now() + 1000)),
  );
  await page.getByRole("button", { name: "Place the word stones" }).click();
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return page.locator(".river-canvas canvas[data-ready]").count();
    })
    .toBe(1);
  for (const width of [1916, 980, 1916]) {
    await page.setViewportSize({ width, height: 910 });
    await page.clock.runFor(600);
    const host = (await page.locator(".river-canvas").boundingBox())!;
    const canvas = (await page.locator(".river-canvas canvas").boundingBox())!;
    await expect(page.locator(".river-canvas canvas")).toHaveAttribute(
      "data-board-width",
      String(Math.floor(host.width)),
    );
    expect(Math.abs(canvas.width - host.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(canvas.height - host.height)).toBeLessThanOrEqual(1);
    for (const col of [4, 5]) {
      await page.getByTestId(`stack-column-${col}`).click();
      await page.clock.runFor(200);
      expect((await riverState(page))?.current?.column).toBe(col);
      const button = (await page
        .getByTestId(`stack-column-${col}`)
        .boundingBox())!;
      const center = canvas.x + (canvas.width * (col + 0.5)) / 6;
      expect(Math.abs(button.x + button.width / 2 - center)).toBeLessThan(5);
    }
  }
  await page.screenshot({ path: info.outputPath("river-six-lanes.png") });
});
async function completeTrail(
  page: Page,
  options: {
    mistake?: boolean;
    hints?: boolean;
    crossingMistake?: boolean;
    dashMistake?: boolean;
    dashRetry?: boolean;
  } = {},
) {
  let count = 0;
  for (let site = 0; site < 3; site++) {
    await reachSite(page, site);
    if (site === 1) {
      await page.getByRole("button", { name: "Place the word stones" }).click();
      await expect(
        page.locator(".river-canvas canvas[data-ready]"),
      ).toBeVisible();
      if (options.hints)
        await page
          .getByRole("button", { name: "Ask Aki", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Pause game", exact: true })
        .click();
      const before = await riverState(page);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      expect(await riverState(page)).toEqual(before);
      await page.getByRole("button", { name: "Back to the trail" }).click();
      await page.screenshot({
        path: test.info().outputPath("river-crossing.png"),
      });
      if (options.crossingMistake) {
        // Spawn deliberately chooses a neutral lane. Drop through the real control.
        await page.getByRole("button", { name: "Drop" }).click();
        await expect.poll(async () => (await riverState(page))?.wrong).toBe(1);
        await expect
          .poll(async () => !!(await riverState(page))?.current)
          .toBe(true);
      }
      await clearRiver(page);
      await page.getByRole("button", { name: "Restore the crossing" }).click();
      count += 4;
    }
    if (site === 2) {
      await page.clock.pauseAt(
        new Date(await page.evaluate(() => Date.now() + 100)),
      );
      await page
        .getByRole("button", { name: "Begin the lantern dash" })
        .click();
      await dashReady(page);
      if (options.hints)
        await page
          .getByRole("button", { name: "Ask Aki", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Pause game", exact: true })
        .click();
      const before = await dashState(page);
      await page.keyboard.press("ArrowUp");
      await page.clock.runFor(120);
      expect(await dashState(page)).toEqual(before);
      await page.getByRole("button", { name: "Back to the trail" }).click();
      if (!options.dashRetry) {
        const first = (await dashState(page))!.gates.find(
          (g) => g.resolved === -1,
        )!;
        await page.getByTestId(`dash-lane-${first.correctLane}`).click();
        await page.screenshot({
          path: test.info().outputPath("lantern-dash.png"),
        });
      }
      if (options.dashRetry) {
        await loseDash(page);
        const before = await saved(page);
        expect(before?.runsCompleted ?? 0).toBe(0);
        expect(before?.coins ?? 0).toBe(0);
        await page
          .getByRole("button", { name: "Try the mist trail again" })
          .click();
        await dashReady(page);
      }
      await completeDash(page, options.dashMistake);
      await page
        .getByRole("button", { name: "Return to the shrine path" })
        .click();
      await page.clock.resume();
      await expect(page.locator("canvas")).toHaveAttribute(
        "data-lantern-delivered",
        "true",
      );
      await page.getByRole("button", { name: "Wake the shrine" }).click();
      count += 4;
    }
    while (await page.locator(".forest-encounter[open]").isVisible()) {
      expect(count++).toBeLessThan(25);
      const word = (await page.getByTestId("forest-word").innerText()).trim();
      const vocab = allKanji.flatMap((k) => k.vocab).find((v) => v.w === word)!;
      expect(vocab).toBeDefined();
      if (options.hints)
        await page.getByRole("button", { name: "Ask Aki for a hint" }).click();
      if (await page.getByLabel("Word reading", { exact: true }).isVisible()) {
        await page.getByLabel("Word reading", { exact: true }).fill(vocab.r);
        await page.getByRole("button", { name: "Offer the word" }).click();
      } else {
        const meaning = await page
          .getByRole("heading", { name: "Every word holds a little light." })
          .isVisible();
        const answer = meaning ? vocab.m : vocabKana(vocab);
        const choices = page.getByRole("group", { name: "Choose an answer" });
        if (options.mistake && count === 1) {
          for (const button of await choices.getByRole("button").all())
            if ((await button.locator("span").innerText()) !== answer) {
              await button.click();
              break;
            }
          await expect(
            page.getByText("Let’s keep this word close.", { exact: true }),
          ).toBeVisible();
        } else await choices.getByText(answer, { exact: true }).click();
      }
      if (options.mistake && count === 1)
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      else await expect(page.locator(".forest-feedback")).toHaveCount(0);
    }
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-restored",
      String(site + 1),
    );
  }
  await page.getByRole("button", { name: "View your discoveries" }).click();
  await expect(
    page.getByRole("dialog", { name: "Adventure complete" }),
  ).toBeVisible();
  return count;
}
const saved = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("kanji-dash-guest-v1")!),
  );

test("a full walk restores all landmarks and saves exactly one reward and four grades", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "A little Japanese. A whole new world.",
    }),
  ).toBeVisible();
  await expect(page.locator("canvas[data-ready]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("title.png") });
  await page.getByRole("link", { name: "Enter the forest" }).click();
  await expect(page.getByTestId("forest-adventure")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Follow the trail" }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("exploration.png") });
  expect(await completeTrail(page)).toBe(14);
  let save = await saved(page);
  expect(save.coins).toBe(42);
  expect(save.runsCompleted).toBe(1);
  expect(Object.values(save.progress).map((p: any) => p.correct)).toEqual([
    1, 1, 1, 1,
  ]);
  expect(
    Object.values(save.progress).reduce((n: number, p: any) => n + p.prod, 0),
  ).toBe(2);
  expect(save.stack.quests.typed).toBe(1);
  await page.screenshot({ path: info.outputPath("results.png") });
  await page.getByRole("button", { name: "Stay a little longer" }).click();
  await page.screenshot({ path: info.outputPath("restored-shrine.png") });
  await page.getByRole("button", { name: "View your discoveries" }).click();
  save = await saved(page);
  expect(save.coins).toBe(42);
  expect(save.runsCompleted).toBe(1);
  await page.getByRole("link", { name: "Return to camp", exact: true }).click();
  await expect(page.getByTestId("stat-mon")).toHaveText("42");
  await page.reload();
  await expect(page.getByTestId("stat-mon")).toHaveText("42");
  expect(errors).toEqual([]);
});

test("a missed word returns without extra reward; pause freezes travel and answers", async ({
  page,
}) => {
  await enterTrail(page);
  await page.getByRole("button", { name: "Follow the trail" }).click();
  await page.getByRole("button", { name: "Pause adventure" }).click();
  const position = await page.locator("canvas").getAttribute("data-player-x");
  await page.keyboard.down("d");
  await page.waitForTimeout(200);
  await page.keyboard.up("d");
  expect(await page.locator("canvas").getAttribute("data-player-x")).toBe(
    position,
  );
  await page.getByRole("button", { name: "Back to the trail" }).click();
  await reachSite(page, 0);
  await page.getByRole("button", { name: "Pause encounter" }).click();
  await page.keyboard.press("1");
  await expect(page.locator(".forest-feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the trail" }).click();
  // Restart an unfinished run to exercise the full recovery route from a clean state.
  await page.goto("run?mode=expedition");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Follow the trail" }),
  ).toBeEnabled();
  expect(await completeTrail(page, { mistake: true })).toBe(15);
  const save = await saved(page);
  expect(save.coins).toBe(39);
  expect(
    Object.values(save.progress).reduce((n: number, p: any) => n + p.wrong, 0),
  ).toBe(1);
});

test("guided answers restore the world without earning independent mastery or coins", async ({
  page,
}) => {
  await enterTrail(page);
  expect(await completeTrail(page, { hints: true })).toBe(14);
  const save = await saved(page);
  expect(save.coins).toBe(0);
  expect(
    Object.values(save.progress).every(
      (p: any) => p.correct === 0 && p.prod === 0 && p.mastery === 1,
    ),
  ).toBe(true);
});

test("a missed river stone can be recovered without duplicate rewards", async ({
  page,
}) => {
  await enterTrail(page);
  expect(await completeTrail(page, { crossingMistake: true })).toBe(14);
  const save = await saved(page);
  expect(save.coins).toBe(39);
  expect(save.runsCompleted).toBe(1);
  expect(
    Object.values(save.progress).reduce((n: number, p: any) => n + p.wrong, 0),
  ).toBe(1);
});

test("a failed mist trail can be retried without erasing misses or saving twice", async ({
  page,
}) => {
  await enterTrail(page);
  expect(await completeTrail(page, { dashRetry: true })).toBe(14);
  const save = await saved(page);
  expect(save.coins).toBe(33);
  expect(save.runsCompleted).toBe(1);
  expect(
    Object.values(save.progress).reduce((n: number, p: any) => n + p.wrong, 0),
  ).toBe(3);
});

test("320px layout, keyboard travel, tap travel, reduced motion and focus boundaries", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await enterTrail(page);
  const canvas = page.locator("canvas"),
    before = Number(await canvas.getAttribute("data-player-x"));
  await page.keyboard.down("d");
  await page.waitForTimeout(250);
  await page.keyboard.up("d");
  expect(Number(await canvas.getAttribute("data-player-x"))).toBeGreaterThan(
    before + 10,
  );
  // A real canvas click starts navigation; subsequent keyboard input takes over.
  const y = Number(await canvas.getAttribute("data-player-y"));
  await canvas.click({ position: { x: 160, y: 410 } });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-player-y")))
    .not.toBe(y);
  await reachSite(page, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const button of await page.locator(".forest-answers button").all()) {
    const b = await button.boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: info.outputPath("encounter-320px.png") });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Adventure paused" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest(".forest-pause"),
    ),
  ).toBe(true);
});
