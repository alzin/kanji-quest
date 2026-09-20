import { test, expect } from "@playwright/test";
import { allKanji } from "../../src/data";
import { buildQuestion, buildStackQueue, getCard, normalizeSave } from "../../src/lib/srs";
import { correctReadings, vocabKana } from "../../src/lib/words";
import { advanceStack, createSheet, legalColumns, matches, rescueIfBlocked, type StackState } from "../../src/components/game/stack-math";
import { composeSheets, seededRandom, stackDecoy, type StackWord } from "../../src/components/game/stack-seed";

const words = (offset = 0): StackWord[] => allKanji.slice(offset, offset + 6).map((k) => ({ q: buildQuestion(k, "reading", k.vocab[0]!), mastery: 1, rt: 0, fresh: false }));
function conservation(s: StackState) { expect(s.board.flat().filter(Boolean).length + s.removed).toBe(s.created); }

test("seeded sheets have a perfect legal path, conserve tiles, and finish", () => {
  for (let seed = 1; seed <= 150; seed++) {
    const rng = seededRandom(seed);
    const s = createSheet(words(seed % 270), seed % 2 ? 5 : 6, seed % 2 ? 8 : 10, rng);
    let placements = 0;
    for (let i = 0; !s.done && i < 50; i++) {
      expect(s.current).not.toBeNull();
      const col = legalColumns(s)[0]; expect(col, `seed ${seed}, placement ${i}`).toBeDefined();
      advanceStack(s, 0, [{ type: "column", column: col! }, { type: "drop" }], (e) => { expect(e.correct).toBe(true); placements++; }, rng);
      conservation(s);
      advanceStack(s, 0.5, [], () => {}, rng);
      while (!s.done && !s.current) advanceStack(s, 0.5, [], () => {}, rng);
      conservation(s);
    }
    expect(s.cleared, `seed ${seed}`).toBe(true);
    expect(placements).toBeGreaterThanOrEqual(s.words.length);
    expect(s.wrong).toBe(0);
  }
});

test("elapsed time splitting is deterministic even through ink, clears and top-out", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const ra = seededRandom(seed), rb = seededRandom(seed);
    const data = words();
    const a = createSheet(data, 5, 8, ra), b = createSheet(data, 5, 8, rb);
    const ea: unknown[] = [], eb: unknown[] = [];
    advanceStack(a, 80, [], (e) => ea.push(e), ra);
    for (let i = 0; i < 4800; i++) advanceStack(b, 1 / 60, [], (e) => eb.push(e), rb);
    expect(ea).toEqual(eb);
    expect(a.board).toEqual(b.board.map((row) => row.map((t) => t ? { ...t, born: a.board.flat().find((x) => x?.id === t.id)?.born ?? t.born } : null)));
    expect(a.done).toBe(b.done); expect(a.score).toBe(b.score); expect(a.elapsed).toBeCloseTo(b.elapsed, 6);
  }
});

test("a miss cannot force an unreachable direction while another queued retrieval is legal", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = seededRandom(seed);
    const data = words(seed % 270).map((w) => ({ ...w, mastery: seed % 2 ? 2 : 3 }));
    const s = createSheet(data, 5, 8, rng, { forceFast: true });
    advanceStack(s, 1.2, [{ type: "drop" }], (e) => expect(e.correct).toBe(false), rng);
    for (let i = 0; !s.done && i < 60; i++) {
      if (!s.current) { advanceStack(s, 0.5, [], () => {}, rng); continue; }
      const col = legalColumns(s)[0];
      expect(col, `seed ${seed}, placement ${i}`).toBeDefined();
      advanceStack(s, 0.5, [{ type: "column", column: col! }, { type: "drop" }], (e) => expect(e.correct).toBe(true), rng);
      conservation(s);
    }
    expect(s.cleared).toBe(true); expect(s.wrong).toBe(1);
  }
});

test("rescue never dissolves ink when a queued or held legal move exists", () => {
  for (let seed = 0; seed < 80; seed++) {
    const rng = seededRandom(seed); const s = createSheet(words(), 5, 8, rng);
    const before = JSON.stringify(s.board);
    expect(rescueIfBlocked(s)).toBe(false); expect(JSON.stringify(s.board)).toBe(before);
    const task = s.current!; s.queue = []; s.hold = task; s.current = null;
    expect(rescueIfBlocked(s)).toBe(false);
  }
});

test("hold never grades and cannot be used twice on a piece", () => {
  const rng = seededRandom(31), s = createSheet(words(), 5, 8, rng);
  let count = 0; const onPlacement = () => count++;
  advanceStack(s, 0, [{ type: "hold" }], onPlacement, rng);
  const first = s.current?.target, held = s.hold?.target;
  advanceStack(s, 0, [{ type: "hold" }], onPlacement, rng);
  expect(s.current?.target).toBe(first); expect(s.hold?.target).toBe(held); expect(count).toBe(0);
});

test("reading and meaning never match without the written form", () => {
  expect(matches({ word: 1, kind: "R" }, { word: 1, kind: "M" })).toBe(false);
  expect(matches({ word: 1, kind: "K" }, { word: 1, kind: "R" })).toBe(true);
  expect(matches({ word: 1, kind: "K" }, { word: 2, kind: "R" })).toBe(false);
});

test("every curriculum word has a decoy safe against all possible partners", () => {
  test.setTimeout(120_000);
  const cards = allKanji.flatMap((k) => k.vocab.map((v) => buildQuestion(k, "reading", v)));
  // A board-level forbidden union is supplied to the same composer for every partner.
  const sets = cards.map((q) => new Set([...correctReadings(q.vocab.w), vocabKana(q.vocab)]));
  for (let i = 0; i < cards.length; i++) {
    const q = cards[i]!;
    const candidate = stackDecoy(q, sets[i]!, seededRandom(42));
    for (let j = 0; j < cards.length; j++) {
      const forbidden = new Set([...sets[i]!, ...sets[j]!]);
      const decoy = forbidden.has(candidate) ? stackDecoy(q, forbidden, seededRandom(42)) : candidate;
      if (forbidden.has(decoy)) throw new Error(`Unsafe decoy: ${q.vocab.w} / ${cards[j]!.vocab.w} / ${decoy}`);
    }
  }
});

test("daily queue caps reviews/new cards and keeps sheet readings disjoint", () => {
  const s = normalizeSave({});
  expect(buildStackQueue(s)).toHaveLength(4);
  for (const k of allKanji) s.progress[k.c] = { ...getCard(s, k.c), mastery: 2, due: 0 };
  const queue = buildStackQueue(s);
  expect(queue).toHaveLength(12);
  const sheets = composeSheets(queue.map((q) => ({ q, mastery: 2, fresh: false, rt: 0 })));
  for (const sheet of sheets) {
    expect(sheet.length).toBeLessThanOrEqual(7);
    const readings = new Set<string>();
    for (const word of sheet) for (const r of correctReadings(word.q.vocab.w)) { expect(readings.has(r)).toBe(false); readings.add(r); }
  }
});

test("constant random input is safe and idle play cannot clear a sheet", () => {
  for (let n = 1; n <= 7; n++) {
    const data = [...words(), ...words(8)].slice(0, n);
    const s = createSheet(data, 5, 8, () => 0.999);
    expect(legalColumns(s)).not.toContain(s.current!.column);
    advanceStack(s, 1000, [], () => {}, () => 0.999);
    expect(s.done).toBe(true); expect(s.cleared).toBe(false); expect(s.correct).toBe(0);
  }
});

test("passive matches create a meaning target instead of silently grading another word", () => {
  const rng = seededRandom(19), s = createSheet(words().slice(0, 2), 5, 8, rng);
  s.board = Array.from({ length: 8 }, () => Array(5).fill(null));
  s.queue = [{ word: 1, kind: "K", target: 10, attempt: 0, hinted: false }];
  s.board[7]![0] = { id: 10, word: 1, kind: "R", text: "ふたつ", born: 0 };
  s.board[6]![0] = { id: 11, word: 1, kind: "K", text: "二つ", born: 0 };
  s.board[7]![4] = { id: 12, word: 0, kind: "R", text: "ひとつ", born: 0 };
  s.nextId = 13;
  s.current = { ...s.current!, word: 0, kind: "K", target: 12, column: 4, y: 0 };
  const graded: number[] = [];
  advanceStack(s, 0.5, [{ type: "drop" }], (e) => { graded.push(s.words.indexOf(e.word)); }, rng);
  expect(graded).toEqual([0]);
  expect(s.board.flat().some((t) => t?.word === 1 && t.kind === "M")).toBe(true);
  expect(s.current?.word).toBe(1); expect(s.current?.kind).toBe("K");
  const col = legalColumns(s)[0]!;
  advanceStack(s, 0.5, [{ type: "column", column: col }, { type: "drop" }], (e) => graded.push(s.words.indexOf(e.word)), rng);
  expect(graded).toEqual([0, 1]); expect(s.cleared).toBe(true);
});

test("only the oldest grey tile dissolves when every task is blocked", () => {
  const rng = seededRandom(12), s = createSheet(words().slice(0, 1), 5, 8, rng);
  s.board = Array.from({ length: 8 }, () => Array(5).fill(null)); s.current = null; s.hold = null;
  s.queue = [{ word: 0, kind: "K", target: 1, attempt: 1, hinted: true }];
  s.board[7]![2] = { id: 1, word: 0, kind: "R", text: "ひとつ", born: 0 };
  for (let c = 0; c < 5; c++) {
    s.board[6]![c] = { id: c + 2, word: 0, kind: "G", text: "一つ", born: c + 1 };
    if (c !== 2) s.board[7]![c] = { id: c + 20, word: 0, kind: "G", text: "一つ", born: c + 10 };
  }
  expect(rescueIfBlocked(s)).toBe(true);
  expect(s.board.flat().some((t) => t?.id === 2)).toBe(false);
  expect(s.board.flat().some((t) => t?.id === 3)).toBe(true);
});
