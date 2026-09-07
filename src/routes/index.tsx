import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { InstallApp } from "@/components/InstallApp";
import { useSave, dueCount, getCard, isChapterUnlocked, n5MasteryPct, streakCount, NEW_PER_RUN } from "@/lib/srs";
import { allKanji } from "@/data/n5";
import { AppIcon } from "@/components/AppIcon";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kanji Dash — Master JLPT N5 Kanji by Running" },
      {
        name: "description",
        content:
          "A 2D runner game that teaches all JLPT N5 kanji with daily missions, spaced repetition, and stroke-order practice.",
      },
      { property: "og:title", content: "Kanji Dash — Master JLPT N5 Kanji by Running" },
      {
        property: "og:description",
        content: "Daily runs through the Japanese countryside. Every gate is a real word — read it to keep running.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const save = useSave();
  const due = dueCount(save);
  const pct = n5MasteryPct(save);
  const streak = streakCount(save);
  const fresh = Math.min(NEW_PER_RUN, allKanji.filter((k) => getCard(save, k.c).mastery === 0 && isChapterUnlocked(save, k.ch)).length);
  const mastered = allKanji.filter((k) => save.progress[k.c]?.mastery === 3).length;

  const R = 42;
  const circ = 2 * Math.PI * R;

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
              Run. Answer. <span className="text-primary">Remember.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              A little practice, every day. Run through Japan and turn {allKanji.length} N5 kanji into second nature.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:items-center sm:gap-3">
              <Link
                to="/run"
                search={{ gate: undefined }}
                className="pressable flex min-h-14 items-center justify-between gap-4 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-sm transition-transform sm:justify-center sm:px-6 sm:text-lg"
              >
                Start today's run
                <AppIcon name="arrow" className="h-5 w-5" />
              </Link>
              <Link
                to="/map"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary sm:border sm:border-border sm:bg-card sm:py-3"
              >
                <AppIcon name="map" className="h-4 w-4" /> World map
              </Link>
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
                  ? `Revisit familiar kanji, then meet up to ${fresh} new ${fresh === 1 ? "one" : "ones"}.`
                  : "Revisit familiar kanji that are ready for review."
                : fresh > 0
                  ? `You're up to date on reviews. Meet ${fresh} fresh kanji in your next run.`
                  : "No new kanji or reviews are ready right now. Visit the dojo for extra practice."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs sm:text-sm">
              <span className="flex items-center gap-1.5 font-bold">
                <AppIcon name="flame" className="h-4 w-4 text-primary" /> {streak} day streak
              </span>
              <span className="font-bold"><span className="text-gold">●</span> {save.coins} mon</span>
              <span className="text-muted-foreground">{save.runsCompleted} runs</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <svg className="h-20 w-20 shrink-0 lg:h-[104px] lg:w-[104px]" width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`N5 mastery progress ${pct}%`}>
              <circle cx="52" cy="52" r={R} fill="none" stroke="var(--color-border)" strokeWidth="9" />
              <circle
                cx="52" cy="52" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="9"
                strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
                transform="rotate(-90 52 52)"
              />
              <text x="52" y="49" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--color-foreground)" fontFamily="serif">{pct}%</text>
              <text x="52" y="66" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--color-muted-foreground)">N5</text>
            </svg>
            <div className="text-sm">
              <div className="text-xs font-bold text-muted-foreground">N5 mastery progress</div>
              <div className="font-serif text-2xl font-bold">{mastered}<span className="text-muted-foreground">/{allKanji.length}</span></div>
              <div className="text-muted-foreground">kanji mastered</div>
              <Link to="/collection" className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-xs font-bold text-primary">View collection <AppIcon name="arrow" className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-6" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-3 font-serif text-lg font-bold">Small steps. Lasting progress.</h2>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { jp: "走", t: "Run the gates", d: "Real words, not lone characters. Three lanes, three spellings — steer into the right one before the gate hits." },
              { jp: "記", t: "Spaced repetition", d: "Missed kanji return sooner; mastered ones space out to weeks. The queue is the game." },
              { jp: "印", t: "Checkpoint gates", d: "Clear a region's boss run to stamp your hanko seal and unlock the next stretch of road." },
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
