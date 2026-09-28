import { defineConfig, devices } from "@playwright/test";

// The adventure probe is intentionally development-only and read-only. This suite
// drives real keyboard/pointer controls while using it to read upcoming terrain.
const baseURL = process.env["FIREFLY_BASE_URL"] ?? "http://localhost:3000";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["firefly.spec.ts", "account.spec.ts", "runner.spec.ts", "preparation.spec.ts", "lantern.spec.ts", "pronunciation.spec.ts"],
  testIgnore: "**/unit/**",
  outputDir: "./test-results/firefly",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure", serviceWorkers: "block" },
  projects: [
    { name: "desktop-chromium", use: { viewport: { width: 1440, height: 900 } } },
    { name: "android-chromium", use: { ...devices["Pixel 5"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: { command: "npm run dev -- --port 3000", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
