import { Link, useNavigate } from "@tanstack/react-router";
import { AppIcon } from "./AppIcon";
import { checkpointPassed, type RunnerStats } from "./game/runner-math";
import { getSnapshot, selectLevel, streakCount, type Question } from "@/lib/srs";
import { CHAPTER_NAMES, kanjiOfChapter, levelOfChapter, nextChapter } from "@/data";

export function RunResults({ gate, questions, results, pendingCheckpoint, restart }: {
  gate: number | undefined; questions: Question[]; results: RunnerStats & { earned: number };
  pendingCheckpoint: number | undefined; restart: () => void;
}) {
  const navigate = useNavigate();
  const pass = checkpointPassed(results.correct, questions.length);
  const next = gate && pass ? nextChapter(gate) : undefined;
  const attempted = results.correct + results.wrong;
  const unattempted = questions.length - attempted;
  const accuracy = attempted ? Math.round(results.correct / attempted * 100) : 0;
  const tileDelay = (index: number) => ({ animationDelay: `${150 + index * 60}ms` });
  const tileWith = (index: number, extra: string) => ({ animation: `tile-in 260ms ease-out ${150 + index * 60}ms both, ${extra}` });
  return (
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
              {next !== undefined && <Link to="/run" search={{ gate: next, mode: "runner" }} data-sfx="tap" className="breathe-ring min-h-12 rounded-xl bg-primary py-3 text-center font-serif font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">Prepare next region</Link>}
              {pendingCheckpoint !== undefined && (
                <Link
                  to="/run"
                  search={{ gate: pendingCheckpoint, mode: "runner" }}
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

  );
}
