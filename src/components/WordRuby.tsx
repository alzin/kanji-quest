import type { Vocab } from "@/data/n5/types";
import { hasKanji } from "@/lib/kana";

type Props = {
  vocab: Vocab;
  /** The kanji being studied — shown in the accent colour, never glossed. */
  focus?: string;
  className?: string;
};

/** A word with per-kanji furigana, so a compound also teaches its parts. */
export function WordRuby({ vocab, focus, className }: Props) {
  return (
    <span className={`font-serif ${className ?? ""}`.trim()}>
      {vocab.f.map((span, i) => {
        const isFocus = focus !== undefined && span.t.includes(focus);
        const body = <span className={isFocus ? "text-primary" : undefined}>{span.t}</span>;
        if (!span.r || !hasKanji(span.t)) return <span key={i}>{body}</span>;
        return (
          <ruby key={i} className="[ruby-position:over]">
            {body}
            <rt className="text-[0.42em] font-bold leading-none text-muted-foreground">{span.r}</rt>
          </ruby>
        );
      })}
    </span>
  );
}
