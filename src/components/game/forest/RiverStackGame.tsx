import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { useGameMusic } from "@/lib/music";
import { play, unlock } from "@/lib/sfx";
import { vocabKana } from "@/lib/words";
import { SoundToggle } from "../../SoundToggle";
import { MusicToggle } from "../../MusicToggle";
import { WordAudio } from "../../WordAudio";
import {
  advanceStack,
  createSheet,
  landingRow,
  stackStats,
  type StackInput,
  type StackPlacement,
  type StackState,
  type StackStats,
} from "../stack-math";
import { seededRandom, type StackTask, type StackWord } from "../stack-seed";
import type { RiverView } from "./RiverStackScene";

type Props = {
  words: StackWord[];
  title: string;
  seed: number;
  tempo?: number;
  forceFast?: boolean;
  marathon?: boolean;
  onPlacement: (event: StackPlacement) => void;
  onFinish: (stats: StackStats) => void;
  forest?: boolean;
  paused?: boolean;
  onPause?: () => void;
};
type Snapshot = {
  current: StackTask | null;
  targetKind: string;
  hold: StackTask | null;
  next: StackTask[];
  combo: number;
  score: number;
  remaining: number;
  feedback: string;
  feedbackId: number;
  spoken: string;
  columns: string[];
  cleared: number;
  phase: string;
  hint: string;
};
const empty: Snapshot = {
  current: null,
  targetKind: "R",
  hold: null,
  next: [],
  combo: 0,
  score: 0,
  remaining: 0,
  feedback: "",
  feedbackId: 0,
  spoken: "",
  columns: [],
  cleared: 0,
  phase: "fall",
  hint: "",
};

export function RiverStackGame({
  words,
  title,
  seed,
  tempo = 0,
  forceFast = false,
  marathon = false,
  onPlacement,
  onFinish,
  forest = false,
  paused: externalPause = false,
  onPause,
}: Props) {
  const account = useAccount();
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<StackState | null>(null);
  const [view, setView] = useState(empty),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const [paused, setPaused] = useState(false),
    [guided, setGuided] = useState(false);
  // Both modes start with falling stones; Calm Water is an optional assist.
  const [calm, setCalm] = useState(false);
  const [help, setHelp] = useState(false);
  const pauseDialog = useRef<HTMLDialogElement>(null);
  const send = useRef<(action: StackInput) => void>(() => {});
  const pauseAction = useRef<(value: boolean) => void>(() => {});
  const controls = useRef({
    paused: true,
    guided: false,
    calm: false,
    help: false,
  });
  controls.current = {
    paused: paused || externalPause || account.prompt || help,
    guided,
    calm,
    help,
  };
  const callbacks = useRef({ onPlacement, onFinish, onPause });
  callbacks.current = { onPlacement, onFinish, onPause };
  // The adventure owns its music; avoid stealing and then orphaning its audio session.
  const music = <RiverMusic paused={!ready || controls.current.paused} />;
  const gesture = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (paused && !forest) pauseDialog.current?.showModal();
    else pauseDialog.current?.close();
  }, [paused, forest]);

  useEffect(() => {
    let disposed = false,
      ended = false,
      signature = "",
      spoken = "",
      loaded = false;
    let game: { destroy: (remove: boolean) => void } | undefined;
    const rng = seededRandom(seed),
      compact = window.innerWidth < 640 || window.innerHeight < 500;
    const state = createSheet(words, compact ? 5 : 6, compact ? 8 : 10, rng, {
      tempo,
      forceFast,
      marathon,
    });
    engine.current = state;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const refresh = () => {
      if (disposed) return;
      const p = state.current,
        word = p ? words[p.word] : null;
      const hint =
        p &&
        word &&
        ((word.fresh && p.age < 1.5) ||
          (p.hinted && p.age < Math.max(0.3, 1.5 / p.attempt)))
          ? vocabKana(word.q.vocab)
          : "";
      const next: Snapshot = {
        current: p
          ? {
              word: p.word,
              kind: p.kind,
              target: p.target,
              attempt: p.attempt,
              hinted: p.hinted,
            }
          : null,
        targetKind: p
          ? (state.board.flat().find((t) => t?.id === p.target)?.kind ?? "R")
          : "R",
        hold: state.hold,
        next: state.queue.slice(0, 3),
        score: state.score,
        combo: state.combo,
        remaining: state.queue.length + (p ? 1 : 0) + (state.hold ? 1 : 0),
        feedback: state.feedback,
        feedbackId: state.feedbackId,
        phase: state.phase,
        spoken,
        hint,
        columns: Array.from(
          { length: state.cols },
          (_, c) =>
            state.board[landingRow(state, c) + 1]?.[c]?.text ?? "Empty column",
        ),
        cleared: words.filter(
          (_, index) =>
            ![
              ...state.queue,
              ...(state.current ? [state.current] : []),
              ...(state.hold ? [state.hold] : []),
            ].some((task) => task.word === index) &&
            !state.board
              .flat()
              .some(
                (tile) =>
                  tile?.word === index && ["K", "R", "M"].includes(tile.kind),
              ),
        ).length,
      };
      const key = JSON.stringify(next);
      if (key !== signature) {
        signature = key;
        setView(next);
      }
    };
    const placement = (event: StackPlacement) => {
      callbacks.current.onPlacement({
        ...event,
        hinted: event.hinted || controls.current.guided,
      });
      spoken = vocabKana(event.word.q.vocab);
      play(event.correct ? "correct" : "wrong", { combo: state.combo });
      if (event.redeemed) play("wash");
    };
    const finish = () => {
      if (state.done && !ended) {
        ended = true;
        play(state.cleared ? "runComplete" : "topOut");
        callbacks.current.onFinish(stackStats(state));
      }
    };
    const pause = (value: boolean) => {
      if (forest) {
        if (value) callbacks.current.onPause?.();
        return;
      }
      controls.current.paused = value;
      setPaused(value);
    };
    pauseAction.current = pause;
    const dispatch = (action: StackInput) => {
      if (!loaded || disposed || ended || controls.current.paused) return;
      unlock();
      advanceStack(state, 0, [action], placement, rng);
      if (controls.current.calm && state.current)
        state.current.x = state.current.column;
      play(action.type === "drop" ? "hardDrop" : "tileMove");
      refresh();
      finish();
    };
    send.current = dispatch;
    const bridge = window as unknown as {
      __kanjiDashStack?: () => unknown;
      __kanjiDashPause?: (value: boolean) => void;
    };
    const inspect = () => JSON.parse(JSON.stringify(state));
    bridge.__kanjiDashStack = inspect;
    bridge.__kanjiDashPause = pause;
    const key = (e: KeyboardEvent) => {
      if (
        account.prompt ||
        e.isComposing ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key === "Escape") {
        if (!forest && !controls.current.help) {
          e.preventDefault();
          pause(!controls.current.paused);
        }
        return;
      }
      if (controls.current.paused) return;
      let action: StackInput | undefined;
      if (["ArrowLeft", "a", "A"].includes(e.key))
        action = { type: "move", direction: -1 };
      else if (["ArrowRight", "d", "D"].includes(e.key))
        action = { type: "move", direction: 1 };
      else if (["c", "C", "Shift"].includes(e.key)) action = { type: "hold" };
      else if (["ArrowDown", " "].includes(e.key)) action = { type: "drop" };
      else if (/^[1-6]$/.test(e.key))
        action = { type: "column", column: Number(e.key) - 1 };
      if (action) {
        e.preventDefault();
        dispatch(action);
      }
    };
    const hide = () => {
        if (document.hidden) pause(true);
      },
      blur = () => pause(true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hide);
    const river: RiverView = {
      state,
      paused: false,
      reducedMotion: media.matches,
      guided: false,
      ready: () => {
        if (!disposed) {
          loaded = true;
          clearTimeout(timeout);
          setReady(true);
        }
      },
      tick: (seconds) => {
        river.paused = controls.current.paused;
        river.reducedMotion = media.matches;
        river.guided = controls.current.guided;
        if (disposed || ended || controls.current.paused) return;
        // Calm water is turn-based: keep feedback/gravity moving, freeze only a falling stone.
        if (!(controls.current.calm && state.phase === "fall"))
          advanceStack(state, seconds, [], placement, rng);
        refresh();
        finish();
      },
    };
    const timeout = setTimeout(() => {
      if (!disposed) setError(true);
    }, 20000);
    import("./RiverStackScene")
      .then(({ mountRiverStack }) => {
        if (!disposed && host.current)
          game = mountRiverStack(host.current, river);
      })
      .catch(() => {
        if (!disposed) {
          clearTimeout(timeout);
          setError(true);
        }
      });
    refresh();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      game?.destroy(true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hide);
      if (bridge.__kanjiDashStack === inspect) delete bridge.__kanjiDashStack;
      if (bridge.__kanjiDashPause === pause) delete bridge.__kanjiDashPause;
      engine.current = null;
      send.current = () => {};
    };
  }, [words, seed, tempo, forceFast, marathon, forest]);

  const wordText = (task: StackTask) => {
    const q = words[task.word]!.q;
    return task.kind === "K"
      ? q.vocab.w
      : task.kind === "R"
        ? vocabKana(q.vocab)
        : q.vocab.m;
  };
  const disabled = !ready || controls.current.paused;
  return (
    <section
      className={`river-game ${forest ? "river-game-encounter" : ""}`}
      aria-label="Tsumiji river stones"
      data-testid="stack-game"
    >
      {!forest && music}
      <header className="river-header">
        <div>
          <span className="forest-eyebrow">積み字 · THE SPIRIT TRAIL</span>
          <h1>River of words</h1>
        </div>
        <div className="river-header-actions">
          <span>{title}</span>
          <button
            aria-label="How to play river stones"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
          <button
            aria-label={paused ? "Resume game" : "Pause game"}
            onClick={() => pauseAction.current(!paused)}
          >
            Ⅱ
          </button>
        </div>
      </header>
      <div className="river-layout">
        <aside className="river-story">
          <span className="forest-eyebrow">
            {forest ? "02 / THE CROSSING" : "THE WORDKEEPER’S TRIAL"}
          </span>
          <h2>
            {forest ? "Build a way\nacross." : "Let the words\nflow again."}
          </h2>
          <p>
            Bring each word to its partner. A match returns a little light to
            the river.
          </p>
          <div className="river-bridge-art" aria-hidden="true">
            {Array.from({ length: words.length }, (_, i) => (
              <i key={i} className={i < view.cleared ? "lit" : ""} />
            ))}
            <span>川</span>
          </div>
          <div
            className="river-progress"
            role="progressbar"
            aria-label="Words restored"
            aria-valuemin={0}
            aria-valuemax={words.length}
            aria-valuenow={view.cleared}
          >
            <span
              style={{
                width: `${(view.cleared / Math.max(1, words.length)) * 100}%`,
              }}
            />
          </div>
          <p className="river-progress-label">
            {view.cleared} / {words.length} words restored
          </p>
          {forest && (
            <div className="river-route">
              <span>✓ Lantern</span>
              <b>◇ Crossing</b>
              <span>○ Shrine</span>
            </div>
          )}
        </aside>
        <div className="river-play">
          <div className="river-score">
            <span data-testid="stack-remaining">{view.remaining} left</span>
            <span className="river-mobile-progress">
              {view.cleared}/{words.length} restored
            </span>
            <span>
              <b data-testid="stack-combo">×{view.combo}</b> flow
            </span>
            <b data-testid="stack-score">{view.score.toLocaleString()}</b>
          </div>
          <button
            className="river-prompt"
            data-testid="stack-word"
            aria-label="Hold current word"
            disabled={disabled || !view.current}
            onClick={() => send.current({ type: "hold" })}
          >
            <span>
              {view.targetKind === "M"
                ? "Find its meaning"
                : view.current?.kind === "K"
                  ? "Find its reading"
                  : view.current?.kind === "R"
                    ? "Find the written word"
                    : "Find the word for this meaning"}
            </span>
            <strong lang={view.current?.kind === "M" ? "en" : "ja"}>
              {view.current ? wordText(view.current) : "川"}
            </strong>
            <small>
              {view.hint ||
                (calm
                  ? "Calm water · drop when you’re ready"
                  : "Tap to hold · once per stone")}
            </small>
          </button>
          <div
            className="river-board"
            onPointerDown={(e) => {
              if (disabled) return;
              gesture.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const start = gesture.current;
              gesture.current = null;
              if (!start || disabled) return;
              const rect = e.currentTarget.getBoundingClientRect();
              if (
                e.clientY - start.y > 32 &&
                Math.abs(e.clientX - start.x) < 60
              )
                send.current({ type: "drop" });
              else
                send.current({
                  type: "column",
                  column: Math.min(
                    (engine.current?.cols ?? 5) - 1,
                    Math.max(
                      0,
                      Math.floor(
                        ((e.clientX - rect.left) / rect.width) *
                          (engine.current?.cols ?? 5),
                      ),
                    ),
                  ),
                });
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
          >
            <div
              ref={host}
              className="river-canvas"
              role="img"
              aria-label="Word stones floating on a river. Match below or beside the landing stone using the column buttons."
            />
            {!ready && (
              <div className="river-loading" role={error ? "alert" : "status"}>
                {error ? (
                  <>
                    <p>The river couldn’t load.</p>
                    <button onClick={() => location.reload()}>
                      Reload game
                    </button>
                  </>
                ) : (
                  "Listening to the river…"
                )}
              </div>
            )}
          </div>
          <div
            role="group"
            aria-label="Stack columns"
            className="river-columns"
          >
            {view.columns.map((text, col) => (
              <button
                key={col}
                data-testid={`stack-column-${col}`}
                aria-label={`Column ${col + 1}: ${text}`}
                disabled={disabled}
                onClick={() => send.current({ type: "column", column: col })}
              >
                {col + 1}
                <span className="sr-only"> · {text}</span>
              </button>
            ))}
          </div>
          <div
            role="status"
            data-testid="stack-feedback"
            className={`river-feedback ${view.phase === "ink" ? "river-miss" : ""}`}
          >
            {view.feedback ||
              "Tap a lane, then tap again to drop. Matches beside it count too."}
          </div>
          <footer className="river-controls">
            <button
              data-testid="stack-hold"
              disabled={disabled}
              onClick={() => send.current({ type: "hold" })}
            >
              Hold <span>{view.hold ? wordText(view.hold) : "空"}</span>
            </button>
            <button
              className="river-drop"
              disabled={disabled}
              onClick={() => send.current({ type: "drop" })}
            >
              Drop <span>↓</span>
            </button>
            {forest ? (
              <button
                disabled={disabled || guided}
                aria-pressed={guided}
                onClick={() => setGuided(true)}
              >
                {guided ? "Aki is guiding" : "Ask Aki"}
              </button>
            ) : (
              <SoundToggle variant="hud" />
            )}
            <WordAudio
              reading={view.spoken}
              wordKey={view.feedbackId}
              paused={disabled}
              variant="hud"
            />
          </footer>
        </div>
        <aside className="river-companion">
          <div className="river-aki" aria-hidden="true">
            <svg viewBox="0 0 80 80">
              <path
                fill="#b86c35"
                d="M11 11 32 23 49 23 69 11 66 48 40 70 14 48Z"
              />
              <path
                fill="#efb15c"
                d="M17 17 34 31 47 31 63 17 62 48 40 64 18 48Z"
              />
              <path fill="#553e31" d="m19 21 10 9-9 8Zm42 0-10 9 9 8Z" />
              <path
                fill="#f4e5b8"
                d="m18 44 16 5 6 11 6-11 16-5-10 18-12 8-12-8Z"
              />
              <path
                fill="#26362b"
                d="M26 39h5v6h-5Zm23 0h5v6h-5ZM35 54h10l-5 7Z"
              />
            </svg>
          </div>
          <span className="forest-eyebrow">AKI’S FIELD GUIDE</span>
          <p>
            {view.phase === "ink"
              ? "A word slipped away. Find its partner again to wash the ink away."
              : "Words travel together. Read the stone, find its partner, then let it land."}
          </p>
          <div className="river-next" aria-label="Next three words">
            <span className="forest-eyebrow">UPSTREAM</span>
            {view.next.map((task, i) => (
              <span key={`${task.target}-${i}`}>{wordText(task)}</span>
            ))}
          </div>
          {forest && (
            <>
              <button
                className="river-calm"
                aria-pressed={calm}
                onClick={() => setCalm((v) => !v)}
              >
                {calm ? "≈ Calm water" : "≈ Flowing water"}
                <small>
                  {calm ? "No falling timer" : "Stones fall automatically"}
                </small>
              </button>
              <p className="river-fine">
                {guided
                  ? "Aki lights the partner stone. Guided matches help you learn, without independent recall credit."
                  : "Take your time. Finish the crossing to open the path to the shrine."}
              </p>
            </>
          )}
          <p className="river-keyboard">
            ← → Move · ↓ / Space Drop
            <br />C Hold · Esc Pause
          </p>
        </aside>
      </div>
      {forest && (
        <span className="sr-only" role="status">
          {guided
            ? "Aki highlights the matching stone. Guided answers do not earn independent recall credit."
            : ""}
        </span>
      )}
      <dialog
        ref={pauseDialog}
        className="forest-dialog river-pause"
        aria-label="River paused"
        onCancel={(e) => {
          e.preventDefault();
          pauseAction.current(false);
        }}
      >
        <span className="forest-eyebrow">A QUIET MOMENT</span>
        <h2>A quiet pause</h2>
        <p>Your stones will wait.</p>
        <button
          className="forest-primary"
          onClick={() => pauseAction.current(false)}
        >
          Resume sheet
        </button>
        <div className="forest-audio">
          <MusicToggle compact />
          <SoundToggle variant="inline" />
        </div>
        <Link to="/camp" className="forest-text-button">
          Leave sheet
        </Link>
      </dialog>
      {help && (
        <RiverHelp
          forest={forest}
          calm={calm}
          setCalm={setCalm}
          close={() => setHelp(false)}
        />
      )}
    </section>
  );
}

function RiverMusic({ paused }: { paused: boolean }) {
  useGameMusic("puzzle", paused);
  return null;
}
function RiverHelp({
  forest,
  calm,
  setCalm,
  close,
}: {
  forest: boolean;
  calm: boolean;
  setCalm: (v: boolean) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="forest-dialog river-help"
      aria-label="How to play river stones"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <span className="forest-eyebrow">THE CROSSING · 積み字</span>
      <h2>Each word has a partner.</h2>
      <p>
        Match the golden stone to its reading, written word, or meaning. The
        partner can be directly below or beside the landing space.
      </p>
      <ol>
        <li>Tap a numbered lane or use ← → to aim.</li>
        <li>Tap that lane again, swipe down, or press Space to drop.</li>
        <li>Hold a stone with C to try the next word first.</li>
      </ol>
      <p>A missed match leaves ink. Match that word later to wash it away.</p>
      {forest && (
        <button
          className="river-calm"
          aria-pressed={calm}
          onClick={() => setCalm(!calm)}
        >
          {calm ? "Calm water · no timer" : "Flowing water · timed"}
        </button>
      )}
      <button className="forest-primary" onClick={close}>
        Back to the stones
      </button>
    </dialog>
  );
}
