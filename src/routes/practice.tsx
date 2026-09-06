import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { StrokePractice } from "@/components/StrokePractice";
import { KanjiDetail } from "@/components/KanjiDetail";
import { allKanji } from "@/data/n5";
import { useSave, getCard, isChapterUnlocked } from "@/lib/srs";

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
  // Practice with kanji you've seen but not mastered; fall back to chapter 1
  const candidates = useMemo(() => {
    const seen = allKanji.filter((k) => {
      const p = save.progress[k.c];
      return p && p.mastery > 0 && p.mastery < 3;
    });
    if (seen.length) return seen;
    return allKanji.filter((k) => isChapterUnlocked(save, k.ch)).slice(0, 12);
  }, [save]);

  const [idx, setIdx] = useState(0);
  const kanji = candidates[Math.min(idx, candidates.length - 1)];

  return (
    <div className="app-shell min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mt-4 font-serif text-2xl font-bold sm:mt-8 sm:text-3xl">Stroke Dojo</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Trace the guide. Aim for 70% coverage.
        </p>

        <div className="mt-3 grid items-start gap-4 sm:mt-6 sm:gap-6 md:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-5">
            {kanji ? (
              <>
                <StrokePractice key={kanji.c} kanji={kanji} />
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 sm:mt-4 sm:pt-3">
                  <button
                    type="button"
                    aria-label="Previous kanji"
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    disabled={idx === 0}
                    className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-bold transition-colors hover:bg-secondary active:bg-secondary disabled:opacity-40 sm:px-4"
                  >
                    ← Previous
                  </button>
                  <span aria-live="polite" aria-atomic="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.min(idx, candidates.length - 1) + 1} / {candidates.length}</span>
                  <button
                    type="button"
                    aria-label="Next kanji"
                    onClick={() => setIdx((i) => Math.min(candidates.length - 1, i + 1))}
                    disabled={idx >= candidates.length - 1}
                    className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-bold transition-colors hover:bg-secondary active:bg-secondary disabled:opacity-40 sm:px-4"
                  >
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Run a session first to unlock practice targets.</p>
            )}
          </div>
          {kanji && <KanjiDetail kanji={kanji} progress={getCard(save, kanji.c)} />}
        </div>
      </main>
    </div>
  );
}
