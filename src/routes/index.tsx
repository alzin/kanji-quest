import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { InstallApp } from "@/components/InstallApp";
import { SoundToggle } from "@/components/SoundToggle";
import { LevelSelector } from "@/components/LevelSelector";
import { useSave, dueCount, getSnapshot, learningLevel, levelMasteryPct, newKanji, selectLevel, streakCount, MAX_REVIEWS, isChapterUnlocked, isGateCleared } from "@/lib/srs";
import { diffFx, readFx, rememberFx } from "@/lib/celebrations";
import { isAudioRunning, play } from "@/lib/sfx";
import { CHAPTER_NAMES, LEVEL_CHAPTERS, kanjiOfLevel, kanjiOfChapter } from "@/data";
import { AppIcon } from "@/components/AppIcon";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kanji Dash — Learn JLPT N5 & N4 Kanji by Running" },
      {
        name: "description",
        content:
          "Learn JLPT N5 and N4 kanji with daily missions, spaced repetition, vocabulary, and writing practice.",
      },
      { property: "og:title", content: "Kanji Dash — Learn JLPT N5 & N4 Kanji by Running" },
      {
        property: "og:description",
        content: "Daily runs through the Japanese countryside. Every gate is a real word — read it to keep running.",
      },
    ],
  }),
  component: Home,
});

// YYYY-MM-DD from local date parts: the same day convention srs.ts keeps streak.last in.
function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Home() {
  const save = useSave();
  const level = learningLevel(save);
  const allKanji = kanjiOfLevel(level);
  const due = dueCount(save);
  const pct = levelMasteryPct(save, level);
  const streak = streakCount(save);
  const fresh = newKanji(save).length;
  const checkpoint = LEVEL_CHAPTERS[level].find((ch) => isChapterUnlocked(save, ch) && !isGateCleared(save, ch));
  const mastered = allKanji.filter((k) => save.progress[k.c]?.mastery === 3).length;

  const R = 42;
  const circ = 2 * Math.PI * R;

  // Coins and the streak pop only when they changed since the last visit (kanji-dash-fx-v1 record).
  const [pops, setPops] = useState({ coins: false, streak: false });

  // Post-hydration only. getSnapshot() is the loaded save: during hydration useSave() still
  // holds the server snapshot and the store's own re-render lands after this effect.
  useEffect(() => {
    const snapshot = getSnapshot();
    const today = localDay(new Date());
    const changed = diffFx(readFx(), snapshot, today);
    if (changed.coinsChanged || changed.streakDayChanged) setPops({ coins: changed.coinsChanged, streak: changed.streakDayChanged });
    if (changed.streakDayChanged && isAudioRunning()) play("streakBell"); // never creates a context on load
    rememberFx(snapshot, today);
  }, []);

  return (
    <div className="app-shell bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-8">
        {/* Hero */}
        <section className="relative mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:mt-8">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10" />
          <div aria-hidden="true" className="absolute -right-4 top-6 font-serif text-[140px] font-bold leading-none text-primary/10 select-none">
            漢字
          </div>
          <div className="relative p-5 sm:p-10">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary sm:text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Your daily kanji adventure
            </p>
            <h1 className="mt-3 max-w-lg font-serif text-[2.125rem] font-bold leading-tight sm:text-5xl">
              Learn. Recall. <span className="text-primary">Run.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Meet the words, practice their kanji, then run through Japan. Build lasting recall of {allKanji.length} {level} kanji, a little every day.
            </p>
            <LevelSelector level={level} />
            <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:items-center sm:gap-3">
              <Link
                to="/run"
                search={{ gate: undefined }}
                data-sfx="tap"
                className="pressable flex min-h-14 items-center justify-between gap-4 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-sm transition-transform sm:justify-center sm:px-6 sm:text-lg"
              >
                Learn today’s words
                <AppIcon name="arrow" className="h-5 w-5" />
              </Link>
              <Link
                to="/map"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary sm:border sm:border-border sm:bg-card sm:py-3"
              >
                <AppIcon name="map" className="h-4 w-4" /> World map
              </Link>
              <SoundToggle variant="inline" />
            </div>
          </div>
        </section>

        {/* Daily mission + stats */}
        <section className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] sm:gap-4" aria-label="Daily progress">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold">Today's mission</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{due > 0 ? `${due} to review` : fresh > 0 ? "Fresh start" : "Caught up"}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {due > 0
                ? fresh > 0
                  ? `A short set: ${Math.min(due, MAX_REVIEWS)} due reviews and ${fresh} new kanji from one region.`
                  : `Review ${Math.min(due, MAX_REVIEWS)} words in this short run. Any remaining reviews will wait for your next run.`
                : fresh > 0
                  ? `You're up to date on reviews. Learn words using ${fresh} fresh kanji before your next run.`
                  : "No new kanji or reviews are ready right now. Visit the dojo for extra practice."}
            </p>
            {checkpoint !== undefined && <Link to="/run" search={{ gate: checkpoint }} className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-primary">Earn your next seal: {CHAPTER_NAMES[checkpoint]!.name} · {kanjiOfChapter(checkpoint).length} words →</Link>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs sm:text-sm">
              <span className="flex items-center gap-1.5 font-bold">
                <AppIcon name="flame" className={`h-4 w-4 text-primary${streak >= 1 ? " flicker" : ""}${pops.streak ? " ignite" : ""}`} />
                <span className={pops.streak ? "hud-pop-left" : undefined}>{streak} day streak</span>
              </span>
              <span className={pops.coins ? "font-bold hud-pop-left" : "font-bold"}><span className="text-gold">●</span> {save.coins} mon</span>
              <span className="text-muted-foreground">{save.runsCompleted} runs</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <svg className="h-20 w-20 shrink-0 lg:h-[104px] lg:w-[104px]" width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`${level} mastery progress ${pct}%`}>
              <circle cx="52" cy="52" r={R} fill="none" stroke="var(--color-border)" strokeWidth="9" />
              <circle
                className="ring-fill"
                cx="52" cy="52" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="9"
                strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
                transform="rotate(-90 52 52)"
              />
              <text x="52" y="49" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--color-foreground)" fontFamily="serif">{pct}%</text>
              <text x="52" y="66" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--color-muted-foreground)">{level}</text>
            </svg>
            <div className="text-sm">
              <div className="text-xs font-bold text-muted-foreground">{level} mastery progress</div>
              <div className="font-serif text-2xl font-bold">{mastered}<span className="text-muted-foreground">/{allKanji.length}</span></div>
              <div className="text-muted-foreground">kanji mastered</div>
              <Link to="/collection" onClick={() => selectLevel(level)} className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-xs font-bold text-primary">View collection <AppIcon name="arrow" className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-6" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-3 font-serif text-lg font-bold">Small steps. Lasting progress.</h2>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { jp: "学", t: "1. Learn & write", d: "Study every word in your upcoming run with its reading and meaning. Trace its kanji in the dojo to practice the shape." },
              { jp: "記", t: "2. Recall calmly", d: "Hide the readings and check what you remember. Practice both reading and meaning, with no timer or lost hearts." },
              { jp: "走", t: "3. Run & revisit", d: "Play with the words you just studied. Run answers schedule spaced reviews, so missed kanji return sooner." },
            ].map((f) => (
              <div key={f.t} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 sm:block sm:p-5">
                <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 font-serif text-xl font-bold text-accent">
                  {f.jp}
                </div>
                <div>
                  <h3 className="font-serif font-bold sm:mt-3">{f.t}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <InstallApp />
      </main>
    </div>
  );
}
