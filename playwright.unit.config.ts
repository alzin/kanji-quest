import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unit",
  outputDir: "./unit-test-results",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
});
