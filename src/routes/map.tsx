import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { AppIcon } from "@/components/AppIcon";
import { LevelSelector } from "@/components/LevelSelector";
import { CHAPTER_NAMES, LEVEL_CHAPTERS, kanjiOfChapter, previousLevel, nextLevel } from "@/data";
import { useSave, chapterMasteryPct, getCard, getSnapshot, isChapterUnlocked, isGateCleared, isLevelUnlocked, selectLevel } from "@/lib/srs";
import { diffFx, readFx, rememberFx } from "@/lib/celebrations";
import { isAudioRunning, play } from "@/lib/sfx";
import { stackOf } from "@/lib/stack-progress";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "World Map — Kanji Dash" },
      { name: "description", content: `Explore ${LEVEL_CHAPTERS.N5.length} N5, ${LEVEL_CHAPTERS.N4.length} N4 and ${LEVEL_CHAPTERS.N3.length} N3 regions, with 4–6 kanji and a checkpoint seal in each.` },
      { property: "og:title", content: "World Map — Kanji Dash" },
      { property: "og:description", content: "Earn your seals along the N5, N4 and N3 roads." },
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
  const previous = previousLevel(level);
  const next = nextLevel(level);
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
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary sm:mt-8">Your journey</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">The {level} Road</h1>
        <p className="mt-1 font-serif text-sm text-accent">{{ N5: "東海道 · Tōkaidō", N4: "中山道 · Nakasendō", N3: "甲州街道 · Kōshū Kaidō" }[level]}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Small wins, 4–6 kanji at a time. Clear a checkpoint or reach 55% mastery progress to open the next region.
        </p>
        <LevelSelector level={level} />
        <Link to="/run" search={{ mode: "runner" }} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-muted-foreground">Lantern Dash →</Link>

        <section className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-e1" aria-label="Checkpoint progress">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">One road. {chapters.length} seals.</span>
            <span className="text-xs font-bold text-primary tabular-nums">{seals} / {chapters.length} earned</span>
          </div>
          {/* Keep longer roads in balanced rows so every seal fits on narrow phones. */}
          <div className="mt-3 grid gap-1.5" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${chapters.length > 36 ? Math.ceil(chapters.length / 4) : chapters.length}, minmax(0, 1fr))` }}>
            {chapters.map((ch) => <span key={ch} className={`h-1.5 rounded-full ${isGateCleared(save, ch) ? "bg-primary" : "bg-secondary"}`} />)}
          </div>
          {!levelUnlocked && previous && <button type="button" onClick={() => selectLevel(previous)} className="mt-4 min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Continue the {previous} road</button>}
        </section>

        {allCleared && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border-2 border-gold bg-card p-5 shadow-e2">
            <div className="flex h-16 w-16 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-2xl font-bold text-primary">
              {level}
            </div>
            <div>
              <div className="font-serif text-lg font-bold">JLPT {level} kanji seal earned!</div>
              <p className="text-sm text-muted-foreground">{next ? `Every checkpoint cleared. Your ${next} road is now open.` : "All three roads explored. Keep revisiting your words to build lasting mastery."}</p>
              {next && <button type="button" onClick={() => selectLevel(next)} className="mt-2 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Start the {next} road →</button>}
            </div>
          </div>
        )}

        {/* The road itself: one continuous line behind every marker. Open regions get a
            full card; the locked run ahead collapses to one row each, and the reason they
            are locked is stated once at the head of that run rather than on all 18. */}
        <ol className="relative mt-6">
          <div aria-hidden="true" className="absolute bottom-8 left-[35px] top-8 w-0.5 rounded-full bg-[repeating-linear-gradient(to_bottom,var(--border)_0_10px,transparent_10px_18px)] sm:left-[43px]" />
          {chapters.map((ch, i) => {
            const unlocked = isChapterUnlocked(save, ch);
            const pct = chapterMasteryPct(save, ch);
            const cleared = isGateCleared(save, ch);
            const kanji = kanjiOfChapter(ch);
            const count = kanji.length;
            const mastered = kanji.filter((entry) => getCard(save, entry.c).mastery === 3).length;
            const sealIndex = cleared ? newSeals.indexOf(ch) : -1;
            const kanjiLabel = `Kanji in this region: ${kanji.map((k) => k.c).join("、")}`;
            const setRef = (el: HTMLLIElement | null) => { if (el) cardRefs.current.set(ch, el); else cardRefs.current.delete(ch); };

            if (!unlocked) {
              const firstLocked = i > 0 && isChapterUnlocked(save, chapters[i - 1]!);
              return (
                <li key={ch} ref={setRef} className="relative">
                  {firstLocked && (
                    <p className="mb-3 ml-[52px] text-xs leading-relaxed text-muted-foreground sm:ml-[68px]">
                      {levelUnlocked
                        ? "The road ahead opens one region at a time — clear a checkpoint, or reach 55% mastery progress."
                        : previous ? `The road ahead opens once you earn all ${LEVEL_CHAPTERS[previous].length} ${previous} checkpoint seals.` : ""}
                    </p>
                  )}
                  <div className="flex items-center gap-3 py-1.5 sm:gap-4">
                    <span aria-hidden="true" className="z-10 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-paper text-muted-foreground sm:h-[42px] sm:w-[42px]">
                      <AppIcon name="lock" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 border-b border-border/60 pb-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 className="truncate font-serif text-base font-bold text-muted-foreground">
                          <span className="tabular-nums">{i + 1}.</span> {CHAPTER_NAMES[ch]!.name}
                        </h2>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count} kanji</span>
                      </div>
                      <p className="mt-0.5 truncate font-serif text-sm tracking-[0.18em] text-muted-foreground/60" aria-label={kanjiLabel}>
                        {kanji.map((k) => k.c).join(" ")}
                      </p>
                    </div>
                  </div>
                </li>
              );
            }

            return (
              <li key={ch} ref={setRef} className="relative pb-4">
                <div className={`relative flex gap-3 rounded-2xl border bg-card p-4 sm:gap-4 ${ch === nextCheckpoint ? "glow-next border-primary/50 shadow-e2" : "border-border shadow-e1"}`}>
                  <div aria-hidden="true" className={`z-10 flex h-10 w-10 shrink-0 rotate-[-6deg] items-center justify-center rounded-full border-2 font-serif text-lg font-bold sm:h-14 sm:w-14 sm:border-4 sm:text-xl ${
                    stackOf(save).perfectGates.includes(ch) ? "border-gold bg-gold/10 text-primary" : cleared ? "border-primary bg-primary/10 text-primary" : "border-accent bg-card text-accent"
                  }${sealIndex >= 0 ? " relative seal-in" : ""}`} style={sealIndex >= 0 ? { animationDelay: `${200 + sealIndex * 80}ms` } : undefined}>
                    {cleared ? "印" : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`mb-1 text-[11px] font-bold uppercase tracking-widest ${ch === nextCheckpoint ? "text-primary" : "text-muted-foreground"}`}>
                      Region {i + 1}{ch === nextCheckpoint ? " · Next checkpoint" : cleared ? " · Cleared" : ""}
                    </p>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-serif text-lg font-bold">
                        {CHAPTER_NAMES[ch]!.name} <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{CHAPTER_NAMES[ch]!.jp}</span>
                      </h2>
                      <span className="text-xs font-bold text-muted-foreground">{count} kanji · {kanji.reduce((n, k) => n + k.vocab.length, 0)}-word checkpoint</span>
                    </div>
                    <p className="mt-2 font-serif text-lg tracking-[0.2em]" aria-label={kanjiLabel}>{kanji.map((k) => k.c).join(" ")}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`${CHAPTER_NAMES[ch]!.name} mastery`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="ring-fill h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-muted-foreground tabular-nums">{pct}% progress · {mastered}/{count} mastered</span>
                      {!cleared && (
                        <Link
                          to="/run"
                          search={{ gate: ch }}
                          data-sfx="tap"
                          className="pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-e1 transition-transform"
                        >
                          Prepare checkpoint
                          <AppIcon name="arrow" className="h-4 w-4" />
                        </Link>
                      )}
                      {cleared && (
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-primary">
                          <span className="inline-flex items-center gap-1.5"><AppIcon name="check" className="h-4 w-4" /> Seal stamped</span>
                          <Link to="/run" search={{ gate: ch }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-3">Repeat checkpoint</Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
