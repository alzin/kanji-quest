import type { Kanji } from "@/data/n5/types";
import type { CardProgress } from "@/lib/srs";

const MASTERY_LABEL = ["Unseen", "Learning", "Reviewing", "Mastered"];
const MASTERY_CLASS = [
  "bg-muted text-muted-foreground",
  "bg-gold/25 text-foreground",
  "bg-accent/15 text-accent",
  "bg-primary/15 text-primary",
];

export function KanjiDetail({ kanji, progress }: { kanji: Kanji; progress?: CardProgress }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-5">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border-2 border-primary/70 bg-paper font-serif text-6xl font-bold shadow-inner">
          {kanji.c}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-xl font-bold">{kanji.m}</h3>
            {progress && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MASTERY_CLASS[progress.mastery]}`}>
                {MASTERY_LABEL[progress.mastery]}
              </span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline font-bold text-muted-foreground">On'yomi: </dt><dd className="inline font-serif">{kanji.on}</dd></div>
            <div><dt className="inline font-bold text-muted-foreground">Kun'yomi: </dt><dd className="inline font-serif">{kanji.kun}</dd></div>
            <div><dt className="inline font-bold text-muted-foreground">Radical: </dt><dd className="inline">{kanji.rad}</dd></div>
            <div><dt className="inline font-bold text-muted-foreground">Strokes: </dt><dd className="inline">{kanji.strokes}</dd></div>
          </dl>
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-secondary p-3 text-sm">
        <span className="font-bold text-primary">Mnemonic — </span>
        {kanji.mn}
      </div>
      <div className="mt-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Vocabulary</div>
        <ul className="mt-1 divide-y divide-border">
          {kanji.vocab.map((v) => (
            <li key={v.w} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="font-serif text-lg font-bold">{v.w}</span>
              <span className="font-serif text-muted-foreground">{v.r}</span>
              <span className="text-right">{v.m}</span>
            </li>
          ))}
        </ul>
      </div>
      {progress && (progress.correct + progress.wrong > 0) && (
        <div className="mt-3 text-xs text-muted-foreground">
          Seen {progress.correct + progress.wrong}× · {progress.correct} correct · {progress.wrong} missed
        </div>
      )}
    </div>
  );
}
