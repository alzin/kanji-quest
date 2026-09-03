import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Nav } from "@/components/Nav";
import { KanjiDetail } from "@/components/KanjiDetail";
import { allKanji } from "@/data/n5";
import type { Kanji } from "@/data/n5/types";
import { useSave, getCard } from "@/lib/srs";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "Kanji Collection — Kanji Dash" },
      { name: "description", content: "All 96 JLPT N5 kanji with readings, radicals, mnemonics, vocabulary, and your mastery state." },
      { property: "og:title", content: "Kanji Collection — Kanji Dash" },
      { property: "og:description", content: "Browse every N5 kanji and track your mastery." },
    ],
  }),
  component: CollectionPage,
});

const TILE_CLASS = [
  "border-border bg-card text-muted-foreground/40", // unseen
  "border-gold/60 bg-gold/10 text-foreground", // learning
  "border-accent/50 bg-accent/10 text-foreground", // reviewing
  "border-primary/60 bg-primary/10 text-foreground", // mastered
];

function CollectionPage() {
  const save = useSave();
  const [selected, setSelected] = useState<Kanji | null>(null);
  const [filter, setFilter] = useState<number | null>(null);

  const shown = filter ? allKanji.filter((k) => k.ch === filter) : allKanji;

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mt-8 font-serif text-3xl font-bold">Kanji Collection</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-border bg-card" /> Unseen</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-gold/60 bg-gold/20" /> Learning</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-accent/50 bg-accent/15" /> Reviewing</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-primary/60 bg-primary/15" /> Mastered</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${filter === null ? "bg-ink text-paper" : "border border-border"}`}
          >
            All
          </button>
          {[1, 2, 3, 4, 5, 6].map((ch) => (
            <button
              key={ch}
              onClick={() => setFilter(ch)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${filter === ch ? "bg-ink text-paper" : "border border-border"}`}
            >
              Region {ch}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {shown.map((k) => {
            const p = getCard(save, k.c);
            return (
              <button
                key={k.c}
                onClick={() => setSelected(k)}
                className={`flex aspect-square items-center justify-center rounded-lg border-2 font-serif text-2xl font-bold transition-transform hover:scale-110 hover:shadow ${TILE_CLASS[p.mastery]}`}
                aria-label={`${k.c} — ${k.m}`}
              >
                {k.c}
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <KanjiDetail kanji={selected} progress={getCard(save, selected.c)} />
              <button
                onClick={() => setSelected(null)}
                className="mt-3 w-full rounded-lg border border-border bg-card py-2.5 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
