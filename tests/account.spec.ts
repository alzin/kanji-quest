import { expect, test, type Page } from "@playwright/test";

// API routing must remain observable in WebKit after reloads; PWA behavior has
// its own real-network tests in pwa.spec.ts.
test.use({ serviceWorkers: "block" });

const guestKey = "kanji-dash-guest-v1";
const legacyKey = "kanji-dash-v1";
const userA = { id: "user-a", name: "Aki", email: "aki@gmail.com", picture: null };
const userB = { id: "user-b", name: "Ren", email: "ren@gmail.com", picture: null };
const save = (coins = 0, runsCompleted = 0) => ({
  curriculumVersion: 2, unlockedChapters: [], progress: {}, streak: { count: 0, last: "" },
  coins, runsCompleted, gatesCleared: 0, clearedChapters: [], selectedLevel: "N5",
});
type Cloud = { save: ReturnType<typeof save> | null; version: number };

async function mockApi(page: Page, initialUser: typeof userA | null = null, initialCloud: Cloud = { save: null, version: 0 }) {
  const api = {
    user: initialUser,
    cloud: initialCloud,
    unavailable: false,
    failWrites: false,
    conflictNext: false,
    expireNext: false,
    writes: [] as { save: ReturnType<typeof save>; expectedVersion: number; csrf: string | undefined }[],
    logoutHeaders: [] as (string | undefined)[],
    readHeaders: [] as (string | undefined)[],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (api.unavailable) return route.abort("failed");
    if (path === "/api/auth/session") return route.fulfill({ json: { user: api.user, ...(api.user ? { csrfToken: `csrf-${api.user.id}` } : {}) } });
    if (path === "/api/auth/google") {
      api.user = userA;
      // WebKit cannot fulfill intercepted requests with a redirect status.
      // Real OAuth redirects are checked by the backend HTTP tests.
      const destination = new URL("./?auth=success", page.url()).href;
      return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(destination)})</script>` });
    }
    if (path === "/api/auth/logout") {
      api.logoutHeaders.push(request.headers()["x-csrf-token"]);
      api.user = null;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/progress" && request.method() === "GET") {
      api.readHeaders.push(request.headers()["x-csrf-token"]);
      return route.fulfill({ json: api.cloud });
    }
    if (path === "/api/progress" && request.method() === "PUT") {
      const body = request.postDataJSON() as { save: ReturnType<typeof save>; expectedVersion: number };
      api.writes.push({ ...body, csrf: request.headers()["x-csrf-token"] });
      if (api.expireNext) {
        api.expireNext = false;
        api.user = null;
        return route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Session ended" } } });
      }
      if (api.failWrites) return route.abort("failed");
      if (api.conflictNext) {
        api.conflictNext = false;
        api.cloud = { save: save(99, 9), version: api.cloud.version + 1 };
      }
      if (body.expectedVersion !== api.cloud.version) return route.fulfill({ status: 409, json: { error: { code: "PROGRESS_CONFLICT", message: "Newer save" }, current: api.cloud } });
      api.cloud = { save: body.save, version: api.cloud.version + 1 };
      return route.fulfill({ json: api.cloud });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return api;
}

async function seedGuest(page: Page, value: ReturnType<typeof save>) {
  await page.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem("account-test-seeded")) return;
    sessionStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem("account-test-seeded", "yes");
  }, { key: guestKey, value });
}

const status = (page: Page, message: string) => page.getByText(message, { exact: true });
const saveDialog = (page: Page) => page.getByRole("dialog");
const saveButton = (page: Page) => page.getByRole("button", { name: "Save your progress" });
async function selectN4(page: Page) {
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: /^N4 / }).click();
}

test("guests can use the app, retain only tab progress, and never rewrite legacy saves", async ({ page, context }) => {
  const api = await mockApi(page);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: legacyKey, value: save(777, 77) });
  await page.goto("./");
  await expect(saveButton(page)).toBeEnabled();
  // Nothing is at stake yet, so nothing interrupts a new player.
  await expect(saveDialog(page)).toHaveCount(0);
  await expect(page.getByLabel("0 mon coins", { exact: true })).toBeVisible();
  await selectN4(page);
  await expect(page.getByRole("button", { name: /^N4 / })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: /^N4 / })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).coins, legacyKey)).toBe(777);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("kanji-dash-account-v1:")))).toEqual([]);
  expect(api.writes).toHaveLength(0);
  const other = await context.newPage();
  await mockApi(other);
  await other.goto("./");
  expect(await other.evaluate((key) => sessionStorage.getItem(key), guestKey)).toBeNull();
  await expect(other.getByRole("button", { name: /^N5 / })).toHaveAttribute("aria-pressed", "true");
});

test("Google sign-in transfers guest progress, saves with CSRF, and sign-out isolates accounts", async ({ page }) => {
  const api = await mockApi(page);
  await seedGuest(page, save(55, 3));
  await page.goto("./");
  await expect(page.getByLabel("55 mon coins", { exact: true })).toBeVisible();
  // The header keeps one quiet way in; the offer itself follows a finished run.
  await saveButton(page).click();
  await expect(saveDialog(page).getByRole("heading", { name: "Keep your progress" })).toBeVisible();
  await saveDialog(page).getByRole("button", { name: "Continue with Google" }).click();
  await expect(status(page, "Progress saved to your account.")).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(api.readHeaders).toEqual(["csrf-user-a"]);
  expect(api.writes[0]).toMatchObject({ expectedVersion: 0, csrf: "csrf-user-a", save: { coins: 55, runsCompleted: 3 } });
  expect(await page.evaluate((key) => sessionStorage.getItem(key), guestKey)).toBeNull();
  // Identity only: a name, no email and no account chrome.
  await expect(saveDialog(page)).toHaveCount(0);
  await expect(page.getByText("Signed in as Aki", { exact: true })).toBeVisible();
  await expect(page.getByText("aki@gmail.com")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  api.user = userB;
  api.cloud = { save: save(222, 8), version: 4 };
  await page.reload();
  await expect(page.getByLabel("222 mon coins", { exact: true })).toBeVisible();
  await expect(page.getByText("Signed in as Ren", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kanji-dash-account-v1:user-a")!).save.coins)).toBe(55);
});

test("existing cloud and guest progress require a choice, including after reloading", async ({ page }) => {
  const api = await mockApi(page, userA, { save: save(80, 8), version: 7 });
  await seedGuest(page, save(20, 2));
  await page.goto("./");
  await expect(saveDialog(page).getByRole("heading", { name: "Two versions of your progress are available" })).toBeVisible();
  expect(api.writes).toHaveLength(0);
  await page.reload();
  await expect(saveDialog(page).getByRole("button", { name: "Keep cloud progress" })).toBeVisible();
  expect(api.writes).toHaveLength(0);
  await saveDialog(page).getByRole("button", { name: "Keep cloud progress" }).click();
  await expect(page.getByLabel("80 mon coins", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(0);
});

test("a concurrent cloud save cannot be overwritten until the user chooses a version", async ({ page }) => {
  const api = await mockApi(page, userA, { save: save(30, 3), version: 7 });
  await page.goto("./");
  await expect(status(page, "Progress saved to your account.")).toBeVisible();
  api.conflictNext = true;
  await selectN4(page);
  await expect(saveDialog(page).getByRole("button", { name: "Use this device’s progress" })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(api.cloud.save?.coins).toBe(99);
  await saveDialog(page).getByRole("button", { name: "Use this device’s progress" }).click();
  await expect(status(page, "Progress saved to your account.")).toBeVisible();
  expect(api.writes.map((write) => write.expectedVersion)).toEqual([7, 8]);
  expect(api.cloud.save).toMatchObject({ coins: 30, selectedLevel: "N4" });
});

test("offline edits retain their original version across reload and retry safely", async ({ page }) => {
  const api = await mockApi(page, userA, { save: save(40, 4), version: 4 });
  await page.goto("./");
  await expect(status(page, "Progress saved to your account.")).toBeVisible();
  api.failWrites = true;
  await selectN4(page);
  // The header flags the problem; the fix lives in the dialog it opens.
  await page.getByRole("button", { name: "Not saved" }).click();
  await expect(saveDialog(page).getByRole("button", { name: "Retry cloud connection" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kanji-dash-account-v1:user-a")!).version)).toBe(4);
  api.failWrites = false;
  api.cloud = { save: save(60, 6), version: 5 };
  await page.reload();
  await expect(saveDialog(page).getByRole("button", { name: "Keep cloud progress" })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  await saveDialog(page).getByRole("button", { name: "Keep cloud progress" }).click();
  await expect(page.getByLabel("60 mon coins", { exact: true })).toBeVisible();
});

test("legacy browser progress imports only by an explicit choice and remains recoverable", async ({ page }) => {
  const api = await mockApi(page, userA, { save: save(10, 1), version: 2 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: legacyKey, value: save(70, 7) });
  await page.goto("./");
  await expect(page.getByLabel("10 mon coins", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(0);
  await expect(saveDialog(page).getByRole("heading", { name: "Earlier progress found" })).toBeVisible();
  await saveDialog(page).getByRole("button", { name: "Import previous browser save", exact: true }).click();
  await saveDialog(page).getByRole("button", { name: "Use previous browser save", exact: true }).click();
  await expect(status(page, "Progress saved to your account.")).toBeVisible();
  expect(api.writes[0]).toMatchObject({ expectedVersion: 2, save: { coins: 70 } });
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).coins, legacyKey)).toBe(70);
});

test("session expiry retains the old account cache without handing it to another account", async ({ page }) => {
  const api = await mockApi(page, userA, { save: save(40, 4), version: 4 });
  await page.goto("./");
  await expect(status(page, "Progress saved to your account.")).toBeVisible();
  api.expireNext = true;
  await selectN4(page);
  // A lost session is exactly when the sign-in offer should come back, and it says why.
  await expect(saveDialog(page).getByText("Your session ended. Sign in again to recover this account’s pending progress.")).toBeVisible();
  await expect(saveDialog(page).getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("0 mon coins", { exact: true })).toBeVisible();
  api.user = userB;
  api.cloud = { save: null, version: 0 };
  await page.reload();
  await expect(page.getByText("Signed in as Ren", { exact: true })).toBeVisible();
  await expect(page.getByLabel("0 mon coins", { exact: true })).toBeVisible();
  expect(api.writes).toHaveLength(1);
});

test("an unavailable backend keeps guest play available and offers an honest retry", async ({ page }) => {
  const api = await mockApi(page);
  api.unavailable = true;
  await page.goto("./");
  await expect(status(page, "Cloud saves are unavailable. You can keep playing in this tab and retry.")).toBeVisible();
  await saveButton(page).click();
  await expect(saveDialog(page).getByRole("button", { name: "Retry cloud connection" })).toBeVisible();
  await page.keyboard.press("Escape");
  await selectN4(page);
  api.unavailable = false;
  await saveButton(page).click();
  await saveDialog(page).getByRole("button", { name: "Retry cloud connection" }).click();
  await expect(saveDialog(page).getByRole("button", { name: "Retry cloud connection" })).toHaveCount(0);
  expect(api.writes).toHaveLength(0);
});
