import { useEffect, useRef, useState } from "react";
import type { Kanji } from "@/data/n5/types";

const SIZE = 320;

// Trace-over practice: draw strokes on top of a faint guide glyph.
// "Check" measures how much of the glyph's ink you covered.
export function StrokePractice({ kanji }: { kanji: Kanji }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [strokes, setStrokes] = useState(0);
  const [result, setResult] = useState<null | { pct: number; pass: boolean }>(null);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanji.c]);

  const reset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    setStrokes(0);
    setResult(null);
  };

  // sample the guide glyph's target pixels
  const targetPixels = (): Uint8Array => {
    const off = document.createElement("canvas");
    off.width = off.height = SIZE;
    const octx = off.getContext("2d")!;
    octx.font = `800 ${SIZE * 0.72}px "Shippori Mincho B1", serif`;
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillStyle = "#000";
    octx.fillText(kanji.c, SIZE / 2, SIZE / 2 + SIZE * 0.03);
    const data = octx.getImageData(0, 0, SIZE, SIZE).data;
    const mask = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) mask[i] = data[i * 4 + 3] > 100 ? 1 : 0;
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
            if (drawn[(ny * SIZE + nx) * 4 + 3] > 60) hit = true;
          }
        }
        if (hit) covered++;
      }
    }
    for (let i = 0; i < SIZE * SIZE; i += 4) {
      if (drawn[i * 4 + 3] > 60) {
        drawnCount++;
        if (!target[i]) stray++;
      }
    }
    const pct = targetCount ? Math.round((covered / targetCount) * 100) : 0;
    const strayRatio = drawnCount ? stray / drawnCount : 1;
    setResult({ pct, pass: pct >= 70 && strayRatio < 0.45 });
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  };

  return (
    <div>
      <div className="relative mx-auto w-full max-w-[320px]">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className="relative z-10 aspect-square w-full touch-none rounded-xl border-2 border-border bg-card/40 shadow-inner"
          onPointerDown={(e) => {
            drawing.current = true;
            canvasRef.current!.setPointerCapture(e.pointerId);
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = pos(e);
            ctx.strokeStyle = "#b03a2e";
            ctx.lineWidth = 14;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            setStrokes((s) => s + 1);
            setResult(null);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }}
          onPointerUp={() => (drawing.current = false)}
        />
        {/* guide glyph */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-serif text-[240px] font-bold leading-none text-foreground/15 select-none"
        >
          {kanji.c}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Your strokes: <b className="text-foreground">{strokes}</b> / {kanji.strokes}
        </span>
        <div className="flex gap-2">
          <button onClick={reset} className="rounded-md border border-border px-3 py-1.5 font-bold transition-colors hover:bg-secondary">
            Clear
          </button>
          <button onClick={check} className="rounded-md bg-primary px-3 py-1.5 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
            Check
          </button>
        </div>
      </div>
      {result && (
        <div className={`mt-3 rounded-lg p-3 text-sm font-bold ${result.pass ? "bg-[#4a7c59]/15 text-[#2e5238]" : "bg-primary/10 text-primary"}`}>
          {result.pass
            ? `Stamped! ${result.pct}% coverage — beautiful brushwork.`
            : `${result.pct}% coverage — trace more of the guide, stay on the lines.`}
        </div>
      )}
    </div>
  );
}
