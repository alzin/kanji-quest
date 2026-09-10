import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { offlinePwa } from "./build/pwa";

export default defineConfig(({ mode }) => {
  const pagesBuild = mode === "pages";
  const basePath = (process.env["VITE_BASE_PATH"] ?? (pagesBuild ? "/kanji-quest/" : "/"))
    .replace(/^\/+|\/+$/g, "");
  const base = basePath ? `/${basePath}/` : "/";

  return {
    base,
    server: {
      proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } },
    },
    plugins: [
      tailwindcss(),
      tanstackStart({
        server: {
          entry: "server",
        },
        srcDirectory: "src",
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
        },
        pages: [{
          path: "/",
          prerender: {
            outputPath: "/offline",
            autoSubfolderIndex: false,
            crawlLinks: false,
            headers: { "X-TSS_SHELL": "true" },
          },
        }],
      }),
      viteReact(),
      nitro({
        devProxy: {
          "/api/**": { target: "http://127.0.0.1:3001", changeOrigin: true },
        },
        routeRules: {
          "/sw.js": { headers: { "cache-control": "no-cache" } },
          "/offline.html": { headers: { "cache-control": "no-cache" } },
          "/manifest.webmanifest": { headers: { "cache-control": "no-cache" } },
        },
      }),
      tsconfigPaths(),
      offlinePwa({ staticExport: pagesBuild }),
    ],
  };
});
