import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { KanjiDetail } from "@/components/KanjiDetail";
import { LevelSelector } from "@/components/LevelSelector";
import { allKanji, kanjiOfLevel, CHAPTER_NAMES, LEVEL_CHAPTERS } from "@/data";
import type { Kanji } from "@/data/n5/types";
import { useSave, getCard, type CardProgress } from "@/lib/srs";
import { vocabKana } from "@/lib/words";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "Kanji Collection — Kanji Dash" },
      { name: "description", content: `${allKanji.length} kanji across the N5 and N4 study roads, with readings, mnemonics, vocabulary, and mastery progress.` },
      { property: "og:title", content: "Kanji Collection — Kanji Dash" },
      { property: "og:description", content: "Explore N5 and N4 kanji and track your mastery." },
    ],
  }),
  component: CollectionPage,
});

const TILE_CLASS = [
  "border-border bg-card text-muted-foreground", // unseen
  "border-gold/60 bg-gold/10 text-foreground", // learning
  "border-accent/50 bg-accent/10 text-foreground", // reviewing
  "border-primary/60 bg-primary/10 text-foreground", // mastered
];

const MASTERY_LABEL = ["Unseen", "Learning", "Reviewing", "Mastered"];
const DIALOG_HEIGHT = "max-h-[calc(100dvh_-_max(1rem,env(safe-area-inset-top,0px)))] sm:max-h-[min(85dvh,calc(100dvh_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px)))]";

// Treat hiragana and katakana as equivalent so either keyboard can find readings.
function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\u30a1-\u30f6]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function KanjiDialog({ kanji, progress, returnFocusTo, onDismiss }: { kanji: Kanji; progress: CardProgress; returnFocusTo: HTMLButtonElement | null; onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };

    // Fixed positioning also prevents the page moving behind the sheet on iOS.
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });

    return () => {
      dialog.close();
      Object.assign(document.body.style, previousBodyStyles);
      window.scrollTo({ top: scrollY, behavior: "instant" });
      previousFocus?.focus({ preventScroll: true });
    };
  }, [returnFocusTo]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="kanji-dialog-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          onDismiss();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className={`sheet-up fixed bottom-0 left-[env(safe-area-inset-left,0px)] right-[env(safe-area-inset-right,0px)] top-auto m-0 w-auto max-w-none overflow-hidden rounded-t-3xl border border-border bg-paper p-0 text-foreground shadow-2xl backdrop:bg-ink/60 backdrop:backdrop-blur-sm sm:bottom-[env(safe-area-inset-bottom,0px)] sm:top-[env(safe-area-inset-top,0px)] sm:m-auto sm:max-w-lg sm:rounded-2xl ${DIALOG_HEIGHT}`}
    >
      <div className={`flex flex-col ${DIALOG_HEIGHT}`}>
        <div aria-hidden="true" className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2 sm:py-3">
          <h2 id="kanji-dialog-title" className="font-serif text-lg font-bold">{kanji.c} · {kanji.m}</h2>
          <button ref={closeRef} type="button" onClick={onDismiss} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close kanji details">
            <span>Close</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div tabIndex={0} role="region" aria-label="Readings, mnemonic, and vocabulary" className="min-h-0 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:p-4">
          <KanjiDetail kanji={kanji} progress={progress} />
        </div>
      </div>
    </dialog>
  );
}

function CollectionPage() {
  const save = useSave();
  const level = save.selectedLevel;
  const [selected, setSelected] = useState<Kanji | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dismissDetail = useCallback(() => setSelected(null), []);

  useEffect(() => { setIsHydrated(true); }, []);

  const searchTerms = normalizeSearch(query.trim()).split(/\s+/).filter(Boolean);
  // A level change in another tab must not leave an incompatible region filter.
  const activeFilter = filter !== null && LEVEL_CHAPTERS[level].includes(filter) ? filter : null;
  const shown = kanjiOfLevel(level).filter((kanji) => {
    if (activeFilter !== null && kanji.ch !== activeFilter) return false;
    const searchable = normalizeSearch([kanji.c, kanji.m, kanji.on, kanji.kun, ...kanji.vocab.flatMap((word) => [word.w, word.r, vocabKana(word), word.m])].join(" "));
    return searchTerms.every((term) => searchable.includes(term));
  });

  return (
    <div className="app-shell min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-16">
        <h1 className="mt-6 font-serif text-3xl font-bold sm:mt-8">Kanji Collection</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your growing library. Tap a kanji to explore it.</p>
        <LevelSelector level={level} preview onChange={() => { setFilter(null); setQuery(""); setSelected(null); }} />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold">
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-border bg-card" /> Unseen</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-gold/60 bg-gold/20" /> Learning</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-accent/50 bg-accent/15" /> Reviewing</span>
          <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-primary/60 bg-primary/15" /> Mastered</span>
        </div>

        <div className="relative mt-5">
          <label htmlFor="kanji-search" className="sr-only">Search kanji, meanings, or readings</label>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input
            ref={searchRef}
            id="kanji-search"
            type="search"
            disabled={!isHydrated}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search kanji, meaning, or reading"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }}
            className="min-h-12 w-full rounded-2xl border border-border bg-card py-3 pl-12 pr-12 text-base shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          )}
        </div>

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by region">
          <button
            type="button"
            onClick={() => setFilter(null)}
            aria-pressed={activeFilter === null}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors ${activeFilter === null ? "border-ink bg-ink text-paper" : "border-border bg-card hover:bg-secondary"}`}
          >
            All
          </button>
          {LEVEL_CHAPTERS[level].map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setFilter(ch)}
              aria-pressed={activeFilter === ch}
              title={CHAPTER_NAMES[ch]?.name}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors ${activeFilter === ch ? "border-ink bg-ink text-paper" : "border-border bg-card hover:bg-secondary"}`}
            >
              Region {ch}
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-bold text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
          {shown.length} {shown.length === 1 ? "kanji found" : "kanji"}{activeFilter !== null ? ` · ${CHAPTER_NAMES[activeFilter]?.name ?? `Region ${activeFilter}`}` : " · All regions"}
        </p>

        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {shown.map((k) => {
            const p = getCard(save, k.c);
            return (
              <button
                key={k.c}
                type="button"
                onClick={(event) => {
                  openerRef.current = event.currentTarget;
                  event.currentTarget.focus({ preventScroll: true });
                  setSelected(k);
                }}
                data-sfx="sheet"
                className={`flex aspect-square min-h-11 items-center justify-center rounded-xl border-2 font-serif text-2xl font-bold transition-transform hover:-translate-y-0.5 hover:shadow active:scale-95 ${TILE_CLASS[p.mastery]}${p.mastery === 3 ? " relative tile-mastered" : ""}`}
                aria-label={`${k.c} — ${k.m} · ${MASTERY_LABEL[p.mastery]}`}
                aria-haspopup="dialog"
              >
                {k.c}
              </button>
            );
          })}
        </div>

        {shown.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <div aria-hidden="true" className="font-serif text-4xl text-primary/60">字</div>
            <h2 className="mt-3 font-serif text-xl font-bold">No kanji found</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">Try a different meaning or reading, or explore all regions.</p>
            <button type="button" onClick={() => { setQuery(""); setFilter(null); }} className="mt-5 min-h-11 rounded-full bg-ink px-5 text-sm font-bold text-paper">Show all kanji</button>
          </div>
        )}

        {selected && (
          <KanjiDialog kanji={selected} progress={getCard(save, selected.c)} returnFocusTo={openerRef.current} onDismiss={dismissDetail} />
        )}
      </main>
    </div>
  );
}
