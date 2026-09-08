import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { RunnerGame } from "@/components/game/RunnerGame";
import { checkpointPassed, dailyRunReward, type RunnerStats } from "@/components/game/runner-math";
import { KanjiDetail } from "@/components/KanjiDetail";
import { WordRuby } from "@/components/WordRuby";
import { play } from "@/lib/sfx";
import {
  buildRunQueue, buildGateQuiz, grade, finishRun, clearGate,
  getCard, getSnapshot, streakCount, vocabKana, type Question,
} from "@/lib/srs";
import { CHAPTER_NAMES, CHAPTER_COUNT } from "@/data/n5";

export const Route = createFileRoute("/run")({
  validateSearch: (s: Record<string, unknown>) => {
    const g = s["gate"];
    const n = typeof g === "number" ? g : typeof g === "string" && /^\d+$/.test(g) ? parseInt(g) : NaN;
    return { gate: Number.isInteger(n) && n >= 1 && n <= CHAPTER_COUNT ? n : undefined };
  },
  head: () => ({
    meta: [
      { title: "Run — Kanji Dash" },
      { name: "description", content: "A kanji run session: read the word at each gate and clear today's review queue." },
      { property: "og:title", content: "Run — Kanji Dash" },
      { property: "og:description", content: "Steer through kanji gates in today's run." },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { gate } = useSearch({ from: "/run" });
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // The saved review queue is only available in this browser, after hydration.
  if (!ready) return <div className="game-viewport flex items-center justify-center bg-paper" role="status">Preparing your run…</div>;
  return <RunSession key={gate ?? "daily"} gate={gate} />;
}

function RunSession({ gate }: { gate: number | undefined }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(0);
  const questions = useMemo<Question[]>(() => {
    void session;
    const s = getSnapshot();
    return gate ? buildGateQuiz(gate) : buildRunQueue(s);
  }, [gate, session]);

  const [lesson, setLesson] = useState<Question | null>(null);
  const [results, setResults] = useState<null | (RunnerStats & { earned: number })>(null);
  const finished = useRef(false);

  const restart = () => {
    finished.current = false;
    setLesson(null);
    setResults(null);
    setSession((value) => value + 1);
  };

  const title = gate ? `${CHAPTER_NAMES[gate]!.name} — Checkpoint` : "Daily run";

  // One ceremony per results object: the hanko thump for 合格, an open question for 再挑戦,
  // the rising koto phrase for 完了 and a quiet page turn when the hearts ran out.
  useEffect(() => {
    if (!results) return;
    const total = questions.length;
    const opts = { earned: results.earned };
    if (gate) play(checkpointPassed(results.correct, total) ? "checkpointPassed" : "checkpointFailed", opts);
    else play(results.correct + results.wrong < total ? "runEnded" : "runComplete", opts);
  }, [results, gate, questions]);

  if (questions.length === 0 && !results) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
        <div className="font-serif text-6xl font-bold text-primary">完</div>
        <h1 className="mt-4 font-serif text-2xl font-bold">Nothing to run right now</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          There are no new kanji or reviews due in your unlocked regions. Come back later, or visit the dojo to practice strokes.
        </p>
        <div className="mt-6 flex gap-3">
          <Link to="/" className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground">Home</Link>
          <Link to="/practice" className="rounded-lg border border-border px-5 py-2.5 font-bold">Stroke dojo</Link>
        </div>
      </div>
    );
  }

  const pass = results ? checkpointPassed(results.correct, questions.length) : false;
  const attempted = results ? results.correct + results.wrong : 0;
  const unattempted = results ? questions.length - attempted : 0;
  const accuracy = results && attempted > 0 ? Math.round(results.correct / attempted * 100) : 0;
  const tileDelay = (index: number) => ({ animationDelay: `${150 + index * 60}ms` });
  // .shimmer-gold / .pulse-primary would replace .tile-in's animation shorthand on the same tile: compose both inline.
  const tileWith = (index: number, extra: string) => ({ animation: `tile-in 260ms ease-out ${150 + index * 60}ms both, ${extra}` });

  return (
    <div className="game-viewport overflow-hidden bg-paper">
      {!results && (
        <RunnerGame
          key={`${session}-${gate ?? "daily"}`}
          questions={questions}
          title={title}
          onAnswer={(q, correct) => {
            const masteryBefore = getCard(getSnapshot(), q.kanji.c).mastery;
            grade(q.kanji.c, correct);
            // The long-term goal reached inside the loop (the engine drops it when a milestone bell just rang).
            if (correct && masteryBefore < 3 && getCard(getSnapshot(), q.kanji.c).mastery === 3) play("mastered");
            if (!correct) {
              setLesson(q);
              (window as any).__kanjiDashPause?.(true);
            }
          }}
          onFinish={(stats) => {
            if (finished.current) return;
            finished.current = true;
            const earned = gate
              ? (checkpointPassed(stats.correct, questions.length) ? clearGate(gate) : 0)
              : dailyRunReward(stats);
            finishRun(gate ? 0 : earned);
            setLesson(null);
            setResults({ ...stats, earned });
          }}
        />
      )}

      {/* Lesson flash on wrong answer */}
      {lesson && !results && (
        <div className="lesson-backdrop absolute inset-0 z-20 flex items-center justify-center bg-ink/60 px-3 py-4 backdrop-blur-sm sm:p-4">
          <div className="lesson-card flex max-h-full w-full max-w-lg flex-col">
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <div className="mb-2 text-center font-serif text-lg font-bold text-paper sm:mb-3 sm:text-xl">Lesson flash — 復習</div>
              <div className="lesson-word mb-2 rounded-xl border border-border bg-card p-3 text-center sm:mb-3">
                <WordRuby vocab={lesson.vocab} focus={lesson.kanji.c} className="text-3xl font-bold sm:text-4xl" />
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-serif">{vocabKana(lesson.vocab)}</span> · {lesson.vocab.m}
                </div>
              </div>
              <div className="lesson-detail">
                <KanjiDetail kanji={lesson.kanji} />
              </div>
              <div className="lesson-answer mt-2 rounded-lg bg-card p-2.5 text-center text-sm sm:mt-3 sm:p-3">
                The answer was <b className="ink-reveal font-serif text-lg">{lesson.answer}</b>
              </div>
            </div>
            {/* No data-sfx here: the exhale + root note is played directly so it never doubles with a tap. */}
            <button
              onClick={() => {
                play("keepRunning");
                setLesson(null);
                (window as any).__kanjiDashPause?.(false);
              }}
              className="lesson-cta breathe-ring mt-3 min-h-12 w-full shrink-0 rounded-lg bg-primary py-3 font-serif text-lg font-bold text-primary-foreground shadow sm:mt-4"
            >
              Keep running
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="flex h-full overflow-y-auto bg-paper px-3 py-4 sm:px-4">
          <div className="results-card my-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 text-center shadow-sm sm:mx-auto sm:p-8">
            {gate && pass ? (
              // stamp-in lands at 200 ms + 55% of 480 ms = STAMP_LAND_SECONDS, when the thump plays
              <div className="stamp-in relative mx-auto flex h-20 w-20 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-3xl font-bold text-primary sm:h-24 sm:w-24 sm:text-4xl">
                合格
              </div>
            ) : (
              <div className="ink-in font-serif text-5xl font-bold">{gate ? "再挑戦" : "完了"}</div>
            )}
            <h1 className="mt-4 font-serif text-2xl font-bold">
              {gate ? (pass ? "Checkpoint cleared!" : "Not yet — train and return") : unattempted > 0 ? "Run ended" : "Run complete!"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {attempted} / {questions.length} answered{unattempted > 0 ? ` · ${unattempted} not reached` : ""}
            </p>
            {!gate && (
              <p className="mt-1 text-xs font-bold text-muted-foreground">
                <AppIcon name="flame" className="ignite mr-1 h-3.5 w-3.5 align-[-3px]" />
                Day {streakCount(getSnapshot())} of your streak
              </p>
            )}
            {gate && <p className="mt-1 text-xs text-muted-foreground">Pass: at least {Math.ceil(questions.length * 0.7)} correct out of {questions.length}.</p>}
            <div className="mt-5 grid grid-cols-3 gap-1.5 text-center sm:mt-6 sm:gap-3">
              <div className="tile-in rounded-lg border border-transparent bg-secondary p-2 sm:p-3" style={tileDelay(0)}>
                <div className="stamp-pop font-serif text-xl font-bold text-[#2e5238] sm:text-2xl" style={tileDelay(0)}>{results.correct}</div>
                <div className="text-xs font-bold text-muted-foreground">Correct</div>
              </div>
              <div
                className={`tile-in rounded-lg border border-transparent bg-secondary p-2 sm:p-3${results.wrong > 0 ? " pulse-primary" : ""}`}
                style={results.wrong > 0 ? tileWith(1, "pulse-primary 600ms ease-in-out 1100ms") : tileDelay(1)}
              >
                <div className="stamp-pop font-serif text-xl font-bold text-primary sm:text-2xl" style={tileDelay(1)}>{results.wrong}</div>
                <div className="text-xs font-bold text-muted-foreground">Missed</div>
              </div>
              <div className="tile-in rounded-lg border border-transparent bg-secondary p-2 sm:p-3" style={tileDelay(2)}>
                <div className="stamp-pop font-serif text-xl font-bold text-accent sm:text-2xl" style={tileDelay(2)}>×{results.bestCombo}</div>
                <div className="text-xs font-bold text-muted-foreground">Best combo</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center sm:gap-3">
              <div className="tile-in rounded-lg border border-transparent bg-secondary p-2 sm:p-3" style={tileDelay(3)}>
                <div className="stamp-pop font-serif text-xl font-bold sm:text-2xl" style={tileDelay(3)}>{results.score.toLocaleString()}</div>
                <div className="text-xs font-bold text-muted-foreground">Score</div>
              </div>
              <div className="tile-in rounded-lg border border-transparent bg-secondary p-2 sm:p-3" style={tileDelay(4)}>
                <div className="stamp-pop font-serif text-xl font-bold sm:text-2xl" style={tileDelay(4)}>{accuracy}%</div>
                <div className="text-xs font-bold text-muted-foreground">Answer accuracy</div>
              </div>
              <div className="tile-in shimmer-gold rounded-lg border border-transparent bg-secondary p-2 sm:p-3" style={tileWith(5, "shimmer-gold 700ms ease-in-out 900ms both")}>
                <div className="stamp-pop font-serif text-xl font-bold text-accent sm:text-2xl" style={tileDelay(5)}>+{results.earned}</div>
                <div className="text-xs font-bold text-muted-foreground">Mon earned</div>
              </div>
            </div>
            <div className="results-actions mt-6 flex flex-col gap-2">
              {!gate && (
                <button
                  onClick={restart}
                  data-sfx="tap"
                  className="breathe-ring rounded-lg bg-primary py-3 font-serif font-bold text-primary-foreground"
                >
                  Run again
                </button>
              )}
              {gate && !pass && (
                <button
                  onClick={restart}
                  data-sfx="tap"
                  className="breathe-ring rounded-lg bg-primary py-3 font-serif font-bold text-primary-foreground"
                >
                  Retry checkpoint
                </button>
              )}
              <button
                onClick={() => navigate({ to: gate ? "/map" : "/" })}
                data-sfx="tap"
                className="rounded-lg border border-border py-3 font-bold"
              >
                {gate ? "Back to map" : "Back home"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
