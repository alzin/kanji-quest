import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAPTER_NAMES, kanjiOfChapter, levelOfChapter, nextChapter } from "@/data";
import {
  buildQuestion, clearGate, completeCheckpointStep, finishRun, getCard, getProgressGeneration, getSnapshot, grade, isChapterUnlocked,
  isGateCleared, perfectGate, recordProduction, recordStackSheet, recordTypedSeal, reopenCheckpointStep, resetCheckpointSteps,
  selectLevel, streakCount, useSave, type Question,
} from "@/lib/srs";
import { useAccount } from "@/lib/account";
import { completedSteps, nextCheckpointStep, type CheckpointStep } from "@/lib/checkpoint-steps";
import type { AdventureTerminalResult } from "@/lib/firefly-learning";
import { acceptsReading } from "@/lib/production";
import { play } from "@/lib/sfx";
import { checkpointPassed } from "./game/runner-math";
import { RiverStackGame as StackGame } from "./game/forest/RiverStackGame";
import { composeSheets, type StackWord } from "./game/stack-seed";
import type { StackStats } from "./game/stack-math";
import { FireflyAdventure } from "./game/firefly/FireflyAdventure";
import { CheckpointRail } from "./CheckpointRail";
import { RunPreparation } from "./RunPreparation";
import { WordAudio } from "./WordAudio";

const primary = "min-h-12 rounded-xl bg-primary px-5 py-3 text-center font-bold text-primary-foreground shadow-e1";
const secondary = "min-h-12 rounded-xl border border-border px-5 py-3 text-center font-bold hover:bg-secondary";
const quiet = "min-h-11 p-3 font-bold text-muted-foreground";
const EMPTY: StackStats = { correct: 0, wrong: 0, bestCombo: 0, score: 0, redeemed: 0, chains: 0, elapsed: 0, cleared: true, wordsCleared: 0, totalWords: 0 };
function sum(a: StackStats, b: StackStats): StackStats { return { correct: a.correct + b.correct, wrong: a.wrong + b.wrong, bestCombo: Math.max(a.bestCombo, b.bestCombo), score: a.score + b.score, redeemed: a.redeemed + b.redeemed, chains: a.chains + b.chains, elapsed: a.elapsed + b.elapsed, cleared: a.cleared && b.cleared, wordsCleared: a.wordsCleared + b.wordsCleared, totalWords: a.totalWords + b.totalWords }; }

type View = CheckpointStep | "seal" | "sealed";
type Outcome = { passed: boolean; typed: number; earned: number };

/**
 * A region checkpoint: learn and write every word, stack them from memory, carry them through
 * Firefly Rescue, then type their readings for the seal. Each completed step is saved, so a
 * learner who leaves comes back to the step they reached. A failed seal reopens the rescue.
 */
export function CheckpointSession({ gate }: { gate: number }) {
  // A newly loaded account or save restarts the checkpoint from the steps saved there, so no step
  // of an earlier save is shown or written. Both stores notify as the progress generation moves on.
  useSave();
  useAccount();
  return <CheckpointJourney key={getProgressGeneration()} gate={gate} />;
}

function CheckpointJourney({ gate }: { gate: number }) {
  const save = useSave();
  const frozen = useMemo(() => {
    const s = getSnapshot();
    const questions = kanjiOfChapter(gate).flatMap((k) => k.vocab.map((v) => buildQuestion(k, "reading", v)));
    return {
      questions, blocked: !isChapterUnlocked(s, gate), wasCleared: isGateCleared(s, gate),
      words: questions.map((q): StackWord => ({ q, mastery: 2, rt: 0, fresh: getCard(s, q.kanji.c).mastery === 0 })),
    };
  }, [gate]);
  const [view, setView] = useState<View>(() => nextCheckpointStep(getSnapshot(), gate));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // A repeat seal is perfect only when this visit's stack and rescue had no misses at all.
  const flawless = useRef({ stack: false, rescue: false });
  const level = levelOfChapter(gate)!, region = CHAPTER_NAMES[gate]!, done = completedSteps(save, gate);
  const resume = () => setView(nextCheckpointStep(getSnapshot(), gate));
  const toMap = () => selectLevel(level);

  if (frozen.blocked) return <div className="river-session"><div className="stack-page">
    <h1 className="font-serif text-3xl font-bold">This {level} checkpoint is locked</h1>
    <p>Clear the previous checkpoint or reach 55% mastery progress in that region to continue.</p>
    <Link to="/map" onClick={toMap} className={primary}>View the {level} road</Link>
  </div></div>;

  if (view === "learn") return <RunPreparation questions={frozen.questions} title={`${region.name} · Checkpoint`}
    checkpoint={{ chapter: gate, rail: <CheckpointRail done={done} current={0} /> }}
    onStart={() => { completeCheckpointStep(gate, "learn"); resume(); }} />;

  if (view === "stack") return <div className="river-session"><StackStep gate={gate} words={frozen.words} done={done}
    onReview={() => setView("learn")} onContinue={resume}
    onPassed={(perfect) => { flawless.current.stack = perfect; completeCheckpointStep(gate, "stack"); }} /></div>;

  if (view === "rescue") return <FireflyAdventure checkpoint={{
    chapter: gate, rail: <CheckpointRail done={done} current={2} />,
    onSeal: (receipt: AdventureTerminalResult) => { flawless.current.rescue = receipt.learning.recallCorrect === receipt.learning.recallTotal; resume(); },
  }} />;

  if (view === "seal") return <div className="river-session"><SealCheck questions={frozen.questions} done={done} onComplete={(typed) => {
    recordTypedSeal();
    if (typed >= 2) {
      const reward = clearGate(gate);
      const perfect = frozen.wasCleared && typed === 3 && flawless.current.stack && flawless.current.rescue ? perfectGate(gate) : 0;
      // A first seal clears its steps as it is stamped; a repeat visit starts them afresh.
      resetCheckpointSteps(gate);
      setOutcome({ passed: true, typed, earned: reward + perfect });
      play("checkpointPassed", { earned: reward + perfect });
    } else {
      reopenCheckpointStep(gate, "rescue");
      setOutcome({ passed: false, typed, earned: 0 });
      play("checkpointFailed");
    }
    setView("sealed");
  }} /></div>;

  const next = outcome?.passed ? nextChapter(gate) : undefined;
  const nextOpen = next !== undefined && isChapterUnlocked(save, next);
  return <div className="river-session"><div className="stack-page" data-testid="checkpoint-results">
    <span className="stamp-in font-serif text-5xl text-primary">{outcome?.passed ? "合格" : "再挑戦"}</span>
    <h1 className="font-serif text-3xl font-bold">{outcome?.passed ? "Checkpoint cleared!" : "Keep practising your seal"}</h1>
    <p>{region.name} · {outcome?.typed ?? 0}/3 typed{outcome?.earned ? ` · +${outcome.earned} mon` : ""}</p>
    {outcome?.passed
      ? <p className="text-sm text-muted-foreground">{nextOpen ? `Next region open: ${CHAPTER_NAMES[next]!.name} · ${kanjiOfChapter(next).length} kanji` : `Every step of the ${level} road leads here. Keep revisiting your words.`}</p>
      : <p className="text-sm text-muted-foreground">Type at least 2 of 3 readings. Carry the words through Firefly Rescue once more, then the seal opens again.</p>}
    <p className="text-sm">Day {streakCount(getSnapshot())} of your streak</p>
    {outcome?.passed
      ? nextOpen && <Link to="/run" search={{ gate: next }} className={primary}>Prepare next region</Link>
      : <button className={primary} onClick={resume}>Back to Firefly Rescue</button>}
    <Link to="/map" onClick={toMap} className={outcome?.passed && !nextOpen ? primary : secondary}>Back to map</Link>
  </div></div>;
}

/** Step two: every word of the region on Tsumiji sheets. Clearing 70% of them completes the step. */
function StackStep({ gate, words, done, onPassed, onContinue, onReview }: {
  gate: number; words: StackWord[]; done: number;
  onPassed: (flawless: boolean) => void; onContinue: () => void; onReview: () => void;
}) {
  const sheets = useMemo(() => composeSheets(words), [words]);
  const [stage, setStage] = useState<"intro" | "play" | "between" | "result">("intro");
  const [sheet, setSheet] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [totals, setTotals] = useState(EMPTY);
  const [latest, setLatest] = useState<StackStats | null>(null);
  const [result, setResult] = useState<"passed" | "failed" | "filled">("passed");
  const [rest, setRest] = useState(20);
  const finished = useRef(false), missed = useRef(new Set<string>()), beforeSheet = useRef(EMPTY);
  const region = CHAPTER_NAMES[gate]!, need = Math.ceil(words.length * 0.7);
  useEffect(() => {
    if (stage !== "between") return;
    setRest(20);
    const id = window.setInterval(() => setRest((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [stage]);
  const begin = () => { finished.current = false; missed.current.clear(); setStage("play"); };
  // A filled sheet or a short total retries that sheet, never a whole new queue.
  const retry = () => { setTotals(beforeSheet.current); setLatest(null); setAttempt((v) => v + 1); begin(); };
  const toMap = <Link to="/map" onClick={() => selectLevel(levelOfChapter(gate)!)} className={quiet}>Back to the map</Link>;

  if (stage === "intro") return <div className="stack-page">
    <CheckpointRail done={done} current={1} />
    <span className="font-serif text-6xl text-primary">積み字</span>
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Step 2 of 3 · Stack &amp; recall</p>
    <h1 className="font-serif text-3xl font-bold">{region.name} · Checkpoint</h1>
    <div className="rounded-2xl border border-border bg-card p-5 text-left text-sm leading-relaxed"><p>Match a falling word with its reading or meaning tile. Matches below or beside it both count.</p><p className="mt-3">Tap a column to move. Tap again or swipe down to drop. Tap the word to hold it once.</p><p className="mt-3">Misses leave ink. Match that word later to wash it away.</p><p className="mt-3 text-muted-foreground">Clear at least {need} of the region’s {words.length} words to carry them into Firefly Rescue. {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"} · no hearts · pause whenever you need</p></div>
    <button className={primary} data-testid="stack-start" onClick={begin}>Start sheet</button>
    <button className={quiet} onClick={onReview}>Review the words</button>
    {toMap}
  </div>;

  if (stage === "play") return <StackGame key={`${sheet}-${attempt}`} words={sheets[sheet]!} title={`Checkpoint · sheet ${sheet + 1} / ${sheets.length}`} seed={7919 + sheet * 104729 + attempt * 65537}
    onPlacement={(e) => {
      if (!e.correct && missed.current.has(e.word.q.kanji.c)) return;
      if (e.grade) grade(e.word.q.kanji.c, e.correct, Date.now(), { rt: e.rt, fallTime: e.fallTime, hinted: e.hinted });
      if (!e.correct) missed.current.add(e.word.q.kanji.c);
    }}
    onFinish={(stats) => {
      if (finished.current) return; finished.current = true;
      beforeSheet.current = totals;
      const combined = sum(totals, stats), last = sheet + 1 >= sheets.length;
      const previousStreak = streakCount(getSnapshot());
      finishRun(0);
      if (streakCount(getSnapshot()) !== previousStreak) play("streakBell");
      recordStackSheet({ ...stats, kind: "checkpoint" });
      setLatest(stats); setTotals(combined);
      if (stats.cleared && !last) { setStage("between"); return; }
      if (!stats.cleared && !last) setResult("filled");
      else if (checkpointPassed(combined.wordsCleared, words.length)) {
        setResult("passed");
        onPassed(combined.wrong === 0 && combined.wordsCleared === words.length);
      } else setResult("failed");
      setStage("result");
    }} />;

  if (stage === "between") return <div className="stack-page"><span className="stamp-in font-serif text-6xl text-primary">一枚</span><h1 className="font-serif text-3xl font-bold">Sheet cleared</h1><p>{latest?.correct} matches · {latest?.score.toLocaleString()} points</p><p className="text-sm text-muted-foreground">{rest > 0 ? `Take a breath · ${rest}s` : "Ready when you are."}</p>
    <button className={primary} onClick={() => { setSheet((v) => v + 1); begin(); }}>Next sheet</button>{toMap}</div>;

  const passed = result === "passed";
  return <div className="stack-page" data-testid="stack-results">
    <CheckpointRail done={done} current={passed ? 2 : 1} />
    <span className="stamp-in font-serif text-5xl text-primary">{passed ? "積" : "満"}</span>
    <h1 className="font-serif text-3xl font-bold">{passed ? "Stack & recall complete" : result === "filled" ? "Sheet filled" : "Not yet · keep stacking"}</h1>
    <p>{totals.wordsCleared} / {words.length} words cleared{passed ? "" : ` · ${need} needed`}</p>
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-card p-4 text-center text-xs"><div><b data-testid="result-correct" className="block text-xl text-success">{totals.correct}</b>Matched</div><div><b data-testid="result-missed" className="block text-xl text-primary">{totals.wrong}</b>Missed</div><div><b data-testid="result-accuracy" className="block text-xl">{Math.round(totals.correct / Math.max(1, totals.correct + totals.wrong) * 100)}%</b>Accuracy</div></div>
    <p className="text-sm text-muted-foreground">{passed ? "Next, carry these words through Firefly Rescue. Reach the shrine to open the typed seal." : result === "filled" ? "The river filled before every word was matched. Try this sheet again." : "Try the last sheet again to carry enough words forward."}</p>
    {passed ? <button className={primary} onClick={onContinue}>Continue to Firefly Rescue</button> : <button className={primary} onClick={retry}>Retry sheet</button>}
    {!passed && <button className={secondary} onClick={onReview}>Review the words</button>}
    {toMap}
  </div>;
}

function SealCheck({ questions, done, onComplete }: { questions: Question[]; done: number; onComplete: (correct: number) => void }) {
  const checks = useMemo(() => {
    const distinct = questions.filter((q, i) => questions.findIndex((other) => other.kanji.c === q.kanji.c) === i);
    return [distinct[0]!, distinct[Math.floor(distinct.length / 2)]!, distinct[distinct.length - 1]!];
  }, [questions]);
  const [index, setIndex] = useState(0), [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const correct = useRef(0), submitted = useRef(false);
  const q = checks[index]!;
  return <div className="stack-page"><CheckpointRail done={done} current="seal" /><span className="font-serif text-5xl text-primary">関所</span><h1 className="font-serif text-3xl font-bold">Typed Seal check</h1><p className="text-sm text-muted-foreground">Reading {index + 1} of 3 · hiragana or romaji</p><p className="font-serif text-5xl">{q.vocab.w}</p>
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault(); if (submitted.current || !value.trim()) return; submitted.current = true;
      const pass = acceptsReading(q.vocab, value);
      if (pass) { correct.current++; recordProduction(q.kanji.c); }
      setFeedback(pass);
    }}><label htmlFor="seal-reading" className="text-sm font-bold">Type the reading</label><input id="seal-reading" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} className="min-h-12 w-full rounded-xl border border-border bg-card px-4 py-3 text-center text-lg" value={value} disabled={feedback !== null} onChange={(e) => setValue(e.target.value)} /><button className={primary} disabled={feedback !== null || !value.trim()}>Check reading</button></form>
    {feedback !== null && <div className="flex flex-col gap-3" role="status"><p>{feedback ? "Correct" : "Keep this reading for next time"} · {q.answer}</p><WordAudio reading={q.answer} wordKey={index} /><button className={secondary} onClick={() => { if (index === 2) onComplete(correct.current); else { submitted.current = false; setIndex((v) => v + 1); setValue(""); setFeedback(null); } }}>{index === 2 ? "See my seal" : "Next reading"}</button></div>}
  </div>;
}
