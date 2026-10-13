import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorldHub, type HubSearch } from "@/components/hub/WorldHub";
import { levelOfChapter } from "@/data";

const stopOf = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? parseInt(value) : NaN;
  return levelOfChapter(n) ? n : undefined;
};

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HubSearch => {
    const stop = stopOf(s["stop"]);
    return {
      ...(s["panel"] === "camp" || s["panel"] === "journey" ? { panel: s["panel"] } : {}),
      ...(stop !== undefined ? { stop } : {}),
      ...(s["title"] === true || s["title"] === "true" || s["title"] === 1 || s["title"] === "1" ? { title: true as const } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Kanji Dash — The Spirit Trail" },
      {
        name: "description",
        content:
          "A little Japanese. A whole new world. Walk the Kanji Journey from N5 to N1 with Aki: explore forest trails, restore forgotten places, and earn a seal at every checkpoint.",
      },
      { property: "og:title", content: "Kanji Dash — The Spirit Trail" },
      {
        property: "og:description",
        content: "Walk the woods. Find their words. A playable Japanese learning adventure, N5 to N1.",
      },
    ],
  }),
  component: Hub,
});

function Hub() {
  const search = Route.useSearch();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // The map is drawn from the saved journey, which only exists in this browser after hydration.
  // Until then (and for crawlers) a quiet splash names the game and keeps the legal links reachable.
  if (!ready)
    return (
      <main className="forest-game hub-splash">
        <div className="forest-loading">
          <span className="forest-seal" aria-hidden="true">森</span>
          <h1>Kanji Dash — The Spirit Trail</h1>
          <p>A little Japanese. A whole new world. Unrolling the map…</p>
          <nav aria-label="Legal" className="hub-splash-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </div>
      </main>
    );
  return <WorldHub search={search} />;
}
