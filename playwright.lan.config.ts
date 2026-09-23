import { networkInterfaces } from "node:os";
import { defineConfig } from "@playwright/test";

// Plain HTTP on a LAN address omits browser Fetch Metadata headers that are
// present on localhost. Exercise the dev middleware on that actual request path.
const address = process.env.LAN_HOST ?? Object.entries(networkInterfaces())
  .filter(([name]) => !/vethernet|virtual|docker|wsl|loopback/i.test(name))
  .flatMap(([, entries]) => entries ?? [])
  .find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;
if (!address) throw new Error("The LAN dev regression test needs a non-loopback IPv4 interface.");
// LAN_PORT can target an already running developer server without starting a
// second Nitro worker against the same workspace.
const port = process.env.LAN_PORT ?? "4175";
const baseURL = `http://${address}:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "level-switching.spec.ts",
  outputDir: "./test-results/lan",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: Boolean(process.env.LAN_PORT),
  },
});
