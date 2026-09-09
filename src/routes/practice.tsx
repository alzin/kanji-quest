import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { StrokePractice } from "@/components/StrokePractice";
import { KanjiDetail } from "@/components/KanjiDetail";
import { kanjiOfLevel } from "@/data";
import { LevelSelector } from "@/components/LevelSelector";
import { useSave, getCard, isChapterUnlocked, learningLevel } from "@/lib/srs";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Stroke Dojo — Kanji Dash" },
      { name: "description", content: "Trace kanji stroke by stroke over a guide glyph and get instant coverage feedback." },
      { property: "og:title", content: "Stroke Dojo — Kanji Dash" },
      { property: "og:description", content: "Trace kanji over the guide and stamp your practice." },
    ],
  }),
  component: PracticePage,
});

function PracticePage() {
  const save = useSave();
  const level = learningLevel(save);
  // Practice the current road's seen cards, then its earliest unlocked cards.
  const candidates = useMemo(() => {
    const allKanji = kanjiOfLevel(level);
    const seen = allKanji.filter((k) => {
      const p = save.progress[k.c];
      return p && p.mastery > 0 && p.mastery < 3;
    });
    if (seen.length) return seen;
    return allKanji.filter((k) => isChapterUnlocked(save, k.ch)).slice(0, 12);
  }, [save, level]);

  const [idx, setIdx] = useState(0);
  const currentIndex = Math.max(0, Math.min(idx, candidates.length - 1));
  const kanji = candidates[currentIndex];

  return (
    <div className="app-shell min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mt-4 font-serif text-2xl font-bold sm:mt-8 sm:text-3xl">Stroke Dojo</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Learn words before you run, or spend extra time practicing kanji shapes.
        </p>
        <LevelSelector level={level} onChange={() => setIdx(0)} />

        <section aria-label="Guided word learning" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-card p-4">
          <div>
            <h2 className="font-serif font-bold">Words → writing → recall → run</h2>
            <p className="mt-1 text-sm text-muted-foreground">Study the exact words in your next run, with writing practice along the way.</p>
          </div>
          <Link to="/run" search={{ gate: undefined }} className="min-h-11 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Learn today’s words</Link>
        </section>
        <h2 className="mt-6 font-serif text-lg font-bold">Free writing practice</h2>
        <p className="mt-1 text-sm text-muted-foreground">Trace the guide. Aim for 70% coverage.</p>

        <div className="mt-3 grid items-start gap-4 sm:mt-6 sm:gap-6 md:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-5">
            {kanji ? (
              <>
                <StrokePractice key={kanji.c} kanji={kanji} />
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 sm:mt-4 sm:pt-3">
                  <button
                    type="button"
                    aria-label="Previous kanji"
                    onClick={() => setIdx(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                    className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-bold transition-colors hover:bg-secondary active:bg-secondary disabled:opacity-40 sm:px-4"
                  >
                    ← Previous
                  </button>
                  <span aria-live="polite" aria-atomic="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">{currentIndex + 1} / {candidates.length}</span>
                  <button
                    type="button"
                    aria-label="Next kanji"
                    onClick={() => setIdx(Math.min(candidates.length - 1, currentIndex + 1))}
                    disabled={currentIndex >= candidates.length - 1}
                    className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-bold transition-colors hover:bg-secondary active:bg-secondary disabled:opacity-40 sm:px-4"
                  >
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No writing targets are available right now.</p>
            )}
          </div>
          {kanji && <KanjiDetail kanji={kanji} progress={getCard(save, kanji.c)} />}
        </div>
      </main>
    </div>
  );
}
