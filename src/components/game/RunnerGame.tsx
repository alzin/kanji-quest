import { useEffect, useRef, useState } from "react";
import type { PromptSegment, Question } from "@/lib/srs";
import {
  advanceRunner, createRunnerState, getDecisionX, getGameLayout, getGateOpacity, getPreviewX,
  getRunnerRemaining, getRunnerStats, RUNNER_HEARTS, RUNNER_LANES as LANES,
  type GameLayout, type RunnerGate as Gate, type RunnerStats,
} from "./runner-math";

type Props = {
  questions: Question[];
  onAnswer: (q: Question, correct: boolean) => void; // grade + maybe lesson flash
  onFinish: (stats: RunnerStats) => void;
  title: string;
};

const SPAN_GAP = 3;

export function RunnerGame({ questions, onAnswer, onFinish, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ hearts: RUNNER_HEARTS, combo: 0, score: 0, left: questions.length });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const lessonPausedRef = useRef(false);
  const frameTimeRef = useRef<number | null>(null);
  const updatePaused = (value: boolean) => {
    // Hidden tabs may suspend animation frames; never charge that gap on resume.
    frameTimeRef.current = performance.now();
    pausedRef.current = lessonPausedRef.current || value;
    setPaused(pausedRef.current);
  };

  // external pause (lesson flash)
  useEffect(() => {
    (window as any).__kanjiDashPause = (p: boolean) => {
      lessonPausedRef.current = p;
      updatePaused(p);
    };
    return () => {
      delete (window as any).__kanjiDashPause;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const initialBounds = canvas.getBoundingClientRect();
    const s = createRunnerState(questions, Math.max(1, initialBounds.width), Math.max(1, initialBounds.height));
    setHud({ hearts: s.hearts, combo: s.combo, score: s.score, left: questions.length });
    let raf = 0;
    frameTimeRef.current = performance.now();
    let pixelRatio = window.devicePixelRatio || 1;
    let previousWidth = 0;
    let previousHeight = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const width = Math.max(1, r.width);
      const height = Math.max(1, r.height);

      // Preserve each gate's progress toward the player when a phone rotates.
      if (previousWidth > 0 && (Math.abs(width - previousWidth) > 0.5 || Math.abs(height - previousHeight) > 0.5) && s.gates.length) {
        const previousLayout = getGameLayout(previousWidth, previousHeight);
        const nextLayout = getGameLayout(width, height);
        const previousDecisionX = getDecisionX(previousLayout);
        const nextDecisionX = getDecisionX(nextLayout);
        const previousRunway = Math.max(
          1,
          getPreviewX(previousWidth, previousLayout) - previousDecisionX,
        );
        const nextRunway = Math.max(1, getPreviewX(width, nextLayout) - nextDecisionX);
        for (const gate of s.gates) {
          gate.x = nextDecisionX
            + (gate.x - previousDecisionX) * (nextRunway / previousRunway);
        }
      }

      pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      previousWidth = width;
      previousHeight = height;
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const moveLane = (dir: number) => {
      s.targetLane = Math.max(0, Math.min(LANES - 1, s.targetLane + dir));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); updatePaused(!pausedRef.current); return; }
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); moveLane(-1); }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); moveLane(1); }
    };
    const onBlur = () => updatePaused(true);
    const onVisibilityChange = () => {
      if (document.hidden) updatePaused(true);
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      const layout = getGameLayout(r.width, r.height);
      const lane = Math.floor(((y - layout.laneTop) / layout.laneSpan) * LANES);
      if (lane >= 0 && lane < LANES) s.targetLane = lane;
    };
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onPointer);

    const laneY = (lane: number, layout: GameLayout) =>
      layout.laneTop + layout.laneSpan * ((lane + 0.5) / LANES);

    let finishReported = false;
    const finish = () => {
      if (finishReported) return;
      finishReported = true;
      onFinish(getRunnerStats(s));
    };

    const frame = (t: number) => {
      const dt = Math.max(0, (t - (frameTimeRef.current ?? t)) / 1000);
      frameTimeRef.current = t;
      const W = canvas.width / pixelRatio;
      const H = canvas.height / pixelRatio;
      const layout = getGameLayout(W, H);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (!pausedRef.current && !s.done) {
        advanceRunner(s, questions, W, H, dt, (question, correct) => {
          onAnswer(question, correct);
          setHud({
            hearts: s.hearts, combo: s.combo, score: s.score,
            left: getRunnerRemaining(s, questions.length),
          });
          return !pausedRef.current;
        });
      }
      if (s.done) finish();

      // ---------- render ----------
      // sky (washi paper wash)
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#f3ead8");
      sky.addColorStop(0.7, "#efe2c8");
      sky.addColorStop(1, "#e8d7b8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // sun (vermillion hanko circle)
      ctx.fillStyle = "#c0392b";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(W * 0.78, H * 0.16, H * 0.075, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // parallax mountains
      const drawHills = (speed: number, color: string, base: number, amp: number) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, H);
        const off = (s.dist * speed) % 400;
        for (let x = -400; x <= W + 400; x += 400) {
          const px = x - off;
          ctx.lineTo(px, base);
          ctx.lineTo(px + 200, base - amp);
          ctx.lineTo(px + 400, base);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      };
      drawHills(0.15, "#b9c4b1", H * 0.5, H * 0.16);
      drawHills(0.3, "#8fa08b", H * 0.58, H * 0.12);

      // ground
      const groundY = Math.min(H, layout.laneBottom + (layout.compact ? 10 : 30));
      ctx.fillStyle = "#d9c9a3";
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = "#c9b78d";
      const goff = s.dist % 60;
      for (let x = -60; x < W + 60; x += 60) {
        ctx.fillRect(x - goff, groundY + 4, 24, 4);
      }

      // torii decoration passing by
      const toriiOff = (s.dist * 0.9) % 900;
      for (let x = -900; x < W + 900; x += 900) {
        const px = x - toriiOff;
        const gy = groundY;
        ctx.fillStyle = "#b03a2e";
        ctx.fillRect(px, gy - 130, 8, 130);
        ctx.fillRect(px + 62, gy - 130, 8, 130);
        ctx.fillRect(px - 12, gy - 140, 104, 10);
        ctx.fillRect(px - 4, gy - 116, 88, 7);
      }

      // lanes
      for (let l = 0; l < LANES; l++) {
        const y = laneY(l, layout);
        ctx.strokeStyle = "rgba(60,50,30,0.25)";
        ctx.setLineDash([14, 18]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y + layout.signHeight / 2);
        ctx.lineTo(W, y + layout.signHeight / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // gates
      const activeGate = s.gates
        .filter((g) => g.resolved === -1)
        .reduce<Gate | null>((nearest, g) => (!nearest || g.x < nearest.x ? g : nearest), null);

      const wordFont = (size: number) => `800 ${size}px "Shippori Mincho B1", serif`;
      const rubyFont = (size: number) => `700 ${size}px "Zen Kaku Gothic New", sans-serif`;

      // A span is as wide as its kanji or its furigana, whichever needs more room.
      const measureWord = (segments: PromptSegment[], wordSize: number, rubySize: number) => {
        const widths = segments.map((segment) => {
          ctx.font = wordFont(wordSize);
          const base = ctx.measureText(segment.t).width;
          ctx.font = rubyFont(rubySize);
          const ruby = segment.furigana ? ctx.measureText(segment.furigana).width : 0;
          return Math.max(base, ruby) + SPAN_GAP;
        });
        return { widths, total: widths.reduce((sum, value) => sum + value, 0) };
      };

      const drawQuestion = (g: Gate, x: number, y: number, width: number, height: number) => {
        ctx.fillStyle = "rgba(28,26,23,0.9)";
        roundRect(ctx, x - width / 2, y, width, height, 10);
        ctx.fill();

        const pad = height * 0.07;
        const helperFontSize = Math.max(10, Math.min(layout.compact ? 12 : 13, height * 0.15));
        const hasRuby = g.q.segments.some((segment) => segment.furigana);
        const rubySize = hasRuby ? Math.max(8, Math.min(13, height * 0.16)) : 0;
        const rubyGap = hasRuby ? 2 : 0;
        let wordSize = Math.max(
          14,
          Math.min(layout.compact ? 40 : 54, height - pad * 2 - rubySize - rubyGap - helperFontSize - 4),
        );

        // Long words shrink rather than spill past the panel.
        const maxWidth = width - 16;
        let measured = measureWord(g.q.segments, wordSize, rubySize);
        while (measured.total > maxWidth && wordSize > 12) {
          wordSize -= 1;
          measured = measureWord(g.q.segments, wordSize, rubySize);
        }

        const rubyBaseline = y + pad + rubySize;
        const wordBaseline = rubyBaseline + rubyGap + wordSize * 0.82;
        let spanX = x - measured.total / 2;
        g.q.segments.forEach((segment, i) => {
          const spanWidth = measured.widths[i]!;
          const center = spanX + spanWidth / 2;
          if (segment.focus) {
            ctx.fillStyle = "rgba(216,178,74,0.2)";
            roundRect(
              ctx,
              center - spanWidth / 2 + 1,
              wordBaseline - wordSize * 0.86,
              spanWidth - 2,
              wordSize * 1.06,
              5,
            );
            ctx.fill();
          }
          if (segment.furigana) {
            ctx.font = rubyFont(rubySize);
            ctx.fillStyle = "rgba(247,242,231,0.66)";
            ctx.fillText(segment.furigana, center, rubyBaseline);
          }
          ctx.font = wordFont(wordSize);
          ctx.fillStyle = segment.focus ? "#f0c469" : "#f7f2e7";
          ctx.fillText(segment.t, center, wordBaseline);
          spanX += spanWidth;
        });

        ctx.font = rubyFont(helperFontSize);
        ctx.fillStyle = "#d8b24a";
        ctx.fillText(g.q.sub, x, y + height - pad, width - 12);
      };

      ctx.textAlign = "center";
      if (layout.compact && activeGate) {
        drawQuestion(
          activeGate,
          W / 2,
          layout.questionTop,
          Math.min(226, W - 24),
          layout.questionHeight,
        );
      }

      for (const g of s.gates) {
        // On compact screens, reveal one moving decision at a time.
        if (layout.compact && g.resolved === -1 && g !== activeGate) continue;
        const bx = g.x;
        if (!layout.compact) {
          drawQuestion(g, bx, layout.questionTop, 240, layout.questionHeight);
        }

        // lane signposts (a finished gate fades away on phones)
        ctx.globalAlpha = getGateOpacity(g, layout);
        for (let l = 0; l < LANES; l++) {
          const choice = g.laneChoices[l];
          if (choice == null) continue;
          const y = laneY(l, layout);
          const isCorrect = g.resolved === 1 && l === g.correctLane;
          const isWrong = g.resolved === 0 && l === g.correctLane;
          ctx.fillStyle =
            g.resolved === -1 ? "#fdfaf2" : isCorrect ? "#4a7c59" : isWrong ? "#4a7c59" : "#e8dcc0";
          ctx.strokeStyle = g.resolved === -1 ? "#8a7a55" : isCorrect || isWrong ? "#2e5238" : "#b5a67f";
          ctx.lineWidth = 2.5;
          roundRect(
            ctx,
            bx - layout.signWidth / 2,
            y - layout.signHeight / 2,
            layout.signWidth,
            layout.signHeight,
            8,
          );
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = g.resolved === -1 ? "#1c1a17" : isCorrect || isWrong ? "#f7f2e7" : "#6b5d40";
          let fontSize = choice.length > 14 ? 13 : choice.length > 8 ? 16 : 20;
          ctx.font = `700 ${fontSize}px "Zen Kaku Gothic New", "Shippori Mincho B1", sans-serif`;
          while (fontSize > 10 && ctx.measureText(choice).width > layout.signWidth - 18) {
            fontSize -= 1;
            ctx.font = `700 ${fontSize}px "Zen Kaku Gothic New", "Shippori Mincho B1", sans-serif`;
          }
          ctx.fillText(choice, bx, y + fontSize * 0.32, layout.signWidth - 16);
        }
        ctx.globalAlpha = 1;
      }

      // player: ink runner blob
      const px = layout.playerX;
      const py = laneY(s.lane, layout);
      const run = Math.sin(s.dist * 0.05);
      if (s.bump > 0) {
        ctx.fillStyle = `rgba(74,124,89,${s.bump})`;
        ctx.beginPath();
        ctx.arc(px, py, 44, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#1c1a17";
      ctx.beginPath();
      ctx.arc(px, py - 8, 16, 0, Math.PI * 2); // body
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 10, py - 26, 9, 0, Math.PI * 2); // head
      ctx.fill();
      // headband (vermillion)
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 30);
      ctx.lineTo(px + 18, py - 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 1, py - 30);
      ctx.lineTo(px - 14 - run * 4, py - 36);
      ctx.stroke();
      // legs
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#1c1a17";
      ctx.beginPath();
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px + run * 14, py + 24);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px - run * 14, py + 24);
      ctx.stroke();

      // damage flash
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(192,57,43,${s.flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }

      // heart empty vignette
      if (s.hearts <= 1) {
        ctx.strokeStyle = "rgba(192,57,43,0.35)";
        ctx.lineWidth = 14;
        ctx.strokeRect(0, 0, W, H);
      }

      // pause overlay
      if (pausedRef.current && !s.done) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#f3ead8";
        ctx.font = `bold ${H * 0.07}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("一時停止", W / 2, H / 2 - H * 0.06);
        ctx.font = `${H * 0.03}px sans-serif`;
        ctx.fillText(layout.compact ? "Tap ▶ to resume" : "Press Esc to resume", W / 2, H / 2 + H * 0.04);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label="Kanji runner game" />
      {/* HUD */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-1.5 p-2 sm:justify-between sm:gap-2 sm:p-4"
      >
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 shadow-sm backdrop-blur sm:flex-none sm:px-3 sm:py-2">
          <div className="line-clamp-2 text-[9px] font-bold uppercase leading-tight tracking-widest text-muted-foreground sm:text-[10px]">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-base leading-none sm:mt-0 sm:gap-2 sm:text-lg">
            {Array.from({ length: RUNNER_HEARTS }).map((_, i) => (
              <span key={i} className={i < hud.hearts ? "text-primary" : "text-border"}>♥</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <div className="rounded-lg border border-border bg-card/90 px-2 py-1.5 text-right shadow-sm backdrop-blur sm:px-3 sm:py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">Combo</div>
            <div className="font-serif text-base font-bold leading-tight text-accent sm:text-lg">×{hud.combo}</div>
          </div>
          <div className="rounded-lg border border-border bg-card/90 px-2 py-1.5 text-right shadow-sm backdrop-blur sm:px-3 sm:py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">Score</div>
            <div className="font-serif text-base font-bold leading-tight sm:text-lg">{hud.score.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => updatePaused(!pausedRef.current)}
        aria-label={paused ? "Resume game" : "Pause game"}
        aria-pressed={paused}
        className="absolute bottom-2 left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-paper/30 bg-ink/80 text-lg font-bold text-paper shadow backdrop-blur sm:bottom-4 sm:left-4"
      >
        {paused ? "▶" : "Ⅱ"}
      </button>
      <div
        className="pointer-events-none absolute inset-x-14 bottom-2 flex justify-center px-1 sm:inset-x-16 sm:bottom-4"
      >
        <div className="max-w-full rounded-full bg-ink/70 px-3 py-1.5 text-center text-[11px] font-bold text-paper sm:px-4 sm:text-xs">
          <span className="mr-2">{hud.left} left</span>
          <span className="sm:hidden">Tap a lane to answer</span>
          <span className="hidden sm:inline">↑ ↓ / W S to change lane · tap a lane on touch · Esc to pause</span>
        </div>
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
