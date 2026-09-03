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
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mt-8 font-serif text-3xl font-bold">Stroke Dojo</h1>
        <p className="mt-1 text-muted-foreground">
          Trace the guide with your finger or mouse. Cover at least 70% of the ink to stamp it.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            {kanji ? (
              <>
                <StrokePractice key={kanji.c} kanji={kanji} />
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    disabled={idx === 0}
                    className="rounded-md border border-border px-4 py-2 font-bold disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-muted-foreground">{Math.min(idx, candidates.length - 1) + 1} / {candidates.length}</span>
                  <button
                    onClick={() => setIdx((i) => Math.min(candidates.length - 1, i + 1))}
                    disabled={idx >= candidates.length - 1}
                    className="rounded-md border border-border px-4 py-2 font-bold disabled:opacity-40"
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
