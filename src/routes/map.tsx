import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { AppIcon } from "@/components/AppIcon";
import { CHAPTER_NAMES, CHAPTER_COUNT, kanjiOfChapter } from "@/data/n5";
import { useSave, chapterMasteryPct, getCard, isChapterUnlocked, isGateCleared } from "@/lib/srs";

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
  const seals = chapters.filter((ch) => isGateCleared(save, ch)).length;
  const nextCheckpoint = chapters.find((ch) => isChapterUnlocked(save, ch) && !isGateCleared(save, ch));

  return (
    <div className="app-shell bg-paper">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 pb-8">
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary sm:mt-8">Your journey</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">The N5 Road</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Reach 55% mastery progress in a region to open the next. Learning and reviewing kanji contribute partial progress. Stamp each checkpoint gate to earn your N5 seal.
        </p>

        <section className="mt-5 rounded-2xl border border-border bg-card p-4" aria-label="Checkpoint progress">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">One road. {CHAPTER_COUNT} seals.</span>
            <span className="text-xs font-bold text-primary">{seals} / {CHAPTER_COUNT} earned</span>
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">
            {chapters.map((ch) => <span key={ch} className={`h-1.5 flex-1 rounded-full ${isGateCleared(save, ch) ? "bg-primary" : "bg-secondary"}`} />)}
          </div>
          <Link to="/run" search={{ gate: undefined }} className="pressable mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform">
            Continue daily run <AppIcon name="arrow" className="h-4 w-4" />
          </Link>
        </section>

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

        <ol className="mt-6 space-y-0">
          {chapters.map((ch, i) => {
            const unlocked = isChapterUnlocked(save, ch);
            const pct = chapterMasteryPct(save, ch);
            const cleared = isGateCleared(save, ch);
            const kanji = kanjiOfChapter(ch);
            const count = kanji.length;
            const mastered = kanji.filter((entry) => getCard(save, entry.c).mastery === 3).length;
            return (
              <li key={ch} className="relative">
                {i < chapters.length - 1 && (
                  <div className="absolute left-[36px] top-16 h-[calc(100%-3rem)] w-0.5 bg-border sm:left-[44px]" />
                )}
                <div className={`relative flex gap-3 rounded-2xl border p-4 sm:gap-4 ${ch === nextCheckpoint ? "border-primary/50 bg-card shadow-sm" : unlocked ? "border-border bg-card shadow-sm" : "border-dashed border-border bg-secondary/40"}`}>
                  <div aria-hidden="true" className={`z-10 flex h-10 w-10 shrink-0 rotate-[-6deg] items-center justify-center rounded-full border-2 font-serif text-lg font-bold sm:h-14 sm:w-14 sm:border-4 sm:text-xl ${
                    cleared ? "border-primary bg-primary/10 text-primary" : unlocked ? "border-accent bg-card text-accent" : "border-border bg-card text-muted-foreground"
                  }`}>
                    {cleared ? "印" : unlocked ? ch : <AppIcon name="lock" className="h-4 w-4 sm:h-5 sm:w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${ch === nextCheckpoint ? "text-primary" : "text-muted-foreground"}`}>
                      Region {ch}{ch === nextCheckpoint ? " · Next checkpoint" : ""}
                    </p>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-serif text-lg font-bold">
                        {CHAPTER_NAMES[ch]!.name} <span className="ml-1 text-sm text-muted-foreground">{CHAPTER_NAMES[ch]!.jp}</span>
                      </h2>
                      <span className="text-xs font-bold text-muted-foreground">{count} kanji</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`${CHAPTER_NAMES[ch]!.name} mastery`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">{unlocked ? `${pct}% progress · ${mastered}/${count} mastered` : "Locked — reach 55% progress in the previous region"}</span>
                      {unlocked && !cleared && (
                        <Link
                          to="/run"
                          search={{ gate: ch }}
                          className="pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-accent-foreground shadow-sm transition-transform"
                        >
                          Checkpoint gate
                          <AppIcon name="arrow" className="h-4 w-4" />
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
