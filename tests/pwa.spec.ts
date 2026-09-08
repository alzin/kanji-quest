import { completePreparation } from "./helpers/preparation";
import { expect, test, type Page } from "@playwright/test";
import { createServer, request as proxyRequest } from "node:http";
import type { AddressInfo } from "node:net";

async function prepareOfflineCopy(page: Page, origin = "./") {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Learn. Recall. Run." })).toBeVisible();
  // Wait for activation to claim this page before a reload can interrupt setup.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Exercise a document served by the installed worker as well as the first SSR load.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test("serves install metadata and valid Android/iOS icons", async ({ page, request, browserName, baseURL }) => {
  await prepareOfflineCopy(page);
  const manifestURL = new URL("manifest.webmanifest", baseURL).href;
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", new URL(manifestURL).pathname);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);

  const response = await request.get(manifestURL);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "Kanji Dash", id: "./", start_url: "./", scope: "./", display: "standalone" });
  expect(new URL(manifest.start_url, manifestURL).href).toBe(new URL("./", baseURL).href);
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", purpose: "any" }),
    expect.objectContaining({ sizes: "512x512", purpose: "any" }),
    expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
  ]));
  expect(manifest.screenshots).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "screenshots/run.png", sizes: "780x1688", form_factor: "narrow" }),
    expect.objectContaining({ src: "screenshots/map.png", sizes: "780x1688", form_factor: "narrow" }),
  ]));
  for (const asset of [...manifest.icons, ...manifest.screenshots, { src: "apple-touch-icon.png", sizes: "180x180" }]) {
    const image = await request.get(new URL(asset.src, manifestURL).href);
    expect(image.ok()).toBe(true);
    const bytes = await image.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(asset.sizes);
  }

  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Page.enable");
    const { installabilityErrors } = await session.send("Page.getInstallabilityErrors");
    expect(installabilityErrors).toEqual([]);
    await session.detach();
  }
});

test("opens every game screen offline after visiting only home", async ({ page, context, baseURL, browserName }) => {
  // Use a private origin so shutting its server down doesn't interrupt other tests.
  // Windows WebKit's setOffline(true) fails before invoking service workers, even
  // for synthetic responses. A stopped server tests the actual offline behavior.
  const proxy = createServer((request, response) => {
    const upstream = proxyRequest(new URL(request.url!, baseURL), {
      method: request.method,
      headers: request.headers,
    }, (result) => {
      response.writeHead(result.statusCode!, result.headers);
      result.pipe(response);
    });
    upstream.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}${new URL(baseURL!).pathname.replace(/\/$/, "")}`;
  const stopServer = async () => {
    if (!proxy.listening) return;
    proxy.closeAllConnections();
    await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
  };

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("https://**/*", (route) => route.abort("internetdisconnected"));
    await prepareOfflineCopy(page, `${origin}/`);
    const savedProgress = {
      progress: {}, streak: { count: 0, last: "" }, coins: 37, runsCompleted: 4, gatesCleared: 0,
    };
    await page.evaluate((save) => localStorage.setItem("kanji-dash-v1", JSON.stringify(save)), savedProgress);
    await stopServer();
    await expect(fetch(origin)).rejects.toThrow();
    if (browserName === "chromium") await context.setOffline(true);

    for (const [path, heading] of [
      ["/map", "The N5 Road"],
      ["/practice", "Stroke Dojo"],
      ["/collection", "Kanji Collection"],
    ]) {
      const response = await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible();
    }

    await page.goto(`${origin}/run?gate=3`, { waitUntil: "domcontentloaded" });
    await completePreparation(page);
    await expect(page.getByLabel("Kanji runner game")).toBeVisible();
    await expect(page.getByText("Town of People — Checkpoint", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/run\/?\?gate=3$/);
    await page.getByRole("button", { name: "Pause game", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resume game", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.goto(`${origin}/run`, { waitUntil: "domcontentloaded" });
    await completePreparation(page);
    await expect(page.getByLabel("Kanji runner game")).toBeVisible();
    await page.getByRole("button", { name: "Pause game", exact: true }).click();
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("4 runs", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kanji-dash-v1")!))).toEqual(savedProgress);
    expect(errors).toEqual([]);
  } finally {
    await stopServer();
  }
});

test("shows platform installation help and handles the Android prompt", async ({ page, browserName }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Keep Kanji Dash one tap away" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install app", exact: true })).toBeVisible();
  if (browserName === "webkit") {
    await page.getByRole("button", { name: "Install app", exact: true }).click();
    await expect(page.getByText("Open this page in Safari, then tap Share.")).toBeVisible();
    await expect(page.getByText("If shown, turn on Open as Web App, then tap Add.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Install app", exact: true })).toHaveAttribute("aria-expanded", "true");
  } else {
    // Browser install dialogs require a real device. Exercise the one-use event contract here.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
    await page.getByRole("button", { name: "Install app", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("You can install later using your browser's menu.");
    // The one-use prompt is consumed, but the button still offers manual help.
    await page.getByRole("button", { name: "Install app", exact: true }).click();
    await expect(page.getByText(/Open your browser's menu and choose Install app/)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.getByRole("heading", { name: "Keep Kanji Dash one tap away" })).toHaveCount(0);
  }
});

test("opens a checkpoint directly before any service worker is installed", async ({ page }) => {
  const response = await page.goto("run?gate=3", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await completePreparation(page);
  await expect(page.getByLabel("Kanji runner game")).toBeVisible();
  await expect(page.getByText("Town of People — Checkpoint", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/run\/?\?gate=3$/);
  await page.getByRole("button", { name: "Pause game", exact: true }).click();
});

test("keeps a pending install prompt across game navigation", async ({ page }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Install app", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The N5 Road", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    let calls = 0;
    Object.defineProperty(window, "__installPromptCalls", { get: () => calls, configurable: true });
    Object.assign(event, {
      prompt: async () => { calls += 1; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Keep Kanji Dash one tap away" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __installPromptCalls?: number }).__installPromptCalls)).toBe(1);
});

test("explains the secure preview requirement on an insecure connection", async ({ page }) => {
  // Model a phone visiting the server's LAN HTTP address; loopback itself is trusted.
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { get: () => false });
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(page.getByText(/This network address uses HTTP/)).toBeVisible();
  await expect(page.getByText(/Open the production preview over trusted HTTPS/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Install app", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Open this page in Safari, then tap Share.")).toHaveCount(0);
});

test("hides installation help when launched as an installed app", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { get: () => true });
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Learn. Recall. Run." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep Kanji Dash one tap away" })).toHaveCount(0);
});
