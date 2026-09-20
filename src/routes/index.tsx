import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ForestCanvas } from "@/components/game/forest/ForestCanvas";
import type { ForestBridge } from "@/components/game/forest/ForestScene";
import { useSave } from "@/lib/srs";
import { SoundToggle } from "@/components/SoundToggle";
import { AccountStatus } from "@/components/AccountStatus";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kanji Dash — The Spirit Trail" },
      {
        name: "description",
        content:
          "A little Japanese. A whole new world. Explore Kodama Woods with Aki, restore forgotten places, and learn kanji through a playable forest adventure.",
      },
      { property: "og:title", content: "Kanji Dash — The Spirit Trail" },
      {
        property: "og:description",
        content:
          "Walk the woods. Find their words. A playable Japanese learning adventure.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const save = useSave();
  const [bridge] = useState<ForestBridge>(() => ({
    blocked: false,
    restored: 0,
    preview: true,
    reducedMotion: false,
    onReady: () => {},
    onNear: () => {},
    onInteract: () => {},
    onMote: () => {},
  }));
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      bridge.reducedMotion = media.matches;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [bridge]);
  return (
    <main className="forest-title">
      <ForestCanvas bridge={bridge} />
      <div className="forest-title-shade" />
      <header className="forest-title-header">
        <Link to="/" className="forest-wordmark">
          <span className="forest-seal">森</span>
          <span>
            KANJI DASH<small>A JAPANESE LEARNING ADVENTURE</small>
          </span>
        </Link>
        <Link to="/camp" className="forest-camp-link">
          Your camp <span>↗</span>
        </Link>
      </header>
      <section className="forest-title-copy">
        <span className="forest-eyebrow">
          <i /> THE SPIRIT TRAIL
        </span>
        <h1>
          A little Japanese.
          <br />
          <em>A whole new world.</em>
        </h1>
        <p>
          The forest has forgotten its words.
          <br />
          Walk its paths. Wake its lanterns.
          <br />
          Bring a little wonder back.
        </p>
        <Link
          to="/run"
          search={{ mode: "expedition" }}
          className="forest-primary forest-begin"
        >
          {save.runsCompleted ? "Return to the forest" : "Enter the forest"}
          <span aria-hidden="true">→</span>
        </Link>
        <span className="forest-title-note">
          CHAPTER 01 <i /> KODAMA WOODS <i /> ABOUT 5 MINUTES
        </span>
        <div className="forest-title-modes">
          <Link to="/run" search={{ mode: "stack" }}>
            Word Weaver
          </Link>
          <span>·</span>
          <Link to="/run" search={{ mode: "runner" }}>
            Lantern Dash
          </Link>
          <span>·</span>
          <Link to="/practice">Ink Dojo</Link>
        </div>
      </section>
      <div className="forest-title-caption">
        <span>木霊の森</span>
        <small>There’s a story in every word.</small>
      </div>
      <footer className="forest-title-footer">
        <div className="forest-title-account">
          <AccountStatus />
        </div>
        <div>
          <Link to="/collection">Collection</Link>
          <Link to="/privacy">Privacy</Link>
          <SoundToggle variant="hud" />
        </div>
      </footer>
    </main>
  );
}
