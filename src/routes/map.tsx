import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { AppIcon } from "@/components/AppIcon";
import { LevelSelector } from "@/components/LevelSelector";
import { CHAPTER_NAMES, LEVEL_CHAPTERS, kanjiOfChapter } from "@/data";
import { useSave, chapterMasteryPct, getCard, getSnapshot, isChapterUnlocked, isGateCleared, isLevelUnlocked, selectLevel } from "@/lib/srs";
import { diffFx, readFx, rememberFx } from "@/lib/celebrations";
import { isAudioRunning, play } from "@/lib/sfx";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "World Map — Kanji Dash" },
      { name: "description", content: `Explore ${LEVEL_CHAPTERS.N5.length} N5 and ${LEVEL_CHAPTERS.N4.length} N4 regions, with 4–6 kanji and a checkpoint seal in each.` },
      { property: "og:title", content: "World Map — Kanji Dash" },
      { property: "og:description", content: "Earn your N5 seal and continue along the N4 road." },
    ],
  }),
  component: MapPage,
});

// YYYY-MM-DD from local date parts: the same day convention srs.ts keeps streak.last in.
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function MapPage() {
  const save = useSave();
  const level = save.selectedLevel;
  const chapters = LEVEL_CHAPTERS[level];
  const levelUnlocked = isLevelUnlocked(save, level);
  const allCleared = chapters.every((ch) => isGateCleared(save, ch));
  const seals = chapters.filter((ch) => isGateCleared(save, ch)).length;
  const nextCheckpoint = chapters.find((ch) => isChapterUnlocked(save, ch) && !isGateCleared(save, ch));

  // Seals not yet in the kanji-dash-fx-v1 record slam in once; seen seals render statically.
  const [newSeals, setNewSeals] = useState<number[]>([]);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // Post-hydration only. getSnapshot() is the loaded save: during hydration useSave() still
  // holds the server snapshot and the store's own re-render lands after this effect.
  useEffect(() => {
    const snapshot = getSnapshot();
    const today = localDay(new Date());
    const changed = diffFx(readFx(), snapshot, today);
    if (changed.newSeals.length > 0) {
      setNewSeals(changed.newSeals);
      try {
        const first = changed.newSeals[0];
        if (first !== undefined) cardRefs.current.get(first)?.scrollIntoView({ block: "center" });
      } catch {
        /* scrolling is cosmetic */
      }
      if (isAudioRunning()) play("sealEarned"); // never creates a context on load
    }
    rememberFx(snapshot, today);
  }, []);

  return (
    <div className="app-shell bg-paper">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 pb-8">
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary sm:mt-8">Your journey</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">The {level} Road</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Small wins, 4–6 kanji at a time. Clear a checkpoint or reach 55% mastery progress to open the next region.
        </p>
        <LevelSelector level={level} preview />

        <section className="mt-5 rounded-2xl border border-border bg-card p-4" aria-label="Checkpoint progress">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">One road. {chapters.length} seals.</span>
            <span className="text-xs font-bold text-primary">{seals} / {chapters.length} earned</span>
          </div>
          <div className="mt-3 grid grid-cols-10 gap-1.5" aria-hidden="true">
            {chapters.map((ch) => <span key={ch} className={`h-1.5 rounded-full ${isGateCleared(save, ch) ? "bg-primary" : "bg-secondary"}`} />)}
          </div>
          {!levelUnlocked && <button type="button" onClick={() => selectLevel("N5")} className="mt-4 min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Continue the N5 road</button>}
        </section>

        {allCleared && (
          <div className="mt-6 flex items-center gap-4 rounded-xl border-2 border-gold bg-card p-5 shadow-sm">
            <div className="flex h-16 w-16 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-2xl font-bold text-primary">
              {level}
            </div>
            <div>
              <div className="font-serif text-lg font-bold">JLPT {level} kanji seal earned!</div>
              <p className="text-sm text-muted-foreground">{level === "N5" ? "Every checkpoint cleared. Your N4 road is now open." : "Both roads explored. Keep revisiting your words to build lasting mastery."}</p>
              {level === "N5" && <button type="button" onClick={() => selectLevel("N4")} className="mt-2 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Start the N4 road →</button>}
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
            const sealIndex = cleared ? newSeals.indexOf(ch) : -1;
            return (
              <li key={ch} className="relative" ref={(el) => { if (el) cardRefs.current.set(ch, el); else cardRefs.current.delete(ch); }}>
                {i < chapters.length - 1 && (
                  <div className="absolute left-[36px] top-16 h-[calc(100%-3rem)] w-0.5 bg-border sm:left-[44px]" />
                )}
                <div className={`relative flex gap-3 rounded-2xl border p-4 sm:gap-4 ${ch === nextCheckpoint ? "glow-next border-primary/50 bg-card shadow-sm" : unlocked ? "border-border bg-card shadow-sm" : "border-dashed border-border bg-secondary/40"}`}>
                  <div aria-hidden="true" className={`z-10 flex h-10 w-10 shrink-0 rotate-[-6deg] items-center justify-center rounded-full border-2 font-serif text-lg font-bold sm:h-14 sm:w-14 sm:border-4 sm:text-xl ${
                    cleared ? "border-primary bg-primary/10 text-primary" : unlocked ? "border-accent bg-card text-accent" : "border-border bg-card text-muted-foreground"
                  }${sealIndex >= 0 ? " relative seal-in" : ""}`} style={sealIndex >= 0 ? { animationDelay: `${200 + sealIndex * 80}ms` } : undefined}>
                    {cleared ? "印" : unlocked ? i + 1 : <AppIcon name="lock" className="h-4 w-4 sm:h-5 sm:w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${ch === nextCheckpoint ? "text-primary" : "text-muted-foreground"}`}>
                      Region {i + 1}{ch === nextCheckpoint ? " · Next checkpoint" : ""}
                    </p>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-serif text-lg font-bold">
                        {CHAPTER_NAMES[ch]!.name} <span className="mt-0.5 block text-sm text-muted-foreground">{CHAPTER_NAMES[ch]!.jp}</span>
                      </h2>
                      <span className="text-xs font-bold text-muted-foreground">{count} kanji · {count}-word checkpoint</span>
                    </div>
                    <p className="mt-2 font-serif text-lg tracking-[0.2em]" aria-label={`Kanji in this region: ${kanji.map((k) => k.c).join("、")}`}>{kanji.map((k) => k.c).join(" ")}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`${CHAPTER_NAMES[ch]!.name} mastery`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground">{unlocked ? `${pct}% progress · ${mastered}/${count} mastered` : !levelUnlocked ? `Locked — earn all ${LEVEL_CHAPTERS.N5.length} N5 checkpoint seals` : "Locked — clear the previous checkpoint or reach 55% progress"}</span>
                      {unlocked && !cleared && (
                        <Link
                          to="/run"
                          search={{ gate: ch }}
                          data-sfx="tap"
                          className="pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-accent-foreground shadow-sm transition-transform"
                        >
                          Prepare checkpoint
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
