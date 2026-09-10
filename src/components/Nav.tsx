import { Link } from "@tanstack/react-router";
import { useSave, streakCount } from "@/lib/srs";
import { AppIcon } from "@/components/AppIcon";
import { AccountStatus } from "@/components/AccountStatus";

const links = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/map", label: "Map", icon: "map" },
  { to: "/practice", label: "Dojo", icon: "brush" },
  { to: "/collection", label: "Kanji", icon: "kanji" },
] as const;

export function Nav() {
  const save = useSave();
  const streak = streakCount(save);
  return (
    <header className="app-header">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2.5" aria-label="Kanji Dash home">
          <span className="flex h-9 w-9 -rotate-6 items-center justify-center rounded-xl bg-primary font-serif text-xl font-bold text-primary-foreground shadow-sm" aria-hidden="true">
            走
          </span>
          <span className="font-serif text-lg font-bold tracking-tight">Kanji Dash</span>
        </Link>
        <nav className="app-navigation" aria-label="Main navigation">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              preload="intent"
              activeOptions={{ exact: l.to === "/" }}
              className="app-tab"
              activeProps={{ "aria-current": "page" }}
            >
              <span className="app-tab-icon"><AppIcon name={l.icon} /></span>
              <span>{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 text-xs font-bold tabular-nums">
          <span className="flex min-h-9 items-center gap-1 rounded-full bg-primary/8 px-2 text-primary" aria-label={`${streak} day streak`}>
            <AppIcon name="flame" className="h-4 w-4" />
            {streak}
          </span>
          <span className="flex min-h-9 items-center gap-1 rounded-full bg-gold/12 px-2" aria-label={`${save.coins} mon coins`}>
            <AppIcon name="coin" className="h-4 w-4 text-gold" />
            {Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(save.coins)}
          </span>
        </div>
      </div>
      <AccountStatus />
    </header>
  );
}
