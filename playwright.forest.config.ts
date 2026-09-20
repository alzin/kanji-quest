import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["expedition.spec.ts", "lantern.spec.ts"],
  testIgnore: "**/unit/**",
  outputDir: "./test-results/forest",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:4180", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-chromium",
      use: { viewport: { width: 1440, height: 900 } },
    },
    { name: "android-chromium", use: { ...devices["Pixel 5"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node .output/server/index.mjs",
    url: "http://localhost:4180",
    env: { PORT: "4180", HOST: "127.0.0.1" },
    reuseExistingServer: false,
  },
});
