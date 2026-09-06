import { expect, test } from "@playwright/test";
import { evaluateTrace } from "../../src/lib/stroke-math";

test("empty tracing never passes and exact tracing covers every pixel", () => {
  const target = new Uint8Array(100).fill(1, 21, 35);
  expect(evaluateTrace(target, new Uint8Array(100), 10, 10)).toMatchObject({ pct: 0, pass: false });
  expect(evaluateTrace(new Uint8Array(100), new Uint8Array(100), 10, 10)).toMatchObject({ pct: 0, pass: false });
  expect(evaluateTrace(target, target, 10, 10, 0)).toMatchObject({ pct: 100, pass: true, targetCount: 14, covered: 14, drawnCount: 14, stray: 0 });
});

test("coverage uses the exact 70% threshold, not rounded display percentage", () => {
  const target = new Uint8Array(200).fill(1);
  const drawn = new Uint8Array(200).fill(1, 0, 139);
  expect(evaluateTrace(target, drawn, 200, 1, 0)).toMatchObject({ pct: 70, pass: false, covered: 139 });
  drawn[139] = 1;
  expect(evaluateTrace(target, drawn, 200, 1, 0)).toMatchObject({ pct: 70, pass: true, covered: 140 });
});

test("45% stray ink fails while 40% passes", () => {
  const drawn = new Uint8Array(20).fill(1);
  expect(evaluateTrace(new Uint8Array(20).fill(1, 0, 11), drawn, 20, 1, 0)).toMatchObject({ pct: 100, stray: 9, pass: false });
  expect(evaluateTrace(new Uint8Array(20).fill(1, 0, 12), drawn, 20, 1, 0)).toMatchObject({ pct: 100, stray: 8, pass: true });
});

test("tolerance is symmetric and counts ink on odd rows and columns", () => {
  const target = new Uint8Array(100), drawn = new Uint8Array(100);
  target[11] = 1;
  drawn[22] = 1;
  expect(evaluateTrace(target, drawn, 10, 10, 1)).toMatchObject({ pct: 100, pass: true, targetCount: 1, drawnCount: 1, stray: 0 });
  expect(evaluateTrace(target, drawn, 10, 10, 0)).toMatchObject({ pct: 0, pass: false, stray: 1 });
});

test("painting the whole canvas does not pass a narrow guide", () => {
  const target = new Uint8Array(10000);
  for (let y = 0; y < 100; y++) target[y * 100 + 50] = 1;
  expect(evaluateTrace(target, new Uint8Array(10000).fill(1), 100, 100)).toMatchObject({ pct: 100, pass: false, stray: 7900 });
});

test("summed-area tolerance agrees with an independent pixel search", () => {
  for (const radius of [0, 1, 2, 10]) {
    const width = 7, height = 9;
    const target = Uint8Array.from({ length: width * height }, (_, i) => Number(i % 7 === 1 || i % 13 === 0));
    const drawn = Uint8Array.from({ length: width * height }, (_, i) => Number(i % 5 === 3));
    const near = (mask: Uint8Array, i: number) => [...mask].some((ink, j) => ink && Math.abs(i % width - j % width) <= radius && Math.abs(Math.floor(i / width) - Math.floor(j / width)) <= radius);
    const covered = [...target].filter((ink, i) => ink && near(drawn, i)).length;
    const stray = [...drawn].filter((ink, i) => ink && !near(target, i)).length;
    expect(evaluateTrace(target, drawn, width, height, radius)).toMatchObject({ covered, stray });
  }
});
