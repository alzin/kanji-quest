import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

async function listAssets(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = await Promise.all(entries.map(async (entry) => {
    if (entry.name.startsWith(".")) return [];
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return listAssets(resolve(directory, entry.name), `${path}/`);
    if (path === "sw.js" || !/\.(?:html|js|css|png|svg|ico|webmanifest|woff2?)$/.test(path)) return [];
    return [path];
  }));
  return assets.flat().sort();
}

/** Finish after TanStack's shell prerender, which runs after Nitro's first build. */
export function offlinePwa({ staticExport = false }: { staticExport?: boolean } = {}): Plugin {
  return {
    name: "kanji-dash:offline-pwa",
    apply: "build",
    enforce: "post",
    buildApp: {
      order: "post",
      async handler(builder) {
        const client = builder.environments["client"];
        const server = builder.environments["nitro"];
        if (!client || !server) throw new Error("PWA build requires the client and Nitro environments.");
        const base = builder.config.base;
        if (!base.startsWith("/") || !base.endsWith("/")) {
          throw new Error("The PWA requires an origin-relative base path with a trailing slash.");
        }

        const publicDirectory = resolve(client.config.root, client.config.build.outDir);
        if (staticExport) {
          // GitHub Pages only serves files. Reuse the route-independent shell for
          // initial visits and refreshes; the router retains the URL and query.
          const shell = await readFile(resolve(publicDirectory, "offline.html"));
          const pages = ["index.html", "404.html", ...["map", "practice", "collection", "run"]
            .map((route) => `${route}/index.html`)];
          await Promise.all(pages.map(async (page) => {
            const target = resolve(publicDirectory, page);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, shell);
          }));
          await writeFile(resolve(publicDirectory, ".nojekyll"), "");
        }
        const assets = await listAssets(publicDirectory);
        if (!assets.includes("offline.html")) throw new Error("PWA offline shell was not prerendered.");

        const workerTemplate = await readFile(resolve(builder.config.root, "pwa/sw.js"), "utf8");
        const hash = createHash("sha256").update(workerTemplate);
        for (const asset of assets) {
          hash.update(asset).update(await readFile(resolve(publicDirectory, asset)));
        }
        const version = hash.digest("hex").slice(0, 20);
        const worker = workerTemplate
          .replace("__CACHE_VERSION__", JSON.stringify(version))
          .replace("__PRECACHE_URLS__", JSON.stringify(assets.map((asset) => `${base}${asset}`)));
        await writeFile(resolve(publicDirectory, "sw.js"), worker);

        // Nitro snapshots static-file metadata into the server bundle. Rebuild just
        // that environment now so /offline.html and /sw.js are served with correct
        // MIME types, sizes, and ETags by both `vite preview` and production Node.
        await builder.build(server);
        builder.config.logger.info(`PWA: precached ${assets.length} files (build ${version}).`);
      },
    },
  };
}
