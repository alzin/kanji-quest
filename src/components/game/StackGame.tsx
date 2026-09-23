import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SoundToggle } from "../SoundToggle";
import { MusicToggle } from "../MusicToggle";
import { useGameMusic } from "@/lib/music";
import { WordAudio } from "../WordAudio";
import { play, unlock } from "@/lib/sfx";
import { vocabKana } from "@/lib/words";
import { stackOf } from "@/lib/stack-progress";
import { getSnapshot } from "@/lib/srs";
import { advanceStack, createSheet, landingRow, stackStats, type StackInput, type StackPlacement, type StackState, type StackStats } from "./stack-math";
import { seededRandom, type StackTask, type StackTile, type StackWord } from "./stack-seed";
import { advanceEffects, createEffects, drawDamageVignette, drawEffectsFront, drawLastHeartVignette, getShake, getStampFor, spawnCorrect, spawnMilestone } from "./effects";

type Props = { words: StackWord[]; title: string; seed: number; tempo?: number; forceFast?: boolean; marathon?: boolean; onPlacement: (event: StackPlacement) => void; onFinish: (stats: StackStats) => void };
type Snapshot = { current: StackTask | null; targetKind: string; hold: StackTask | null; next: StackTask[]; score: number; combo: number; remaining: number; feedback: string; feedbackId: number; phase: StackState["phase"]; spoken: string; hint: string; columns: string[] };
const BLANK: Snapshot = { current: null, targetKind: "R", hold: null, next: [], score: 0, combo: 0, remaining: 0, feedback: "", feedbackId: 0, phase: "fall", spoken: "", hint: "", columns: [] };
const serif = (px: number) => `700 ${px}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
const sans = (px: number) => `600 ${px}px "Zen Kaku Gothic New", sans-serif`;

export function StackGame({ words, title, seed, tempo = 0, forceFast = false, marathon = false, onPlacement, onFinish }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<StackState | null>(null);
  const dispatch = useRef<(input: StackInput) => void>(() => {});
  const pauseBridge = useRef<(paused: boolean) => void>(() => {});
  const callbacks = useRef({ onPlacement, onFinish }); callbacks.current = { onPlacement, onFinish };
  const [view, setView] = useState<Snapshot>(BLANK);
  const [paused, setPaused] = useState(false);
  useGameMusic("puzzle", paused);
  const pausedRef = useRef(false);
  const gesture = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d"); if (!ctx) return;
    const compact = window.innerWidth < 640;
    const rng = seededRandom(seed);
    const s = createSheet(words, compact ? 5 : 6, compact ? 8 : 10, rng, { tempo, forceFast, marathon });
    engine.current = s;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fx = createEffects({ reducedMotion: reduce.matches, seed });
    let width = 0, height = 0, cw = 0, ch = 0, raf = 0, last = performance.now(), ended = false, signature = "", chain = 0, stampPlayed = -1;
    let spoken = "";
    const cosmetics = stackOf(getSnapshot()).cosmetics;
    const cache = new Map<string, HTMLCanvasElement>();
    let redraw = () => {};
    const resize = () => {
      const rect = el.getBoundingClientRect(); width = rect.width; height = rect.height;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      el.width = Math.round(width * dpr); el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cw = width / s.cols; ch = height / s.rows; cache.clear();
      redraw();
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    const fontsReady = () => cache.clear(); document.fonts?.addEventListener("loadingdone", fontsReady);
    const refresh = () => {
      const p = s.current, w = p ? words[p.word]! : null;
      const hint = p && w && ((w.fresh && p.age < 1.5) || (p.hinted && p.age < Math.max(0.3, 1.5 / p.attempt))) ? vocabKana(w.q.vocab) : "";
      const columns = Array.from({ length: s.cols }, (_, c) => s.board[landingRow(s, c) + 1]?.[c]?.text ?? "Empty column");
      const targetKind = p ? s.board.flat().find((t) => t?.id === p.target)?.kind ?? "R" : "R";
      const next: Snapshot = { current: p ? { word: p.word, kind: p.kind, target: p.target, attempt: p.attempt, hinted: p.hinted } : null, targetKind, hold: s.hold, next: s.queue.slice(0, 3), score: s.score, combo: s.combo, remaining: s.queue.length + (p ? 1 : 0) + (s.hold ? 1 : 0), feedback: s.feedback, feedbackId: s.feedbackId, phase: s.phase, spoken, hint, columns };
      const key = JSON.stringify(next);
      if (key !== signature) { signature = key; setView(next); }
    };
    const placement = (e: StackPlacement) => {
      callbacks.current.onPlacement(e); spoken = vocabKana(e.word.q.vocab);
      if (e.correct) {
        spawnCorrect(fx, { x: (e.column + 0.5) * cw, y: (e.row + 0.5) * ch, gate: e, combo: s.combo });
        play("correct", { combo: s.combo });
        if (e.redeemed) play("wash");
      } else { fx.shake.t = 0; play("wrong"); }
    };
    const finish = () => {
      if (s.done && !ended) { ended = true; play(s.cleared ? "runComplete" : "topOut"); callbacks.current.onFinish(stackStats(s)); }
    };
    const pause = (value: boolean) => {
      if (pausedRef.current === value) return;
      pausedRef.current = value; setPaused(value); last = performance.now();
      play(value ? "pause" : "resume");
    };
    pauseBridge.current = pause;
    const send = (action: StackInput) => {
      if (pausedRef.current || ended) return;
      unlock();
      advanceStack(s, 0, [action], placement, rng);
      play(action.type === "drop" ? "hardDrop" : "tileMove"); refresh(); finish();
    };
    dispatch.current = send;
    const bridge = window as unknown as { __kanjiDashPause?: (value: boolean) => void; __kanjiDashStack?: () => unknown };
    bridge.__kanjiDashPause = pause;
    // Read-only observable state; tests still place pieces through the real controls.
    bridge.__kanjiDashStack = () => JSON.parse(JSON.stringify(s));
    const hidden = () => { if (document.hidden) pause(true); };
    const blur = () => pause(true);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.altKey || e.ctrlKey || e.metaKey) return;
      const handled = ["ArrowLeft", "ArrowRight", "a", "A", "d", "D", "ArrowDown", " ", "s", "S", "c", "C", "Shift", "Escape"].includes(e.key);
      if (!handled) return;
      e.preventDefault();
      if (e.key === "Escape") pause(!pausedRef.current);
      else if (["ArrowLeft", "a", "A"].includes(e.key)) send({ type: "move", direction: -1 });
      else if (["ArrowRight", "d", "D"].includes(e.key)) send({ type: "move", direction: 1 });
      else if (["c", "C", "Shift"].includes(e.key)) send({ type: "hold" });
      else send({ type: "drop" });
    };
    window.addEventListener("keydown", key); window.addEventListener("blur", blur); document.addEventListener("visibilitychange", hidden);

    const drawTile = (tile: StackTile, col: number, row: number, falling = false) => {
      const x = col * cw + 3, y = row * ch + 3, w = cw - 6, h = ch - 6;
      const mastery = words[tile.word]?.mastery ?? 0;
      // Decoys share the reading style: their appearance must never give the answer away.
      const color = tile.kind === "G" ? "#69665e" : falling ? "#fff9e9" : mastery >= 3 ? "#a13931" : mastery === 2 ? "#3f4c72" : "#71541a";
      const bg = tile.kind === "G" ? "#d4d0c5" : falling ? "#a13931" : tile.kind === "K" ? "#eee7d7" : "#fffaf0";
      ctx.fillStyle = bg; ctx.strokeStyle = falling ? "#7d2520" : "#cec3ae"; ctx.lineWidth = falling ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill(); ctx.stroke();
      const text = tile.kind === "G" ? words[tile.word]!.q.vocab.w : tile.text;
      const key = `${text}:${tile.kind}:${color}:${Math.round(w)}:${Math.round(h)}`;
      let glyph = cache.get(key);
      if (!glyph) {
        glyph = document.createElement("canvas"); glyph.width = Math.ceil(w * 2); glyph.height = Math.ceil(h * 2);
        const g = glyph.getContext("2d")!; g.scale(2, 2); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = color;
        const isKanji = tile.kind === "K" || tile.kind === "G";
        let size = Math.min(isKanji ? cw * 0.4 : cw * 0.23, h * 0.52);
        const font = isKanji ? serif : sans;
        g.font = font(size);
        const measured = g.measureText(text).width;
        const lines = tile.kind === "M" && measured > w - 8 ? wrapText(text, g, w - 8) : [text];
        if (lines.length === 1 && measured > w - 8) size *= (w - 8) / measured;
        g.font = font(Math.max(7, size));
        const shown = lines.slice(0, 3);
        shown.forEach((line, i) => g.fillText(line, w / 2, h / 2 + (i - (shown.length - 1) / 2) * size * 1.1 - (tile.kind === "G" ? 6 : 0), w - 6));
        if (tile.kind === "G") { g.font = sans(Math.min(10, cw * 0.14)); g.fillText(`× ${vocabKana(words[tile.word]!.q.vocab)}`, w / 2, h - 9, w - 6); }
        cache.set(key, glyph);
      }
      ctx.drawImage(glyph, x, y, w, h);
      if (s.clearIds.includes(tile.id)) { ctx.fillStyle = "rgba(216,178,74,0.28)"; ctx.fillRect(x, y, w, h); }
    };
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = cosmetics.paper === "indigo" ? "#e2e6ed" : cosmetics.paper === "moss" ? "#e6e9df" : "#eee6d5";
      ctx.fillRect(0, 0, width, height);
      ctx.save(); const shake = reduce.matches ? { x: 0, y: 0 } : getShake(fx); ctx.translate(shake.x, shake.y);
      ctx.strokeStyle = "rgba(106,86,55,0.11)"; ctx.lineWidth = 1;
      for (let c = 1; c < s.cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, height); ctx.stroke(); }
      for (let r = 1; r < s.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(width, r * ch); ctx.stroke(); }
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) { const tile = s.board[r]![c]; if (tile) drawTile(tile, c, r); }
      const p = s.current;
      if (p) {
        const row = landingRow(s, p.column);
        ctx.strokeStyle = "#a1393166"; ctx.setLineDash([4, 4]); ctx.strokeRect(p.column * cw + 4, row * ch + 4, cw - 8, ch - 8); ctx.setLineDash([]);
        const q = words[p.word]!.q;
        drawTile({ id: -1, word: p.word, kind: p.kind, text: p.kind === "K" ? q.vocab.w : p.kind === "R" ? vocabKana(q.vocab) : q.vocab.m, born: 0 }, reduce.matches ? p.column : p.x, p.y, true);
      }
      if (s.last?.correct) {
        const stamp = getStampFor(fx, s.last);
        if (stamp) {
          ctx.save(); ctx.globalAlpha = stamp.alpha; ctx.translate((s.last.column + 0.5) * cw, (s.last.row + 0.5) * ch); ctx.scale(stamp.scale, stamp.scale);
          ctx.strokeStyle = "#a13931"; ctx.fillStyle = "#a13931"; ctx.lineWidth = 2; ctx.strokeRect(-17, -17, 34, 34); ctx.font = serif(23); ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(cosmetics.stamp === "sakura" ? "花" : cosmetics.stamp === "wave" ? "波" : "正", 0, 0); ctx.restore();
        }
      }
      drawEffectsFront(ctx, fx, width, height);
      if (s.phase === "ink") drawDamageVignette(ctx, fx, width, height, Math.min(1, s.timer));
      if (s.board.slice(0, 2).some((r) => r.some(Boolean))) drawLastHeartVignette(ctx, fx, width, height);
      ctx.restore();
    };
    const frame = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000); last = now;
      if (!pausedRef.current) advanceStack(s, dt, [], placement, rng);
      advanceEffects(fx, dt, pausedRef.current);
      if (s.chains > chain) { chain = s.chains; spawnMilestone(fx, s.link); play("chain"); }
      if (s.phase === "clear" && s.timer <= 0.15 && stampPlayed !== s.feedbackId) { stampPlayed = s.feedbackId; play("stamp", { level: 0.5 }); }
      refresh(); render(); finish();
      if (!ended) raf = requestAnimationFrame(frame);
    };
    redraw = render;
    refresh(); render(); raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); document.fonts?.removeEventListener("loadingdone", fontsReady);
      window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", hidden);
      if (bridge.__kanjiDashPause === pause) delete bridge.__kanjiDashPause;
      delete bridge.__kanjiDashStack; engine.current = null;
    };
  }, [words, seed, tempo, forceFast, marathon]);

  const q = view.current ? words[view.current.word]?.q : null;
  const wordText = (task: StackTask) => { const q = words[task.word]!.q; return task.kind === "K" ? q.vocab.w : task.kind === "R" ? vocabKana(q.vocab) : q.vocab.m; };
  return <section className="stack-game" aria-label="Tsumiji stack game" data-testid="stack-game">
    <header className="stack-header">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold tracking-widest text-primary">積み字 · TSUMIJI</span><span className="truncate text-xs text-muted-foreground">{title}</span></div>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span data-testid="stack-remaining">{view.remaining} left</span><b key={`combo-${view.combo}`} data-testid="stack-combo" className={`font-serif text-xl text-accent ${view.combo > 0 ? "hud-pop" : ""}`}>×{view.combo}</b><b key={`score-${view.score}`} data-testid="stack-score" className={`tabular-nums ${view.score > 0 ? "score-tick" : ""}`}>{view.score.toLocaleString()}</b><MusicToggle compact /></div>
    </header>
    <button type="button" className="stack-prompt" data-testid="stack-word" aria-label="Hold current word" disabled={paused || !q} onClick={() => dispatch.current({ type: "hold" })}>
      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{view.targetKind === "M" ? "Find its meaning" : view.current?.kind === "K" ? "Find its reading" : view.current?.kind === "R" ? "Find the written word" : "Find the word for this meaning"}</span>
      <span className="mt-1 block font-serif text-2xl font-bold sm:text-3xl">{q && view.current?.kind === "K" ? q.segments.map((seg, i) => seg.furigana ? <ruby key={i}>{seg.t}<rt className="text-[0.4em] text-muted-foreground">{seg.furigana}</rt></ruby> : <span key={i} className={seg.focus ? "text-primary" : ""}>{seg.t}</span>) : view.current ? wordText(view.current) : "積み字"}</span>
      <span className="mt-1 block min-h-4 text-[11px] text-muted-foreground">{view.hint || "Tap to hold · once per block"}</span>
    </button>
    <div className="stack-next" aria-label="Next three words"><span className="text-[10px] font-bold uppercase text-muted-foreground">Next</span>{view.next.map((task, i) => <span key={`${task.target}-${i}`} className="min-w-0 flex-1 truncate rounded border border-border bg-card px-1.5 py-1 text-center text-xs">{wordText(task)}</span>)}</div>
    <div className="stack-board" onPointerDown={(e) => { if (paused) return; gesture.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={(e) => {
      const start = gesture.current; gesture.current = null; if (!start || paused) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientY - start.y > 32 && Math.abs(e.clientX - start.x) < 60) dispatch.current({ type: "drop" });
      else dispatch.current({ type: "column", column: Math.max(0, Math.min((engine.current?.cols ?? 5) - 1, Math.floor((e.clientX - rect.left) / rect.width * (engine.current?.cols ?? 5)))) });
    }} onPointerCancel={() => { gesture.current = null; }}>
      <canvas ref={canvas} className="h-full w-full" aria-hidden="true" />
      {paused && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-paper/95 px-5 text-center"><h2 className="font-serif text-3xl font-bold">A quiet pause</h2><p className="text-sm text-muted-foreground">Your sheet will wait.</p><button className="min-h-12 rounded-xl bg-primary px-8 font-bold text-primary-foreground" onPointerUp={(e) => e.stopPropagation()} onClick={() => pauseBridge.current(false)}>Resume sheet</button><Link to="/" onPointerUp={(e) => e.stopPropagation()} className="min-h-11 px-4 py-3 text-sm font-bold">Leave sheet</Link></div>}
    </div>
    <div role="group" aria-label="Stack columns" className="stack-columns">{view.columns.map((text, col) => <button type="button" key={col} data-testid={`stack-column-${col}`} aria-label={`Column ${col + 1}: ${text}`} disabled={paused} onClick={() => dispatch.current({ type: "column", column: col })}>{col + 1}<span className="sr-only"> · {text}</span></button>)}</div>
    <div role="status" data-testid="stack-feedback" className={`stack-feedback ${view.phase === "ink" ? "text-primary" : "text-muted-foreground"}`}>{view.feedback || "Tap a column, then tap again to drop."}</div>
    <footer className="stack-controls">
      <button type="button" data-testid="stack-hold" className="min-h-11 min-w-16 max-w-28 truncate rounded-xl border border-border px-3 text-xs font-bold" disabled={paused} onClick={() => dispatch.current({ type: "hold" })}>Hold{view.hold ? ` · ${wordText(view.hold)}` : " · 空"}</button>
      <button type="button" className="h-11 w-11 rounded-full border border-border text-lg" aria-label={paused ? "Resume game" : "Pause game"} aria-pressed={paused} onClick={() => pauseBridge.current(!paused)}>Ⅱ</button>
      <SoundToggle variant="hud" />
      <WordAudio reading={view.spoken} wordKey={view.feedbackId} paused={paused} variant="hud" />
    </footer>
  </section>;
}

function wrapText(text: string, ctx: CanvasRenderingContext2D, width: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}
