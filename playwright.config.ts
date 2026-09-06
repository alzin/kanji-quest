import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/unit/**",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "android-chromium", use: { ...devices["Pixel 5"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node .output/server/index.mjs",
    url: "http://localhost:4173",
    env: { PORT: "4173", HOST: "127.0.0.1" },
    reuseExistingServer: false,
  },
});
