import { expect, test, type Page } from "@playwright/test";
import { clearRiver } from "./helpers/river";
import { campPanel, openCamp, skipTitle } from "./helpers/hub";
import { silenceSavePrompt } from "./helpers/savePrompt";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-device";

/** Test browsers cannot reach a real push service, so the browser's push API is faked
 * for every tab; the permission and subscription persist across reloads like the real ones. */
async function fakePush(page: Page) {
  await page.context().addInitScript((endpoint) => {
    const read = () => localStorage.getItem("test-push-subscription") === "1";
    const subscription = () => ({
      endpoint, options: { applicationServerKey: null },
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }),
      unsubscribe: async () => { localStorage.removeItem("test-push-subscription"); return true; },
    });
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => localStorage.getItem("test-push-permission") ?? "default" });
    Notification.requestPermission = async () => { localStorage.setItem("test-push-permission", "granted"); return "granted"; };
    PushManager.prototype.getSubscription = async function () { return (read() ? subscription() : null) as unknown as PushSubscription; };
    PushManager.prototype.subscribe = async function () { localStorage.setItem("test-push-subscription", "1"); return subscription() as unknown as PushSubscription; };
  }, ENDPOINT);
}

async function fakeApi(page: Page, publicKey: string | null) {
  const saved: Record<string, unknown>[] = [], removed: string[] = [];
  // Context routes also see requests that pass through the installed service worker.
  await page.context().route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/api/reminders")) return route.fulfill({ json: { publicKey } });
    if (pathname.endsWith("/api/reminders/subscription")) { saved.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }); }
    if (pathname.endsWith("/api/reminders/unsubscribe")) { removed.push(route.request().postDataJSON().endpoint); return route.fulfill({ status: 204 }); }
    if (pathname.endsWith("/api/auth/session")) return route.fulfill({ json: { user: null } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Not found" } } });
  });
  return { saved, removed };
}

async function finishSheet(page: Page) {
  await page.clock.install();
  await silenceSavePrompt(page);
  await page.goto("run", { waitUntil: "domcontentloaded" });
  const learn = page.getByRole("heading", { name: /^Meet (your new|this region’s) words$/ });
  await expect(learn.or(page.getByTestId("stack-start"))).toBeVisible();
  if (await learn.isVisible()) {
    const words = page.getByRole("region", { name: "Words in this run" }).getByRole("button");
    for (let i = 0; i < await words.count(); i++) await words.nth(i).click();
    await page.getByRole("button", { name: "Start stacking" }).click();
  }
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.getByTestId("stack-start").click();
  await expect.poll(async () => { await page.clock.runFor(100); return page.locator(".river-canvas canvas[data-ready]").count(); }).toBe(1);
  await clearRiver(page);
  await expect(page.getByTestId("stack-results")).toBeVisible();
}

test.describe("on browsers with Web Push", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Uses Chromium's PushManager");

  test("a finished run offers a daily reminder, and camp turns it off again", async ({ page }) => {
    await fakePush(page);
    const api = await fakeApi(page, "B".repeat(87));
    await finishSheet(page);
    const offer = page.getByTestId("reminder-offer");
    await expect(offer).toContainText("Never miss a day");
    await offer.getByLabel("Reminder time").selectOption("20");
    await offer.getByRole("button", { name: "Remind me" }).click();
    await expect(offer).toContainText("Reminders on");
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
    expect(api.saved.at(-1)).toEqual({
      subscription: { endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } },
      timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      hour: 20, lastPlayedOn: today, streak: 1,
    });

    // The run froze the clock, which the map's entrance relies on.
    await page.clock.resume();
    const camp = await page.context().newPage();
    await skipTitle(camp);
    await openCamp(camp);
    const toggle = campPanel(camp).getByRole("switch", { name: /Daily reminder on/ });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(campPanel(camp).getByLabel("Reminder time")).toHaveValue("20");
    await toggle.click();
    await expect(campPanel(camp).getByRole("switch", { name: /Daily reminder off/ })).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => api.removed).toEqual([ENDPOINT]);
  });

  test("not now hides the offer, and nothing shows when the API has no keys", async ({ page }) => {
    await fakePush(page);
    await fakeApi(page, "B".repeat(87));
    await finishSheet(page);
    await page.getByTestId("reminder-offer").getByRole("button", { name: "Not now" }).click();
    await expect(page.getByTestId("reminder-offer")).toHaveCount(0);

    await page.context().unrouteAll();
    await fakeApi(page, null);
    await page.clock.resume();
    const camp = await page.context().newPage();
    await skipTitle(camp);
    const lookup = camp.waitForRequest("**/api/reminders");
    await openCamp(camp);
    await lookup;
    await expect(campPanel(camp).getByRole("button", { name: /music/i })).toBeVisible();
    await expect(campPanel(camp).getByRole("switch", { name: /Daily reminder/ })).toHaveCount(0);
  });
});

test("an iPhone browser tab is told to add the game to the Home Screen first", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "iPhone only");
  await fakeApi(page, "B".repeat(87));
  await openCamp(page);
  await expect(campPanel(page)).toContainText("Daily reminders: add Kanji Dash to your Home Screen");
});
