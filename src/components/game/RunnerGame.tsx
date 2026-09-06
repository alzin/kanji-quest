import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/srs";

type Props = {
  questions: Question[];
  onAnswer: (q: Question, correct: boolean) => void; // grade + maybe lesson flash
  onFinish: (stats: { correct: number; wrong: number; bestCombo: number }) => void;
  title: string;
};

type Gate = {
  q: Question;
  x: number; // world px of the gate center
  correctLane: number;
  laneChoices: (string | null)[]; // per lane
  resolved: -1 | 0 | 1; // -1 pending, 0 wrong, 1 correct
};

const LANES = 3;
const GATE_SPACING = 560;
const SPEED = 150; // px/s

type GameLayout = {
  compact: boolean;
  laneTop: number;
  laneBottom: number;
  laneSpan: number;
  questionTop: number;
  questionHeight: number;
  signWidth: number;
  signHeight: number;
  playerX: number;
};

function getDecisionX(layout: GameLayout) {
  return layout.compact ? layout.playerX + layout.signWidth / 2 : layout.playerX;
}

function getPreviewX(width: number, layout: GameLayout) {
  return layout.compact ? width - layout.signWidth / 2 - 10 : width;
}

function getGateSpeed(width: number, layout: GameLayout) {
  if (!layout.compact) return SPEED;
  const runway = Math.max(1, getPreviewX(width, layout) - getDecisionX(layout));
  return Math.min(SPEED, runway / 3);
}

function getGateSpacing(width: number, layout: GameLayout) {
  return layout.compact ? getGateSpeed(width, layout) * 3 : GATE_SPACING;
}

function getGameLayout(width: number, height: number): GameLayout {
  const compact = width < 640 || height < 500;
  const landscape = width > height;

  if (!compact) {
    const laneTop = height * 0.24;
    const laneBottom = height * 0.86;
    return {
      compact,
      laneTop,
      laneBottom,
      laneSpan: laneBottom - laneTop,
      questionTop: height * 0.03,
      questionHeight: height * 0.16,
      signWidth: 190,
      signHeight: 52,
      playerX: width * 0.22,
    };
  }

  const questionTop = landscape ? 68 : height < 650 ? 76 : 90;
  const questionHeight = landscape ? 50 : 72;
  const laneTop = questionTop + questionHeight + (landscape ? 8 : 14);
  const laneBottom = Math.max(laneTop + 108, height - (landscape ? 38 : 62));
  const laneSpan = laneBottom - laneTop;
  const signWidth = Math.min(132, Math.max(116, width * 0.34), width - 24);
  const signHeight = Math.min(48, Math.max(36, laneSpan / LANES - 10));

  return {
    compact,
    laneTop,
    laneBottom,
    laneSpan,
    questionTop,
    questionHeight,
    signWidth,
    signHeight,
    playerX: Math.max(54, width * 0.2),
  };
}

export function RunnerGame({ questions, onAnswer, onFinish, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ hearts: 3, combo: 0, score: 0, left: questions.length });
  const [paused, setPaused] = useState(false);
  const stateRef = useRef({
    lane: 1,
    targetLane: 1,
    hearts: 3,
    combo: 0,
    bestCombo: 0,
    score: 0,
    dist: 0,
    qi: 0,
    gates: [] as Gate[],
    done: false,
    flash: 0, // red flash timer
    bump: 0, // correct answer glow
  });
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // external pause (lesson flash)
  useEffect(() => {
    (window as any).__kanjiDashPause = (p: boolean) => setPaused(p);
    return () => {
      delete (window as any).__kanjiDashPause;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;
    let raf = 0;
    let last = performance.now();
    let pixelRatio = window.devicePixelRatio || 1;
    let previousWidth = 0;
    let previousHeight = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const width = Math.max(1, r.width);
      const height = Math.max(1, r.height);

      // Preserve each gate's progress toward the player when a phone rotates.
      if (previousWidth > 0 && Math.abs(width - previousWidth) > 0.5 && s.gates.length) {
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

    const spawnGate = (qi: number, startX: number): Gate | null => {
      const q = questions[qi];
      if (!q) return null;
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      const laneChoices: (string | null)[] = [null, null, null];
      let correctLane = 0;
      order.forEach((lane, i) => {
        const choice = q.choices[i] ?? null;
        laneChoices[lane] = choice;
        if (choice === q.answer) correctLane = lane;
      });
      return { q, x: startX, correctLane, laneChoices, resolved: -1 };
    };

    s.gates = [];
    const initialLayout = getGameLayout(previousWidth, previousHeight);
    const initialSpacing = getGateSpacing(previousWidth, initialLayout);
    let nextX = initialLayout.compact
      ? getPreviewX(previousWidth, initialLayout)
      : 700;
    for (let i = 0; i < 3; i++) {
      const g = spawnGate(s.qi, nextX);
      if (g) s.gates.push(g);
      s.qi++;
      nextX += initialSpacing;
    }

    const moveLane = (dir: number) => {
      s.targetLane = Math.max(0, Math.min(LANES - 1, s.targetLane + dir));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setPaused((p) => !p); return; }
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); moveLane(-1); }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); moveLane(1); }
    };
    const onBlur = () => setPaused(true);
    const onVisibilityChange = () => {
      if (document.hidden) setPaused(true);
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

    const finish = () => {
      if (s.done) return;
      s.done = true;
      onFinish({ correct: s.score > 0 ? Math.round(s.score / 100) : 0, wrong: 3 - s.hearts + (s.hearts <= 0 ? 0 : 0), bestCombo: s.bestCombo });
    };

    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      const W = canvas.width / pixelRatio;
      const H = canvas.height / pixelRatio;
      const layout = getGameLayout(W, H);
      const gateSpeed = getGateSpeed(W, layout);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (!pausedRef.current && !s.done) {
        s.dist += SPEED * dt;
        s.lane += (s.targetLane - s.lane) * Math.min(1, dt * 14);
        s.flash = Math.max(0, s.flash - dt);
        s.bump = Math.max(0, s.bump - dt);

        // scroll gates
        for (const g of s.gates) g.x -= gateSpeed * dt;

        const decisionX = getDecisionX(layout);
        for (const g of s.gates) {
          if (g.resolved === -1 && g.x <= decisionX) {
            const lane = Math.round(s.lane);
            const correct = lane === g.correctLane;
            g.resolved = correct ? 1 : 0;
            if (correct) {
              s.combo += 1;
              s.bestCombo = Math.max(s.bestCombo, s.combo);
              s.score += 100 * Math.max(1, s.combo);
              s.bump = 0.5;
            } else {
              s.combo = 0;
              s.hearts -= 1;
              s.flash = 0.6;
            }
            onAnswer(g.q, correct);
            setHud({ hearts: s.hearts, combo: s.combo, score: s.score, left: questions.length - (s.qi - s.gates.filter((x) => x.resolved === -1).length) });
          }
        }

        // remove passed gates, spawn new
        s.gates = s.gates.filter((g) =>
          g.resolved === -1 || g.x > (layout.compact ? layout.playerX : -200),
        );
        const lastGateX = s.gates.length ? Math.max(...s.gates.map((g) => g.x)) : 300;
        while (s.qi < questions.length && s.gates.length < 3) {
          const g = spawnGate(s.qi, lastGateX + getGateSpacing(W, layout));
          if (g) s.gates.push(g);
          s.qi++;
          if (s.gates.length) break;
        }
        if (s.qi >= questions.length && s.gates.length === 0) finish();
        if (s.hearts <= 0) finish();
      }

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

      const drawQuestion = (g: Gate, x: number, y: number, width: number, height: number) => {
        ctx.fillStyle = "rgba(28,26,23,0.9)";
        roundRect(ctx, x - width / 2, y, width, height, 10);
        ctx.fill();
        ctx.fillStyle = "#f7f2e7";
        ctx.font = `800 ${Math.min(layout.compact ? 42 : 54, height * 0.58)}px "Shippori Mincho B1", serif`;
        ctx.fillText(g.q.prompt, x, y + height * 0.58);
        const helperFontSize = layout.compact
          ? Math.max(10, Math.min(12, height * 0.15))
          : Math.max(10, Math.min(13, height * 0.15));
        ctx.font = `700 ${helperFontSize}px "Zen Kaku Gothic New", sans-serif`;
        ctx.fillStyle = "#d8b24a";
        ctx.fillText(g.q.sub, x, y + height * 0.84);
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
          drawQuestion(g, bx, layout.questionTop, 140, layout.questionHeight);
        }

        // lane signposts
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
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className={i < hud.hearts ? "text-primary" : "text-border"}>♥</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <div className="rounded-lg border border-border bg-card/90 px-2 py-1.5 text-right shadow-sm backdrop-blur sm:px-3 sm:py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">Combo</div>
            <div className="font-serif text-base font-bold leading-tight text-accent sm:text-lg">×{Math.max(1, hud.combo)}</div>
          </div>
          <div className="rounded-lg border border-border bg-card/90 px-2 py-1.5 text-right shadow-sm backdrop-blur sm:px-3 sm:py-2">
            <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[10px]">Score</div>
            <div className="font-serif text-base font-bold leading-tight sm:text-lg">{hud.score.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
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
