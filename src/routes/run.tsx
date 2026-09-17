import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { RunnerGame } from "@/components/game/RunnerGame";
import { RunPreparation } from "@/components/RunPreparation";
import { checkpointPassed, dailyRunReward, type RunnerStats } from "@/components/game/runner-math";
import { KanjiDetail } from "@/components/KanjiDetail";
import { WordRuby } from "@/components/WordRuby";
import { WordAudio } from "@/components/WordAudio";
import { play } from "@/lib/sfx";
import {
  buildRunQueue, buildGateQuiz, grade, finishRun, clearGate,
  getCard, getSnapshot, isChapterUnlocked, isGateCleared, learningLevel, selectLevel, streakCount, vocabKana, type Question,
} from "@/lib/srs";
import { CHAPTER_NAMES, LEVEL_CHAPTERS, kanjiOfChapter, levelOfChapter, nextChapter } from "@/data";

export const Route = createFileRoute("/run")({
  validateSearch: (s: Record<string, unknown>) => {
    const g = s["gate"];
    const n = typeof g === "number" ? g : typeof g === "string" && /^\d+$/.test(g) ? parseInt(g) : NaN;
    return { gate: levelOfChapter(n) ? n : undefined };
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
  if (!ready) return (
    <div className="game-viewport flex flex-col items-center justify-center gap-4 bg-paper" role="status">
      <span aria-hidden="true" className="font-serif text-5xl font-bold text-primary/30">走</span>
      <span className="text-sm font-bold text-muted-foreground">Preparing your run…</span>
    </div>
  );
  return <RunSession key={gate ?? "daily"} gate={gate} />;
}

function RunSession({ gate }: { gate: number | undefined }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(0);
  const [prepared, setPrepared] = useState(false);
  const { questions, level, blockedGate } = useMemo(() => {
    void session;
    const s = getSnapshot();
    const blockedGate = gate !== undefined && !isChapterUnlocked(s, gate);
    return {
      level: learningLevel(s),
      blockedGate,
      questions: gate ? (blockedGate ? [] : buildGateQuiz(gate)) : buildRunQueue(s),
    };
  }, [gate, session]);

  const [lesson, setLesson] = useState<Question | null>(null);
  const [results, setResults] = useState<null | (RunnerStats & { earned: number })>(null);
  const finished = useRef(false);

  const restart = () => {
    finished.current = false;
    setPrepared(false);
    setLesson(null);
    setResults(null);
    setSession((value) => value + 1);
  };

  const title = gate ? `${CHAPTER_NAMES[gate]!.name} — Checkpoint` : level === "N4" ? "Daily run · N4" : "Daily run";
  const pendingCheckpoint = !gate ? LEVEL_CHAPTERS[level].find((ch) => isChapterUnlocked(getSnapshot(), ch) && !isGateCleared(getSnapshot(), ch)) : undefined;

  // One ceremony per results object: the hanko thump for 合格, an open question for 再挑戦,
  // the rising koto phrase for 完了 and a quiet page turn when the hearts ran out.
  useEffect(() => {
    if (!results) return;
    const total = questions.length;
    const opts = { earned: results.earned };
    if (gate) play(checkpointPassed(results.correct, total) ? "checkpointPassed" : "checkpointFailed", opts);
    else play(results.correct + results.wrong < total ? "runEnded" : "runComplete", opts);
  }, [results, gate, questions]);

  if (blockedGate && !results) {
    const gateLevel = levelOfChapter(gate!)!;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12 text-center">
        <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-border text-muted-foreground">
          <AppIcon name="lock" className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-serif text-3xl font-bold">This {gateLevel} checkpoint is locked</h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">{gateLevel === "N4" ? `Earn all ${LEVEL_CHAPTERS.N5.length} N5 seals first. ` : ""}Clear the previous checkpoint or reach 55% mastery progress in that region to continue.</p>
        <Link to="/map" onClick={() => selectLevel(gateLevel)} className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">View the {gateLevel} road</Link>
      </div>
    );
  }

  if (questions.length === 0 && !results) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12 text-center">
        <div aria-hidden="true" className="flex h-20 w-20 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-3xl font-bold text-primary opacity-90">完</div>
        <h1 className="mt-6 font-serif text-3xl font-bold">{pendingCheckpoint !== undefined ? "Ready for your checkpoint" : "Nothing to run right now"}</h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
          {pendingCheckpoint !== undefined ? `You’ve met this region’s words. Prepare its ${kanjiOfChapter(pendingCheckpoint).length}-word checkpoint to earn a seal and open the next region.` : "There are no new kanji or reviews due in your unlocked regions. Come back later, or visit the dojo to practice strokes."}
        </p>
        {/* One filled button — the single best next step — then quiet alternatives. */}
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2.5">
          {pendingCheckpoint !== undefined
            ? <Link to="/run" search={{ gate: pendingCheckpoint }} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Prepare checkpoint</Link>
            : <Link to="/practice" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Practice in the dojo</Link>}
          {pendingCheckpoint !== undefined && <Link to="/practice" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 py-3 font-bold transition-colors hover:bg-secondary">Stroke dojo</Link>}
          <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Back home</Link>
        </div>
      </div>
    );
  }

  if (!prepared) return <RunPreparation key={session} questions={questions} title={title} onStart={() => setPrepared(true)} />;

  const pass = results ? checkpointPassed(results.correct, questions.length) : false;
  const next = gate && pass ? nextChapter(gate) : undefined;
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
                <WordAudio reading={vocabKana(lesson.vocab)} wordKey={lesson} className="mt-2" />
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
            {next !== undefined && <p className="mt-2 text-sm font-bold text-primary">Next region open: {CHAPTER_NAMES[next]!.name} · {kanjiOfChapter(next).length} kanji</p>}
            {/* What was learned, at full size; the game statistics sit under it, smaller.
                Every colour is paired with a word, so none of it is read from hue alone. */}
            <div className="tile-in mt-6 rounded-xl border border-border bg-surface-sunken p-4 text-left" style={tileDelay(0)}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">This run</span>
                <span className="text-xs font-bold text-muted-foreground"><span data-testid="result-accuracy" className="tabular-nums">{accuracy}%</span> accuracy</span>
              </div>
              <div
                className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-border"
                role="progressbar" aria-label="Answers correct" aria-valuenow={accuracy} aria-valuemin={0} aria-valuemax={100}
              >
                <span className="ring-fill block h-full bg-success" style={{ width: `${(results.correct / questions.length) * 100}%` }} />
                <span className="ring-fill block h-full bg-primary" style={{ width: `${(results.wrong / questions.length) * 100}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
                  <b data-testid="result-correct" className="stamp-pop font-serif text-lg text-success" style={tileDelay(1)}>{results.correct}</b> correct
                </span>
                <span className={`inline-flex items-center gap-1.5 font-bold${results.wrong > 0 ? " pulse-primary" : ""}`}>
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
                  <b data-testid="result-missed" className="stamp-pop font-serif text-lg text-primary" style={tileDelay(2)}>{results.wrong}</b> missed
                </span>
                {unattempted > 0 && <span className="text-muted-foreground">{unattempted} not reached</span>}
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="tile-in rounded-lg bg-secondary px-2 py-2.5" style={tileDelay(3)}>
                <div className="stamp-pop font-serif text-lg font-bold" style={tileDelay(3)}>{results.score.toLocaleString()}</div>
                <div className="text-xs font-bold text-muted-foreground">Score</div>
              </div>
              <div className="tile-in rounded-lg bg-secondary px-2 py-2.5" style={tileDelay(4)}>
                <div className="stamp-pop font-serif text-lg font-bold text-accent" style={tileDelay(4)}>×{results.bestCombo}</div>
                <div className="text-xs font-bold text-muted-foreground">Best combo</div>
              </div>
              <div className="tile-in shimmer-gold rounded-lg bg-secondary px-2 py-2.5" style={tileWith(5, "shimmer-gold 700ms ease-in-out 900ms both")}>
                <div className="stamp-pop font-serif text-lg font-bold text-accent" style={tileDelay(5)}>+{results.earned}</div>
                <div className="text-xs font-bold text-muted-foreground">Mon earned</div>
              </div>
            </div>
            {/* One filled button only: the single best next step. Everything else is an
                outline, so the eye is never asked to choose between two blocks of colour. */}
            <div className="results-actions mt-6 flex flex-col gap-2">
              {next !== undefined && <Link to="/run" search={{ gate: next }} data-sfx="tap" className="breathe-ring min-h-12 rounded-xl bg-primary py-3 text-center font-serif font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Prepare next region</Link>}
              {pendingCheckpoint !== undefined && (
                <Link
                  to="/run"
                  search={{ gate: pendingCheckpoint }}
                  data-sfx="tap"
                  className={next === undefined
                    ? "breathe-ring min-h-12 rounded-xl bg-accent py-3 text-center font-serif font-bold text-accent-foreground shadow-e1"
                    : "min-h-12 rounded-xl border border-accent/40 py-3 text-center font-serif font-bold text-accent transition-colors hover:bg-accent/8"}
                >
                  Earn a seal · Prepare checkpoint
                </Link>
              )}
              {!gate && (
                <button
                  onClick={restart}
                  data-sfx="tap"
                  className={pendingCheckpoint === undefined
                    ? "breathe-ring min-h-12 rounded-xl bg-primary py-3 font-serif font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover"
                    : "min-h-12 rounded-xl border border-border py-3 font-serif font-bold transition-colors hover:bg-secondary"}
                >
                  Run again
                </button>
              )}
              {gate && !pass && (
                <button
                  onClick={restart}
                  data-sfx="tap"
                  className="breathe-ring min-h-12 rounded-xl bg-primary py-3 font-serif font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover"
                >
                  Retry checkpoint
                </button>
              )}
              <button
                onClick={() => {
                  if (gate) selectLevel(levelOfChapter(gate)!);
                  void navigate({ to: gate ? "/map" : "/" });
                }}
                data-sfx="tap"
                className="min-h-12 rounded-xl py-3 font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
