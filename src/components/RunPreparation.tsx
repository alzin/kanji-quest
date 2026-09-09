import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "./Nav";
import { WordRuby } from "./WordRuby";
import { StrokePractice } from "./StrokePractice";
import { WordAudio } from "./WordAudio";
import { SoundToggle } from "./SoundToggle";
import { buildQuestion, vocabKana, type Question } from "@/lib/srs";

const primary = "min-h-12 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-40";
const secondary = "min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-secondary";

/** Preparation and the runner share one frozen queue, including the exact vocabulary. */
export function RunPreparation({ questions, title, onStart }: {
  questions: Question[];
  title: string;
  onStart: () => void;
}) {
  const [stage, setStage] = useState<"learn" | "recall" | "ready">("learn");
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [writing, setWriting] = useState(false);
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
      if (recallIndex + 1 === checks.length) setStage("ready");
      else setRecallIndex(recallIndex + 1);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [stage, feedback, recallIndex, checks.length]);
  const word = questions[index]!;
  const check = checks[recallIndex]!;
  const allSeen = seen.size === questions.length;
  const selectWord = (next: number) => { setIndex(next); setWriting(false); };

  return (
    <div className="app-shell min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-12">
        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-primary">{title} · Dojo preparation</p>
        <h1 ref={heading} tabIndex={-1} className="mt-2 font-serif text-3xl font-bold outline-none">{stage === "learn" ? "Learn before you run" : stage === "recall" ? "Recall without the rush" : "Ready for your run"}</h1>
        <ol aria-label="Learning steps" className="my-5 grid grid-cols-3 gap-2 text-sm">
          {["Learn & write", "Recall", "Run"].map((label, i) => (
            <li key={label} aria-current={i === (stage === "learn" ? 0 : stage === "recall" ? 1 : 2) ? "step" : undefined}
              className="rounded-lg border border-border px-2 py-3 text-center font-bold aria-[current=step]:border-primary aria-[current=step]:bg-primary/10 aria-[current=step]:text-primary">
              {i + 1}. {label}
            </li>
          ))}
        </ol>
        {stage !== "ready" && <div className="mb-4 flex flex-wrap items-center gap-2">
          <WordAudio reading={vocabKana((stage === "learn" ? word : check).vocab)} wordKey={`${stage}-${stage === "learn" ? index : recallIndex}`} />
          <SoundToggle variant="inline" />
          <span className="text-xs text-muted-foreground">Japanese readings play automatically when voice is on. Game sound is separate.</span>
        </div>}

        {stage === "learn" && <>
          <p className="text-sm leading-relaxed text-muted-foreground">Meet all {questions.length} words in this run. Read each word aloud, connect it to its meaning, and try writing its highlighted kanji. Then check what you remember.</p>
          <div className="mt-5 grid items-start gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-label="Words in this run" className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-serif text-lg font-bold">Your word list</h2>
              <p role="status" className="mt-1 text-xs text-muted-foreground">{seen.size} / {questions.length} words studied</p>
              <ol className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-1">
                {questions.map((q, i) => <li key={i}>
                  <button type="button" onClick={() => selectWord(i)} aria-current={i === index ? "true" : undefined}
                    aria-label={`Study word ${i + 1}: ${q.vocab.w}${seen.has(i) ? ", studied" : ""}`}
                    className="h-full min-h-12 w-full rounded-lg border border-border px-3 py-2 text-left aria-[current=true]:border-primary aria-[current=true]:bg-primary/5">
                    <span className="font-serif text-lg font-bold">{q.vocab.w}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{seen.has(i) ? "✓" : i + 1}</span>
                  </button>
                </li>)}
              </ol>
            </section>
            <section aria-label="Study this word" className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6">
              <p className="text-xs font-bold text-muted-foreground">Word {index + 1} of {questions.length}</p>
              <div className="mt-5 text-center">
                <WordRuby vocab={word.vocab} focus={word.kanji.c} className="text-4xl font-bold" />
                <p data-testid="study-reading" className="mt-3 font-serif text-xl">{vocabKana(word.vocab)}</p>
                <p data-testid="study-meaning" className="mt-2 text-lg font-bold">{word.vocab.m}</p>
              </div>
              <div className="mt-5 rounded-lg bg-secondary p-3 text-sm leading-relaxed">
                <p><b className="font-serif text-xl text-primary">{word.kanji.c}</b> · {word.kanji.m}</p>
                <p className="mt-2">{word.kanji.mn}</p>
              </div>
              <button type="button" aria-expanded={writing} onClick={() => setWriting(!writing)} className={`${secondary} mt-4 w-full`}>
                {writing ? "Close writing practice" : "Practice writing this kanji"}
              </button>
              {writing && <div className="mt-4">
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Trace {word.kanji.c}, then say the whole word: {vocabKana(word.vocab)}. This checks guide coverage, not stroke order. Writing is optional; you can also use paper.</p>
                <StrokePractice key={word.kanji.c} kanji={word.kanji} />
              </div>}
              <button type="button" className={`${primary} mt-5 w-full`} onClick={() => {
                const nextSeen = new Set(seen).add(index);
                setSeen(nextSeen);
                const next = questions.findIndex((_, i) => !nextSeen.has(i));
                if (next >= 0) selectWord(next);
              }}>{seen.has(index) ? "Word studied ✓" : "I’ve studied this word"}</button>
            </section>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{allSeen ? "Every word covered. Try recalling them with the readings hidden." : "Study each word to unlock the recall check."}</p>
            <button type="button" className={primary} disabled={!allSeen} onClick={() => { setRecallIndex(0); setFeedback(null); setStage("recall"); }}>Check my recall</button>
          </div>
        </>}

        {stage === "recall" && <section aria-label="Recall check" className="mx-auto max-w-lg rounded-xl border border-border bg-card p-5 sm:p-8">
          <p className="text-sm text-muted-foreground">No timer, hearts, or score. Check each word’s reading, then its meaning.</p>
          <p className="mt-4 text-xs font-bold text-muted-foreground">Check {recallIndex + 1} of {checks.length}</p>
          <h2 className="mt-5 text-center font-serif text-4xl font-bold">{check.vocab.w}</h2>
          <p className="mt-4 text-center font-bold">{check.sub}</p>
          <div className="mt-5 grid gap-2">
            {check.choices.map((choice) => <button key={choice} type="button" disabled={feedback !== null} className={secondary}
              onClick={() => setFeedback(choice === check.answer ? "correct" : "wrong")}>{choice}</button>)}
          </div>
          {feedback && <div role="status" className="mt-4 rounded-lg bg-secondary p-3 text-sm leading-relaxed">
            {feedback === "correct" ? "Correct." : "Let’s learn that once more."} <b>{check.vocab.w}</b> — {vocabKana(check.vocab)} — {check.vocab.m}
          </div>}
          {feedback === "wrong" && <button type="button" className={`${primary} mt-4 w-full`} onClick={() => setFeedback(null)}>Try this word again</button>}
          <div className="mt-6 border-t border-border pt-2">
            <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              onClick={() => { setStage("learn"); selectWord(0); }}>
              <span aria-hidden="true">←</span>
              Back to word list
            </button>
          </div>
        </section>}

        {stage === "ready" && <section className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center">
          <div aria-hidden="true" className="font-serif text-5xl text-primary">走</div>
          <h2 className="mt-4 font-serif text-2xl font-bold">Now put your words into motion</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">You studied all {questions.length} words and recalled their readings and meanings. Your run uses this same word list.</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Preparation is practice. Run answers schedule your reviews; mastery grows through spaced repetition over time.</p>
          <button type="button" className={`${primary} mt-6 w-full`} onClick={onStart}>Start run</button>
          <button type="button" className={`${secondary} mt-3 w-full`} onClick={() => setStage("learn")}>Review the words again</button>
        </section>}
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-muted-foreground">Leave preparation · Back home</Link>
      </main>
    </div>
  );
}
