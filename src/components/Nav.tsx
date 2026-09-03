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
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-serif text-lg font-bold text-primary-foreground shadow-sm">
            走
          </span>
          <span className="font-serif text-lg font-bold tracking-tight">Kanji Dash</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              className="rounded-md px-2 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-3"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
          <div className="ml-1 flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold">
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
