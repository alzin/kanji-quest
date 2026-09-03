import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { CHAPTER_NAMES, CHAPTER_COUNT, kanjiOfChapter } from "@/data/n5";
import { useSave, chapterMasteryPct, isChapterUnlocked, isGateCleared } from "@/lib/srs";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "World Map — Kanji Dash" },
      { name: "description", content: "Your journey across six regions of JLPT N5 kanji, with checkpoint gates and hanko seals." },
      { property: "og:title", content: "World Map — Kanji Dash" },
      { property: "og:description", content: "Six regions, six checkpoint gates, one N5 badge." },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const save = useSave();
  const chapters = Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1);
  const allCleared = chapters.every((ch) => isGateCleared(save, ch));

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 pb-16">
        <h1 className="mt-8 font-serif text-3xl font-bold">The N5 Road</h1>
        <p className="mt-1 text-muted-foreground">
          Master 55% of a region's kanji to open the next. Stamp each checkpoint gate to earn your N5 seal.
        </p>

        {allCleared && (
          <div className="mt-6 flex items-center gap-4 rounded-xl border-2 border-gold bg-card p-5 shadow-sm">
            <div className="flex h-16 w-16 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-2xl font-bold text-primary">
              N5
            </div>
            <div>
              <div className="font-serif text-lg font-bold">JLPT N5 kanji seal earned!</div>
              <p className="text-sm text-muted-foreground">Every checkpoint cleared. The N4 road awaits in a future update.</p>
            </div>
          </div>
        )}

        <ol className="mt-8 space-y-0">
          {chapters.map((ch, i) => {
            const unlocked = isChapterUnlocked(save, ch);
            const pct = chapterMasteryPct(save, ch);
            const cleared = isGateCleared(save, ch);
            const count = kanjiOfChapter(ch).length;
            return (
              <li key={ch} className="relative">
                {i < chapters.length - 1 && (
                  <div className="absolute left-[27px] top-16 h-[calc(100%-3rem)] w-0.5 bg-border" />
                )}
                <div className={`relative flex gap-4 rounded-xl border p-4 ${unlocked ? "border-border bg-card shadow-sm" : "border-dashed border-border bg-secondary/50 opacity-70"}`}>
                  <div className={`z-10 flex h-14 w-14 shrink-0 rotate-[-6deg] items-center justify-center rounded-full border-4 font-serif text-xl font-bold ${
                    cleared ? "border-primary bg-primary/10 text-primary" : unlocked ? "border-accent bg-card text-accent" : "border-border bg-card text-muted-foreground"
                  }`}>
                    {cleared ? "印" : ch}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-serif text-lg font-bold">
                        {CHAPTER_NAMES[ch]!.name} <span className="ml-1 text-sm text-muted-foreground">{CHAPTER_NAMES[ch]!.jp}</span>
                      </h2>
                      <span className="text-xs font-bold text-muted-foreground">{count} kanji</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{unlocked ? `${pct}% mastered` : "Locked — master the previous region"}</span>
                      {unlocked && !cleared && (
                        <Link
                          to="/run"
                          search={{ gate: ch }}
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground shadow-sm transition-transform hover:scale-105"
                        >
                          Checkpoint gate
                        </Link>
                      )}
                      {cleared && <span className="text-xs font-bold text-primary">Seal stamped ✓</span>}
                    </div>
                  </div>
                </div>
                <div className="h-4" />
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
