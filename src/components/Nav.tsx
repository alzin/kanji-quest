import { Link } from "@tanstack/react-router";
import { useSave, streakCount } from "@/lib/srs";

const links = [
  { to: "/", label: "Home", jp: "家" },
  { to: "/map", label: "Map", jp: "図" },
  { to: "/practice", label: "Dojo", jp: "道" },
  { to: "/collection", label: "Kanji", jp: "字" },
] as const;

export function Nav() {
  const save = useSave();
  const streak = streakCount(save);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-2 sm:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-serif text-lg font-bold text-primary-foreground shadow-sm">
            走
          </span>
          <span className="hidden font-serif text-lg font-bold tracking-tight sm:inline">Kanji Dash</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              className="rounded-md px-1.5 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-3 sm:py-1.5 sm:text-sm"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
          <div className="ml-1 hidden items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold sm:flex">
            <span className="font-serif text-primary">火</span>
            {streak}
            <span className="ml-1 text-gold">●</span>
            {save.coins}
          </div>
        </nav>
      </div>
    </header>
  );
}
