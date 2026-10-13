import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { AccountStatus } from "@/components/AccountStatus";
import { SoundToggle } from "@/components/SoundToggle";
import { streakCount, useSave } from "@/lib/srs";

/** Where "← Map" lands: the hub, optionally focused on a stop or with a panel open. */
export type MapTarget = { stop?: number; panel?: "camp" | "journey" };

/** Streak and mon, the two numbers every game screen keeps in the corner. */
export function ResourceChips() {
  const save = useSave();
  const streak = streakCount(save);
  return (
    <>
      <span className="game-chip" aria-label={`${streak} day streak`} title="Day streak">
        <AppIcon name="flame" />
        <b>{streak}</b>
      </span>
      <span className="game-chip game-chip-mon" aria-label={`${save.coins} mon coins`} title="Mon collected">
        <AppIcon name="coin" />
        <b>{Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(save.coins)}</b>
      </span>
    </>
  );
}

/**
 * The one header every screen outside the overworld wears: a labelled way back to
 * the map on the left, the traveller's resources on the right. It replaces the
 * old website tab bar, so leaving any screen always means "back to the map".
 */
export function GameHud({ back = {}, title, minimal = false }: { back?: MapTarget | false | undefined; title?: string | undefined; minimal?: boolean }) {
  return (
    <header className="game-hud">
      <div className="game-hud-left">
        {back !== false && (
          <Link to="/" search={back} className="game-hud-button" data-sfx="tap">
            <AppIcon name="map" />
            <span>Map</span>
          </Link>
        )}
        {title && (
          <span className="game-hud-title">
            <span className="forest-seal" aria-hidden="true">森</span>
            <span>{title}</span>
          </span>
        )}
      </div>
      <div className="game-hud-right">
        {!minimal && <ResourceChips />}
        <AccountStatus />
        <SoundToggle variant="hud" />
      </div>
    </header>
  );
}

/** A full game screen: forest night backdrop, the shared HUD, then the content. */
export function GameScreen({ back, title, hud = "full", className, children }: {
  back?: MapTarget | false;
  title?: string;
  hud?: "full" | "minimal" | "none";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`game-screen ${className ?? ""}`}>
      {hud !== "none" && <GameHud back={back} title={title} minimal={hud === "minimal"} />}
      <main className="game-screen-main">{children}</main>
    </div>
  );
}
