import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  use: { ...config.use, baseURL: "http://localhost:4173/kanji-quest/" },
  webServer: {
    command: "node tests/static-server.mjs",
    url: "http://localhost:4173/kanji-quest/",
    reuseExistingServer: false,
  },
});
