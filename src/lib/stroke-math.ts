export type TraceResult = {
  pct: number;
  pass: boolean;
  targetCount: number;
  covered: number;
  drawnCount: number;
  stray: number;
};

// Count every pixel. A summed-area table gives the same square tolerance for
// covering guide ink and detecting stray ink without subsampling either mask.
function nearbyInk(mask: Uint8Array, width: number, height: number, radius: number) {
  const stride = width + 1;
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x] ? 1 : 0;
      sums[(y + 1) * stride + x + 1] = row + sums[y * stride + x + 1]!;
    }
  }
  return (x: number, y: number) => {
    const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
    return sums[y1 * stride + x1]! - sums[y0 * stride + x1]!
      - sums[y1 * stride + x0]! + sums[y0 * stride + x0]! > 0;
  };
}

export function evaluateTrace(target: Uint8Array, drawn: Uint8Array, width: number, height: number, radius = 10): TraceResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || target.length !== width * height || drawn.length !== target.length
    || !Number.isInteger(radius) || radius < 0) throw new RangeError("Invalid tracing mask dimensions or tolerance");
  const nearTarget = nearbyInk(target, width, height, radius);
  const nearDrawn = nearbyInk(drawn, width, height, radius);
  let targetCount = 0, covered = 0, drawnCount = 0, stray = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (target[index]) {
        targetCount++;
        if (nearDrawn(x, y)) covered++;
      }
      if (drawn[index]) {
        drawnCount++;
        if (!nearTarget(x, y)) stray++;
      }
    }
  }
  return {
    pct: targetCount ? Math.round(covered * 100 / targetCount) : 0,
    pass: targetCount > 0 && drawnCount > 0 && covered * 100 >= targetCount * 70 && stray * 100 < drawnCount * 45,
    targetCount, covered, drawnCount, stray,
  };
}
