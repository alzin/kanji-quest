import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { Kanji } from "@/data/n5/types";

const SIZE = 320;

// Trace-over practice: draw strokes on top of a faint guide glyph.
// "Check" measures how much of the glyph's ink you covered.
export function StrokePractice({ kanji }: { kanji: Kanji }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const instructionsId = useId();
  const [strokes, setStrokes] = useState(0);
  const [result, setResult] = useState<null | { pct: number; pass: boolean }>(null);

  useEffect(() => {
    reset();
    let cancelled = false;
    const drawGuide = () => {
      if (cancelled) return;
      const ctx = guideRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.font = `800 ${SIZE * 0.72}px "Shippori Mincho B1", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#29251e";
      ctx.fillText(kanji.c, SIZE / 2, SIZE / 2 + SIZE * 0.03);
    };
    drawGuide();
    // The visible guide and coverage mask must use the same loaded font.
    void document.fonts.ready.then(drawGuide);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanji.c]);

  const reset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointer.current !== null && canvas.hasPointerCapture(activePointer.current)) {
      canvas.releasePointerCapture(activePointer.current);
    }
    activePointer.current = null;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    setStrokes(0);
    setResult(null);
  };

  // sample the guide glyph's target pixels
  const targetPixels = (): Uint8Array => {
    const data = guideRef.current!.getContext("2d")!.getImageData(0, 0, SIZE, SIZE).data;
    const mask = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) mask[i] = (data[i * 4 + 3] ?? 0) > 100 ? 1 : 0;
    return mask;
  };

  const check = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const drawn = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const target = targetPixels();
    let targetCount = 0;
    let covered = 0;
    let stray = 0;
    let drawnCount = 0;
    const R = 10; // tolerance radius (coarse grid)
    for (let y = 0; y < SIZE; y += 2) {
      for (let x = 0; x < SIZE; x += 2) {
        const ti = y * SIZE + x;
        if (!target[ti]) continue;
        targetCount++;
        let hit = false;
        for (let dy = -R; dy <= R && !hit; dy += 2) {
          for (let dx = -R; dx <= R && !hit; dx += 2) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
            if ((drawn[(ny * SIZE + nx) * 4 + 3] ?? 0) > 60) hit = true;
          }
        }
        if (hit) covered++;
      }
    }
    for (let i = 0; i < SIZE * SIZE; i += 4) {
      if ((drawn[i * 4 + 3] ?? 0) > 60) {
        drawnCount++;
        if (!target[i]) stray++;
      }
    }
    const pct = targetCount ? Math.round((covered / targetCount) * 100) : 0;
    const strayRatio = drawnCount ? stray / drawnCount : 1;
    setResult({ pct, pass: pct >= 70 && strayRatio < 0.45 });
  };

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  };

  const endStroke = (e: PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="min-w-0">
      {/* Reserve phone viewport space for the header, touch controls, and bottom tabs. */}
      <div className="relative mx-auto w-full max-w-[clamp(204px,calc(100svh_-_450px_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px)),320px)] overflow-hidden rounded-xl border-2 border-border bg-paper shadow-inner md:max-w-[320px]">
        <canvas
          ref={guideRef}
          width={SIZE}
          height={SIZE}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block aspect-square w-full opacity-20"
        />
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          aria-label={`Trace ${kanji.c}`}
          aria-describedby={instructionsId}
          className="relative z-10 block aspect-square w-full touch-none select-none"
          onPointerDown={(e) => {
            if (activePointer.current !== null || e.button !== 0) return;
            e.preventDefault();
            activePointer.current = e.pointerId;
            canvasRef.current!.setPointerCapture(e.pointerId);
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = pos(e);
            ctx.strokeStyle = "#b03a2e";
            ctx.fillStyle = "#b03a2e";
            ctx.lineWidth = 14;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            // A short finger tap should leave ink as well as count as a stroke.
            ctx.beginPath();
            ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            setStrokes((s) => s + 1);
            setResult(null);
          }}
          onPointerMove={(e) => {
            if (activePointer.current !== e.pointerId) return;
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
        />
      </div>
      <div className="mt-2 text-sm sm:mt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-muted-foreground">
            Your strokes: <b className="tabular-nums text-foreground">{strokes}</b>
          </span>
          <span className="text-muted-foreground">Guide: {kanji.strokes} {kanji.strokes === 1 ? "stroke" : "strokes"}</span>
        </div>
        <p
          id={instructionsId}
          role={result ? "status" : undefined}
          className={`mt-1 flex min-h-10 items-center text-xs leading-5 ${result ? `font-bold ${result.pass ? "text-[#2e5238]" : "text-primary"}` : "text-muted-foreground"}`}
        >
          {result
            ? result.pass
              ? `Stamped! ${result.pct}% coverage. Beautiful brushwork.`
              : `${result.pct}% coverage. Trace more of the guide and stay on the lines.`
            : "Swipe outside the square to scroll."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
          <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-border px-4 py-2.5 font-bold transition-colors hover:bg-secondary active:bg-secondary">
            Clear
          </button>
          <button type="button" onClick={check} disabled={strokes === 0} className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">
            Check
          </button>
        </div>
      </div>
    </div>
  );
}
