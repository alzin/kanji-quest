import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "./Nav";
import { AppIcon } from "./AppIcon";
import { WordRuby } from "./WordRuby";
import { StrokePractice } from "./StrokePractice";
import { WordAudio } from "./WordAudio";
import { SoundToggle } from "./SoundToggle";
import { buildQuestion, vocabKana, type Question } from "@/lib/srs";

const primary = "min-h-12 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none";
/** Recall answers are the whole interaction on that stage, so they get body size and a full tap row. */
const choice = "min-h-14 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base font-bold shadow-e1 transition-colors hover:border-primary hover:bg-secondary disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-surface";
const STEPS = ["Learn & write", "Recall", "Run"] as const;

/** Preparation and the runner share one frozen queue, including the exact vocabulary. */
export function RunPreparation({ questions, title, onStart }: {
  questions: Question[];
  title: string;
  onStart: () => void;
}) {
  const [stage, setStage] = useState<"learn" | "recall">("learn");
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const [recallIndex, setRecallIndex] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [stage]);
  const checks = useMemo(() => (["reading", "meaning"] as const).flatMap((type) =>
    questions.map((q) => buildQuestion(q.kanji, type, q.vocab)),
  ), [questions]);
  useEffect(() => {
    if (stage !== "recall" || feedback !== "correct") return;
    const timeout = window.setTimeout(() => {
      setFeedback(null);
      if (recallIndex + 1 === checks.length) onStart();
      else setRecallIndex(recallIndex + 1);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [stage, feedback, recallIndex, checks.length, onStart]);
  const word = questions[index]!;
  const check = checks[recallIndex]!;
  const allSeen = seen.size === questions.length;
  const step = stage === "learn" ? 0 : 1;
  const selectWord = (next: number) => {
    setIndex(next);
    setSeen((current) => current.has(next) ? current : new Set(current).add(next));
  };

  return (
    <div className="app-shell min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-12">
        {/* Page-level control sits in the page header; the per-word voice controls live
            beside the word itself, further down. */}
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{title} · Dojo preparation</p>
          <h1 ref={heading} tabIndex={-1} className="mt-1.5 font-serif text-[1.875rem] font-bold leading-tight outline-none sm:text-4xl">
            {stage === "learn" ? "Learn before you run" : "Recall without the rush"}
          </h1>
        </div>

        {/* Three segments rather than three boxes: the rail never wraps on a phone. */}
        <ol aria-label="Learning steps" className="mt-5 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className="min-w-0 flex-1">
              <span aria-hidden="true" className={`block h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
              <span className={`mt-1.5 block truncate text-[11px] font-bold uppercase tracking-wider ${i === step ? "text-primary" : "text-muted-foreground"}`}>
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>

        {stage === "learn" && <>
          <div className="mt-6 grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-label="Words in this run" className="rounded-2xl border border-border bg-card p-4 shadow-e1">
              <h2 className="font-serif text-lg font-bold">Your word list</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Open all {questions.length}. Read each one aloud, connect it to its meaning, and trace its highlighted kanji.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className="ring-fill block h-full rounded-full bg-primary" style={{ width: `${(seen.size / questions.length) * 100}%` }} />
                </span>
                <span role="status" className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-muted-foreground">{seen.size} / {questions.length} words viewed</span>
              </div>
              <ol className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
                {questions.map((q, i) => <li key={i}>
                  <button type="button" onClick={() => selectWord(i)} aria-current={i === index ? "true" : undefined}
                    aria-label={`View word ${i + 1}: ${q.vocab.w}${seen.has(i) ? ", viewed" : ""}`}
                    className="flex h-full min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-primary aria-[current=true]:border-primary aria-[current=true]:bg-primary/8">
                    <span className="truncate font-serif text-lg font-bold">{q.vocab.w}</span>
                    {seen.has(i)
                      ? <AppIcon name="check" className="h-4 w-4 shrink-0 text-success" />
                      : <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>}
                  </button>
                </li>)}
              </ol>
            </section>

            <section aria-label="Study this word" className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-e2 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Word {index + 1} of {questions.length}</p>
              <div className="mt-6 text-center">
                <WordRuby vocab={word.vocab} focus={word.kanji.c} className="text-4xl font-bold sm:text-5xl" />
                <p data-testid="study-reading" className="mt-4 font-serif text-xl text-muted-foreground">{vocabKana(word.vocab)}</p>
                <p data-testid="study-meaning" className="mt-1 text-lg font-bold">{word.vocab.m}</p>
                {/* The controls that speak this word sit under this word. */}
                <WordAudio reading={vocabKana(word.vocab)} wordKey={`learn-${index}`} className="mt-4 justify-center" />
              </div>
              <div className="mt-6 rounded-xl bg-surface-sunken p-4 text-sm leading-relaxed">
                <p><b className="font-serif text-xl text-primary">{word.kanji.c}</b> · {word.kanji.m}</p>
                <p className="mt-2">{word.kanji.mn}</p>
              </div>
              <div className="mt-6">
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Trace {word.kanji.c}, then say the whole word: {vocabKana(word.vocab)}. This checks guide coverage, not stroke order. Writing is optional; you can also use paper.</p>
                <StrokePractice key={word.kanji.c} kanji={word.kanji} />
              </div>
            </section>
          </div>
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-e1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{allSeen ? "Every word covered. Try recalling them with the readings hidden." : `Open ${questions.length - seen.size} more to unlock the recall check.`}</p>
            <button type="button" className={`${primary} shrink-0`} disabled={!allSeen} onClick={() => { setRecallIndex(0); setFeedback(null); setStage("recall"); }}>Check my recall</button>
          </div>
        </>}

        {stage === "recall" && <section aria-label="Recall check" className="mx-auto mt-6 max-w-lg rounded-2xl border border-border bg-card p-5 shadow-e2 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Check {recallIndex + 1} of {checks.length}</p>
            <p className="text-xs text-muted-foreground">No timer, hearts or score</p>
          </div>
          <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-secondary">
            <span className="ring-fill block h-full rounded-full bg-primary" style={{ width: `${(recallIndex / checks.length) * 100}%` }} />
          </span>
          <h2 className="mt-7 text-center font-serif text-5xl font-bold">{check.vocab.w}</h2>
          <WordAudio reading={vocabKana(check.vocab)} wordKey={`recall-${recallIndex}`} className="mt-4 w-full justify-center" />
          <p className="mt-6 text-center text-base font-bold">{check.sub}</p>
          <div role="group" aria-label="Answer choices" className="mt-4 grid gap-2.5">
            {check.choices.map((c) => <button key={c} type="button" disabled={feedback === "correct"} className={choice}
              onClick={() => setFeedback(c === check.answer ? "correct" : "wrong")}>{c}</button>)}
          </div>
          {/* Icon plus wording, never colour alone. */}
          {feedback && <div role="status" className={`mt-4 flex items-start gap-2.5 rounded-xl p-3.5 text-sm leading-relaxed ${feedback === "correct" ? "bg-success/10 text-success" : "bg-primary/8 text-foreground"}`}>
            <AppIcon name={feedback === "correct" ? "check" : "alert"} className={`mt-0.5 h-4 w-4 shrink-0 ${feedback === "correct" ? "text-success" : "text-primary"}`} />
            <span>
              <b className="font-bold">{feedback === "correct" ? "Correct." : "Let’s learn that once more."}</b>{" "}
              <span className={feedback === "correct" ? "text-foreground" : undefined}>
                <b className="font-serif">{check.vocab.w}</b> — {vocabKana(check.vocab)} — {check.vocab.m}
              </span>
            </span>
          </div>}
          <div className="mt-6 border-t border-border pt-3">
            <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              onClick={() => { setStage("learn"); selectWord(0); }}>
              <span aria-hidden="true">←</span>
              Back to word list
            </button>
          </div>
        </section>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground">
            <span aria-hidden="true">←</span> Leave preparation
          </Link>
          <SoundToggle variant="inline" />
        </div>
      </main>
    </div>
  );
}
