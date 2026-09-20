import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { allKanji, CHAPTER_NAMES, kanjiOfChapter, levelOfChapter } from "@/data";
import { awardDailySeal, buildQuestion, buildStackQueue, clearGate, finishRun, getCard, getSnapshot, grade, isChapterUnlocked, isGateCleared, perfectGate, recordProduction, recordStackSheet, recordTypedSeal, selectLevel, streakCount } from "@/lib/srs";
import { acceptsReading } from "@/lib/production";
import { dailyQuests, localDay, stackOf } from "@/lib/stack-progress";
import { play } from "@/lib/sfx";
import { dailyRunReward, checkpointPassed } from "./game/runner-math";
import { StackGame } from "./game/StackGame";
import { composeSheets, type StackWord } from "./game/stack-seed";
import type { StackStats } from "./game/stack-math";
import { RunPreparation } from "./RunPreparation";
import { WordAudio } from "./WordAudio";

export type StackMode = "daily" | "fluency" | "marathon";
const primary = "min-h-12 rounded-xl bg-primary px-5 py-3 text-center font-bold text-primary-foreground shadow-e1";
const secondary = "min-h-12 rounded-xl border border-border px-5 py-3 text-center font-bold hover:bg-secondary";
const EMPTY: StackStats = { correct: 0, wrong: 0, bestCombo: 0, score: 0, redeemed: 0, chains: 0, elapsed: 0, cleared: true, wordsCleared: 0, totalWords: 0 };
function sum(a: StackStats, b: StackStats): StackStats { return { correct: a.correct + b.correct, wrong: a.wrong + b.wrong, bestCombo: Math.max(a.bestCombo, b.bestCombo), score: a.score + b.score, redeemed: a.redeemed + b.redeemed, chains: a.chains + b.chains, elapsed: a.elapsed + b.elapsed, cleared: a.cleared && b.cleared, wordsCleared: a.wordsCleared + b.wordsCleared, totalWords: a.totalWords + b.totalWords }; }

export function StackSession({ gate, kind }: { gate: number | undefined; kind: StackMode }) {
  const [attempt, setAttempt] = useState(0);
  const frozen = useMemo(() => {
    const save = getSnapshot();
    const blocked = gate !== undefined && !isChapterUnlocked(save, gate);
    const questions = gate !== undefined ? blocked ? [] : kanjiOfChapter(gate).flatMap((k) => k.vocab.map((v) => buildQuestion(k, "reading", v)))
      : kind === "daily" ? buildStackQueue(save)
      : allKanji.filter((k) => isChapterUnlocked(save, k.ch) && getCard(save, k.c).mastery >= 2 && getCard(save, k.c).due > Date.now()).slice(0, 7).map((k) => buildQuestion(k, "reading", k.vocab[save.runsCompleted % k.vocab.length]!));
    const words: StackWord[] = questions.map((q) => { const p = getCard(save, q.kanji.c); return { q, mastery: gate ? 2 : p.mastery, rt: gate ? 0 : p.rt ?? 0, fresh: p.mastery === 0 }; });
    return { sheets: composeSheets(words), words, fresh: words.filter((w) => w.fresh).map((w) => w.q), blocked, best: kind === "marathon" ? stackOf(save).bestMarathon : stackOf(save).bestSheet, wasCleared: gate !== undefined && isGateCleared(save, gate), hadSeal: stackOf(save).lastSealDay === localDay() };
  }, [gate, kind]);
  const [stage, setStage] = useState<"learn" | "intro" | "play" | "between" | "seal" | "results">("learn");
  const [sheet, setSheet] = useState(0);
  const [latest, setLatest] = useState<StackStats | null>(null);
  const [totals, setTotals] = useState(EMPTY);
  const [earned, setEarned] = useState(0);
  const [sealCorrect, setSealCorrect] = useState(0);
  const [rest, setRest] = useState(20);
  const finished = useRef(false);
  const missed = useRef(new Set<string>());
  const beforeSheet = useRef({ totals: EMPTY, earned: 0 });
  const actualKind = gate !== undefined ? "checkpoint" : kind;
  const words = frozen.sheets[sheet % Math.max(1, frozen.sheets.length)] ?? [];
  const stopSuggested = stackOf(getSnapshot()).playDay === localDay() && stackOf(getSnapshot()).playMs >= 20 * 60_000;
  const retry = () => {
    finished.current = false; missed.current.clear(); setSealCorrect(0);
    if (gate !== undefined && latest?.cleared) {
      // A failed typed check restarts the whole checkpoint. A top-out retries
      // this exact sheet without replacing its still-due words from the store.
      setSheet(0); setTotals(EMPTY); setEarned(0);
    } else { setTotals(beforeSheet.current.totals); setEarned(beforeSheet.current.earned); }
    setLatest(null); setAttempt((v) => v + 1); setStage("play");
  };
  useEffect(() => {
    if (stage !== "between") return;
    setRest(20);
    const id = window.setInterval(() => setRest((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  if (frozen.blocked) return <div className="stack-page"><h1 className="font-serif text-3xl font-bold">This {levelOfChapter(gate!)} checkpoint is locked</h1><p>Clear the previous checkpoint or reach 55% mastery progress in that region to continue.</p><Link to="/map" onClick={() => selectLevel(levelOfChapter(gate!)!)} className={primary}>View the {levelOfChapter(gate!)} road</Link></div>;
  if (!frozen.words.length) return <div className="stack-page"><span className="font-serif text-6xl text-primary">完</span><h1 className="font-serif text-3xl font-bold">{kind === "daily" ? "Your sheets are up to date" : "Fluency comes with practice"}</h1><p className="text-muted-foreground">{kind === "daily" ? "No new words or reviews are due. Your next checkpoint is waiting on the map." : "These extra sheets unlock when you have reviewing or mastered words that are not due."}</p><Link to="/map" className={primary}>View the road</Link><Link to="/" className={secondary}>Back home</Link></div>;
  if (stage === "learn" && frozen.fresh.length) return <RunPreparation questions={frozen.fresh} title="Tsumiji · new words" learnOnly onStart={() => setStage("intro")} />;
  if (stage === "intro" || stage === "learn") return <div className="stack-page">
    <span className="font-serif text-6xl text-primary">積み字</span><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">A little recall. A little rhythm.</p>
    <h1 className="font-serif text-3xl font-bold">{gate ? `${CHAPTER_NAMES[gate]!.name} · Checkpoint` : kind === "daily" ? "Today’s sheets" : kind === "fluency" ? "Fluency sheet" : "Marathon"}</h1>
    <div className="rounded-2xl border border-border bg-card p-5 text-left text-sm leading-relaxed"><p>Match a falling word with its reading or meaning tile. Matches below or beside it both count.</p><p className="mt-3">Tap a column to move. Tap again or swipe down to drop. Tap the word to hold it once.</p><p className="mt-3">Misses leave ink. Match that word later to wash it away.</p><p className="mt-3 text-muted-foreground">{gate ? "Clear at least 70% of the words, then type 2 of 3 readings for your seal." : kind === "marathon" ? "The ink rises every 12 seconds. Each sheet gets a little faster." : `${frozen.sheets.length} ${frozen.sheets.length === 1 ? "sheet" : "sheets"} · no hearts · pause whenever you need`}</p></div>
    <button className={primary} data-testid="stack-start" onClick={() => { finished.current = false; setStage("play"); }}>Start sheet</button><Link to="/" className="min-h-11 p-3 font-bold text-muted-foreground">Back home</Link>
  </div>;

  if (stage === "play") return <StackGame key={`${sheet}-${attempt}`} words={words} title={gate ? "Checkpoint" : `${kind === "marathon" ? "Marathon" : "Sheet"} ${sheet + 1}${kind === "marathon" ? "" : ` / ${frozen.sheets.length}`}`} seed={7919 + sheet * 104729 + attempt * 65537} tempo={kind === "marathon" ? sheet : 0} forceFast={kind !== "daily" && !gate} marathon={kind === "marathon" && !gate}
    onPlacement={(e) => {
      if (!e.correct && missed.current.has(e.word.q.kanji.c)) return;
      if (e.grade) grade(e.word.q.kanji.c, e.correct, Date.now(), { rt: e.rt, fallTime: e.fallTime, hinted: e.hinted });
      if (!e.correct) missed.current.add(e.word.q.kanji.c);
    }}
    onFinish={(stats) => {
      if (finished.current) return; finished.current = true;
      beforeSheet.current = { totals, earned };
      const combined = sum(totals, stats);
      const reward = gate ? 0 : dailyRunReward(stats);
      const previousStreak = streakCount(getSnapshot());
      finishRun(reward);
      if (streakCount(getSnapshot()) !== previousStreak) play("streakBell");
      recordStackSheet({ ...stats, score: kind === "marathon" ? combined.score : stats.score, kind: actualKind });
      setEarned((v) => v + reward); setLatest(stats); setTotals(combined);
      const more = sheet + 1 < frozen.sheets.length;
      if (stats.cleared && (more || kind === "marathon")) setStage("between");
      else if (gate) setStage("seal");
      else {
        if (kind === "daily" && combined.cleared && !more) { awardDailySeal(); if (!frozen.hadSeal) play("sealEarned"); }
        setStage("results");
      }
    }} />;

  if (stage === "between") return <div className="stack-page"><span className="stamp-in font-serif text-6xl text-primary">一枚</span><h1 className="font-serif text-3xl font-bold">Sheet cleared</h1><p>{latest?.correct} matches · {latest?.score.toLocaleString()} points</p><p className="text-sm text-muted-foreground">{rest > 0 ? `Take a breath · ${rest}s` : "Ready when you are."}</p>
    {stopSuggested && <p className="rounded-xl bg-secondary p-4 text-sm">Twenty minutes of practice. A good place to rest.</p>}
    {stopSuggested && <Link to="/" className={primary}>Done for today</Link>}
    <button className={stopSuggested ? secondary : primary} onClick={() => { finished.current = false; missed.current.clear(); setSheet((v) => v + 1); setStage("play"); }}>Next sheet</button><button className={stopSuggested ? "min-h-11 p-3 text-sm" : secondary} onClick={() => setStage("results")}>Finish for now</button></div>;

  if (stage === "seal") return <SealCheck words={frozen.words} onComplete={(correct) => {
    setSealCorrect(correct); recordTypedSeal();
    const pass = checkpointPassed(totals.wordsCleared, frozen.words.length) && correct >= 2;
    if (pass) {
      const reward = clearGate(gate!);
      const repeat = frozen.wasCleared && totals.wrong === 0 && totals.wordsCleared === frozen.words.length && correct === 3 ? perfectGate(gate!) : 0;
      setEarned((v) => v + reward + repeat); play("checkpointPassed", { earned: reward + repeat });
    } else play("checkpointFailed");
    setStage("results");
  }} />;

  const pass = gate !== undefined && checkpointPassed(totals.wordsCleared, frozen.words.length) && sealCorrect >= 2;
  const allDone = !gate && kind === "daily" && totals.cleared && sheet + 1 >= frozen.sheets.length;
  const newBest = (kind === "marathon" ? totals.score : latest?.score ?? 0) > frozen.best;
  const stack = stackOf(getSnapshot());
  return <div className="stack-page" data-testid="stack-results">
    <span className="stamp-in font-serif text-5xl text-primary">{gate ? pass ? "合格" : "再挑戦" : allDone ? "御朱印" : latest?.cleared ? "積" : "満"}</span>
    <h1 className="font-serif text-3xl font-bold">{gate ? pass ? "Checkpoint cleared!" : "Keep practising your seal" : allDone ? "Today’s sheets complete" : latest?.cleared ? "Practice complete" : "Sheet filled"}</h1>
    <p>{totals.wordsCleared} / {frozen.words.length * (kind === "marathon" ? Math.floor(sheet / frozen.sheets.length) + 1 : 1)} words cleared{gate ? ` · ${sealCorrect}/3 typed` : ""}</p>
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-card p-4 text-center text-xs"><div><b data-testid="result-correct" className="block text-xl text-success">{totals.correct}</b>Matched</div><div><b data-testid="result-missed" className="block text-xl text-primary">{totals.wrong}</b>Missed</div><div><b data-testid="result-accuracy" className="block text-xl">{Math.round(totals.correct / Math.max(1, totals.correct + totals.wrong) * 100)}%</b>Accuracy</div></div>
    <div className="grid grid-cols-3 gap-2 text-sm"><div><b data-testid="result-score" className="block text-xl">{totals.score.toLocaleString()}</b>Score</div><div><b className="block text-xl">×{totals.bestCombo}</b>Best combo</div><div><b data-testid="result-mon" className="block text-xl">+{earned}</b>Mon</div></div>
    <p className="text-sm text-accent">{newBest ? "A new personal best" : `Personal best · ${frozen.best.toLocaleString()}`}{totals.redeemed ? ` · ${totals.redeemed} ink tiles washed` : ""}</p>
    <p className="text-sm">Day {streakCount(getSnapshot())} · {stack.freezes.count} free {stack.freezes.count === 1 ? "freeze" : "freezes"}{stack.freezes.lastUsedDay === localDay() ? " · A freeze kept your streak" : ""}</p>
    {streakCount(getSnapshot()) === 7 && <p className="rounded-xl border border-gold p-4 font-serif text-lg">七日 · A week of words. Your road is taking shape.</p>}
    <ul className="space-y-1 text-left text-xs text-muted-foreground">{dailyQuests(getSnapshot()).map((q) => <li key={q.key}>{q.value === q.target ? "✓" : "○"} {q.label} · {q.value}/{q.target}</li>)}</ul>
    <Link to="/" className={primary}>Done for today · streak safe</Link>
    {(!latest?.cleared || (gate !== undefined && !pass)) && <button className={secondary} onClick={retry}>Retry sheet</button>}
    {gate !== undefined && <Link to="/map" onClick={() => selectLevel(levelOfChapter(gate)!)} className={secondary}>Back to map</Link>}
    <Link to="/run" search={{ mode: "stack", practice: "fluency" }} className={secondary}>Fluency sheet</Link>
    <Link to="/run" search={{ mode: "stack", practice: "marathon" }} className={secondary}>Marathon</Link>
  </div>;
}

function SealCheck({ words, onComplete }: { words: StackWord[]; onComplete: (correct: number) => void }) {
  const checks = useMemo(() => {
    const distinct = words.filter((w, i) => words.findIndex((other) => other.q.kanji.c === w.q.kanji.c) === i);
    return [distinct[0]!, distinct[Math.floor(distinct.length / 2)]!, distinct[distinct.length - 1]!];
  }, [words]);
  const [index, setIndex] = useState(0), [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const correct = useRef(0), submitted = useRef(false);
  const q = checks[index]!.q;
  return <div className="stack-page"><span className="font-serif text-5xl text-primary">関所</span><h1 className="font-serif text-3xl font-bold">Typed Seal check</h1><p className="text-sm text-muted-foreground">Reading {index + 1} of 3 · hiragana or romaji</p><p className="font-serif text-5xl">{q.vocab.w}</p>
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault(); if (submitted.current || !value.trim()) return; submitted.current = true;
      const pass = acceptsReading(q.vocab, value);
      if (pass) { correct.current++; recordProduction(q.kanji.c); }
      setFeedback(pass);
    }}><label htmlFor="seal-reading" className="text-sm font-bold">Type the reading</label><input id="seal-reading" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} className="min-h-12 w-full rounded-xl border border-border bg-card px-4 py-3 text-center text-lg" value={value} disabled={feedback !== null} onChange={(e) => setValue(e.target.value)} /><button className={primary} disabled={feedback !== null || !value.trim()}>Check reading</button></form>
    {feedback !== null && <div className="flex flex-col gap-3" role="status"><p>{feedback ? "Correct" : "Keep this reading for next time"} · {q.answer}</p><WordAudio reading={q.answer} wordKey={index} /><button className={secondary} onClick={() => { if (index === 2) onComplete(correct.current); else { submitted.current = false; setIndex((v) => v + 1); setValue(""); setFeedback(null); } }}>{index === 2 ? "See my seal" : "Next reading"}</button></div>}
  </div>;
}
