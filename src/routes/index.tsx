import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { useSave, dueCount, n5MasteryPct, streakCount } from "@/lib/srs";
import { allKanji } from "@/data/n5";

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
        content: "Daily runs through the Japanese countryside. Every gate is a kanji — answer to keep running.",
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
  const mastered = allKanji.filter((k) => save.progress[k.c]?.mastery === 3).length;

  const R = 42;
  const circ = 2 * Math.PI * R;

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        {/* Hero */}
        <section className="relative mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/10" />
          <div className="absolute -right-4 top-6 font-serif text-[140px] font-bold leading-none text-primary/10 select-none">
            漢字
          </div>
          <div className="relative p-6 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">JLPT N5 · 96 kanji · daily runs</p>
            <h1 className="mt-3 font-serif text-4xl font-bold leading-tight sm:text-5xl">
              Run. Answer. <span className="text-primary">Remember.</span>
            </h1>
            <p className="mt-3 max-w-md text-muted-foreground">
              Sprint through the countryside — every gate is a kanji. Pick the right lane to smash through,
              and spaced repetition makes sure it sticks.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/run"
                search={{}}
                className="rounded-lg bg-primary px-6 py-3 font-serif text-lg font-bold text-primary-foreground shadow transition-transform hover:scale-[1.03]"
              >
                Start today's run
              </Link>
              <Link
                to="/map"
                className="rounded-lg border border-border bg-card px-5 py-3 font-bold transition-colors hover:bg-secondary"
              >
                World map
              </Link>
            </div>
          </div>
        </section>

        {/* Daily mission + stats */}
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border-2 border-primary/60 bg-card p-5 shadow-sm sm:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold">Today's mission</h2>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Daily</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {due > 0
                ? `${due} kanji are due for review. One run clears the queue — plus up to 5 new kanji.`
                : "No reviews due — your run will introduce up to 5 fresh kanji."}
            </p>
            <div className="mt-4 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 font-bold">
                <span className="text-primary">🔥</span> {streak} day streak
              </span>
              <span className="font-bold"><span className="text-gold">●</span> {save.coins} mon</span>
              <span className="text-muted-foreground">{save.runsCompleted} runs</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`N5 mastery ${pct}%`}>
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
              <div className="font-serif text-2xl font-bold">{mastered}<span className="text-muted-foreground">/{allKanji.length}</span></div>
              <div className="text-muted-foreground">kanji mastered</div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { jp: "走", t: "Run the gates", d: "Three lanes, three answers. Steer into the correct reading, meaning, or word before the gate hits." },
            { jp: "記", t: "Spaced repetition", d: "Missed kanji return sooner; mastered ones space out to weeks. The queue is the game." },
            { jp: "印", t: "Checkpoint gates", d: "Clear a region's boss run to stamp your hanko seal and unlock the next stretch of road." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 font-serif text-xl font-bold text-accent">
                {f.jp}
              </div>
              <h3 className="mt-3 font-serif font-bold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
