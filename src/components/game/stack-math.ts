import { seedStackTiles, shuffleStack, type StackTask, type StackTile, type StackWord } from "./stack-seed";
import { vocabKana } from "@/lib/words";

export type StackInput = { type: "column"; column: number } | { type: "move"; direction: -1 | 1 } | { type: "drop" } | { type: "hold" };
export type StackPlacement = { word: StackWord; correct: boolean; grade: boolean; rt: number; fallTime: number; hinted: boolean; column: number; row: number; redeemed: number; sideways: boolean };
export type StackStats = { correct: number; wrong: number; bestCombo: number; score: number; redeemed: number; chains: number; elapsed: number; cleared: boolean; wordsCleared: number; totalWords: number };
export type Falling = StackTask & { column: number; x: number; y: number; age: number; duration: number; lock: number; resets: number; moved: boolean; holdUsed: boolean; speed: number };
export type StackState = {
  cols: number; rows: number; words: StackWord[]; board: (StackTile | null)[][]; queue: StackTask[];
  current: Falling | null; hold: StackTask | null; phase: "fall" | "clear" | "gravity" | "ink" | "done";
  timer: number; elapsed: number; combo: number; score: number; correct: number; wrong: number; bestCombo: number;
  redeemed: number; chains: number; link: number; nextId: number; spawned: number; removed: number; created: number;
  clearIds: number[]; clearedWords: number[]; missedKanji: string[]; attempts: number[]; done: boolean; cleared: boolean;
  last: StackPlacement | null; feedback: string; feedbackId: number; tempo: number; forceFast: boolean;
  introducedOrder: number[]; marathon: boolean; riseIn: number;
};
const EPS = 1e-8;
export const LOCK_SECONDS = 0.3;
export const CLEAR_SECONDS = 0.35;
export const GRAVITY_SECONDS = 0.15;
export const INK_SECONDS = 1.2;

export function fallTime(mastery: number, rt = 0, tempo = 0): number {
  const base = mastery >= 3 ? 2.5 : mastery === 2 ? 4 : 6;
  // Slower measured recall can ease known cards, but new cards always get six seconds.
  const adapted = mastery >= 2 && rt > base * 800 ? Math.min(6, rt / 800) : base;
  return Math.max(1.6, adapted * Math.pow(0.95, tempo));
}

export function landingRow(s: StackState, column: number): number {
  const top = s.board.findIndex((row) => row[column] !== null);
  return top < 0 ? s.rows - 1 : top - 1;
}

function neighbors(s: StackState, row: number, col: number): StackTile[] {
  return [[row + 1, col], [row, col - 1], [row, col + 1]].flatMap(([r, c]) => {
    const tile = s.board[r!]?.[c!]; return tile ? [tile] : [];
  });
}

export function matches(a: Pick<StackTile, "word" | "kind">, b: Pick<StackTile, "word" | "kind">): boolean {
  return a.word === b.word && ((a.kind === "K" && (b.kind === "R" || b.kind === "M")) || (b.kind === "K" && (a.kind === "R" || a.kind === "M")));
}

export function legalColumns(s: StackState, task: StackTask = s.current!): number[] {
  if (!task) return [];
  return Array.from({ length: s.cols }, (_, col) => col).filter((col) => {
    const row = landingRow(s, col);
    return row >= 0 && (!s.current || task !== s.current || s.current.y <= row + EPS) && neighbors(s, row, col).some((tile) => tile.id === task.target && matches(task, tile));
  });
}

function gravity(s: StackState) {
  for (let c = 0; c < s.cols; c++) {
    const tiles = s.board.map((row) => row[c]).filter((tile): tile is StackTile => !!tile);
    for (let r = 0; r < s.rows; r++) s.board[r]![c] = tiles[r - (s.rows - tiles.length)] ?? null;
  }
}

/** No rescue is permitted while ANY queued or held retrieval is reachable. */
export function rescueIfBlocked(s: StackState): boolean {
  if ([...s.queue, ...(s.hold ? [s.hold] : []), ...(s.current ? [s.current] : [])].some((t) => legalColumns(s, t).length > 0)) return false;
  const oldest = s.board.flat().filter((t): t is StackTile => t?.kind === "G").sort((a, b) => a.born - b.born || a.id - b.id)[0];
  if (!oldest) return false;
  remove(s, new Set([oldest.id])); gravity(s);
  s.feedback = "Ink lifted · a path is open"; s.feedbackId++;
  return true;
}

function remove(s: StackState, ids: Set<number>) {
  for (const row of s.board) for (let c = 0; c < s.cols; c++) {
    if (row[c] && ids.has(row[c]!.id)) { row[c] = null; s.removed++; }
  }
}

function readableSeed(s: StackState): boolean {
  // A perfect path must exist before any garbage or rescue. Destructive only on a copy.
  const copy = { ...s, current: null, board: s.board.map((r) => [...r]), queue: [...s.queue] };
  for (let i = 0; i < s.queue.length; i++) {
    const task = copy.queue.find((t, i) => !copy.queue.slice(0, i).some((earlier) => earlier.word === t.word) && legalColumns(copy, t).length);
    if (!task) return false;
    const target = copy.board.flat().find((t) => t?.id === task.target)!;
    const ids = new Set([task.target]);
    if (target.kind === "R") copy.board.flat().forEach((t) => { if (t?.kind === "D" && t.word === task.word) ids.add(t.id); });
    remove(copy, ids); gravity(copy); copy.queue = copy.queue.filter((t) => t !== task);
  }
  return true;
}

export function createSheet(words: StackWord[], cols: number, rows: number, rng: () => number, options: { tempo?: number; forceFast?: boolean; marathon?: boolean } = {}): StackState {
  if (cols < 3 || rows < 5 || words.length > 7 || words.length * 3 > cols * (rows - 2)) throw new Error("Invalid stack sheet dimensions");
  const seed = seedStackTiles(words, rng);
  const s: StackState = {
    cols, rows, words, board: [], queue: seed.tasks, current: null, hold: null, phase: "fall", timer: 0,
    elapsed: 0, combo: 0, score: 0, correct: 0, wrong: 0, bestCombo: 0, redeemed: 0, chains: 0, link: 0,
    nextId: seed.tiles.length, spawned: 0, removed: 0, created: seed.tiles.length, clearIds: [], clearedWords: [], missedKanji: [], attempts: words.map(() => 0),
    done: false, cleared: false, last: null, feedback: "", feedbackId: 0, tempo: options.tempo ?? 0, forceFast: options.forceFast ?? false,
    // The last word studied needs two intervening pieces; reviews take precedence.
    introducedOrder: words.map((_, i) => i).reverse(), marathon: options.marathon ?? false, riseIn: 12,
  };
  if (!words.length) { s.done = true; s.cleared = true; s.phase = "done"; return s; }
  let accepted = false;
  for (let attempt = 0; attempt < 128; attempt++) {
    const tiles = attempt === 127 ? seed.tiles : shuffleStack(seed.tiles, rng);
    s.board = Array.from({ length: rows }, () => Array<StackTile | null>(cols).fill(null));
    tiles.forEach((tile, i) => { s.board[rows - 1 - Math.floor(i / cols)]![i % cols] = tile; });
    const touching = s.board.some((row, r) => row.some((tile, c) => tile && neighbors(s, r, c).some((other) => matches(tile, other))));
    if (!touching && readableSeed(s)) { accepted = true; break; }
  }
  if (!accepted) throw new Error("Unable to compose a reachable sheet");
  spawn(s, rng);
  return s;
}

function spawn(s: StackState, rng: () => number, replacement?: StackTask, holdUsed = false) {
  while (rescueIfBlocked(s)) { /* only grey tiles can move here */ }
  let task = replacement;
  if (!task) {
    const reachable = s.queue.filter((t) => legalColumns(s, t).length);
    // Preserve the learning direction when possible, but a queued retry must be
    // able to uncover the target of its other direction after a miss.
    const ordered = reachable.filter((t) => !s.queue.slice(0, s.queue.indexOf(t)).some((earlier) => earlier.word === t.word));
    const freshDelay = (t: StackTask) => s.words[t.word]!.fresh && s.spawned < Math.max(0, 2 - (s.words.length - 1 - t.word));
    task = ordered.find((t) => !freshDelay(t)) ?? ordered[0] ?? reachable[0] ?? s.queue[0];
    if (task) s.queue.splice(s.queue.indexOf(task), 1);
    else if (s.hold) { task = s.hold; s.hold = null; }
  }
  if (!task) {
    s.done = true; s.cleared = true; s.phase = "done";
    s.score += 500 + (s.wrong === 0 ? 300 : 0); return;
  }
  const w = s.words[task.word]!;
  const wins = legalColumns(s, task);
  const columns = Array.from({ length: s.cols }, (_, i) => i);
  const neutral = columns.filter((c) => !wins.includes(c) && landingRow(s, c) >= 0);
  const choices = neutral.length ? neutral : columns;
  const column = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))]!;
  if (landingRow(s, column) < 0) { s.done = true; s.phase = "done"; return; }
  const duration = fallTime(s.forceFast ? 3 : w.mastery, w.rt, s.tempo);
  s.current = { ...task, column, x: column, y: 0, age: 0, duration, speed: Math.max(1, landingRow(s, column)) / duration, lock: 0, resets: 0, moved: false, holdUsed: holdUsed || !!task.held };
  s.spawned++; s.phase = "fall";
}

function rescan(s: StackState) {
  const ids = new Set<number>();
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
    const tile = s.board[r]![c];
    if (tile) for (const other of neighbors(s, r, c)) if (matches(tile, other)) { ids.add(tile.id); ids.add(other.id); }
  }
  if (!ids.size) return false;
  s.link++; if (s.link > 1) { s.chains++; s.score += Math.round(100 * Math.pow(1.5, s.link - 1)) + (s.link === 2 && s.last?.redeemed ? 200 : 0); s.feedback = `${s.link} 連鎖`; s.feedbackId++; }
  s.clearIds = [...ids]; s.phase = "clear"; s.timer = CLEAR_SECONDS;
  return true;
}

function resolveClear(s: StackState) {
  const ids = new Set(s.clearIds), tiles = s.board.flat().filter((t): t is StackTile => !!t && ids.has(t.id));
  const words = [...new Set(tiles.map((t) => t.word))];
  for (const word of words) {
    if (tiles.some((t) => t.word === word && t.kind === "R")) s.board.flat().forEach((t) => { if (t?.word === word && t.kind === "D") ids.add(t.id); });
  }
  const born: { row: number; col: number; word: number }[] = [];
  for (const word of words) {
    const passive = !s.clearedWords.includes(word) && tiles.some((t) => t.word === word && t.kind === "K");
    if (passive) {
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if (s.board[r]![c]?.word === word && s.board[r]![c]?.kind === "K") born.push({ row: r, col: c, word });
    }
  }
  s.queue = s.queue.filter((t) => !ids.has(t.target));
  if (s.hold && ids.has(s.hold.target)) s.hold = null;
  remove(s, ids);
  for (const b of born) {
    const id = s.nextId++;
    s.board[b.row]![b.col] = { id, word: b.word, kind: "M", text: s.words[b.word]!.q.vocab.m, born: s.elapsed }; s.created++;
    s.queue.push({ word: b.word, kind: "K", target: id, attempt: 0, hinted: false });
  }
  s.clearIds = [];
  s.phase = "gravity"; s.timer = GRAVITY_SECONDS;
}

function lock(s: StackState, onPlacement: (event: StackPlacement) => void) {
  const p = s.current!;
  const row = landingRow(s, p.column);
  if (row < 0) { s.current = null; s.done = true; s.phase = "done"; return; }
  const target = neighbors(s, row, p.column).find((tile) => tile.id === p.target && matches(p, tile));
  const correct = !!target;
  const word = s.words[p.word]!;
  const sideways = !!target && s.board[row + 1]?.[p.column]?.id !== target.id;
  const washes = correct ? s.board.flat().filter((t): t is StackTile => t?.kind === "G" && t.word === p.word) : [];
  const grade = correct || !s.missedKanji.includes(word.q.kanji.c);
  const event: StackPlacement = { word, correct, grade, rt: Math.round(p.age * 1000), fallTime: p.duration, hinted: p.hinted || (word.fresh && p.age < 1.5), column: p.column, row, redeemed: washes.length, sideways };
  const tile: StackTile = { id: s.nextId++, word: p.word, kind: correct ? p.kind : "G", text: p.kind === "K" ? word.q.vocab.w : p.kind === "R" ? vocabKana(word.q.vocab) : word.q.vocab.m, born: s.elapsed };
  s.board[row]![p.column] = tile; s.created++;
  s.current = null; s.last = event; s.feedbackId++;
  if (correct) {
    s.correct++; s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.score += 100 * s.combo + (sideways ? 50 : 0) + washes.length * 50;
    s.redeemed += washes.length;
    if (!s.clearedWords.includes(p.word)) s.clearedWords.push(p.word);
    remove(s, new Set(washes.map((t) => t.id)));
    s.feedback = washes.length ? `洗 · ${washes.length} washed` : sideways ? "妙手 · side match" : "正解 · correct";
    s.link = 0;
    rescan(s);
  } else {
    s.wrong++; s.combo = 0;
    if (grade) s.missedKanji.push(word.q.kanji.c);
    s.attempts[p.word] = (s.attempts[p.word] ?? 0) + 1;
    // Two other spawns, then retrieval with a fading correction hint.
    s.queue.splice(Math.min(2, s.queue.length), 0, { word: p.word, kind: p.kind, target: p.target, attempt: p.attempt + 1, hinted: true });
    s.feedback = `${word.q.vocab.w} · ${vocabKana(word.q.vocab)} · ${word.q.vocab.m}`;
    s.phase = "ink"; s.timer = INK_SECONDS;
  }
  onPlacement(event);
  if (row === 0) { s.done = true; s.cleared = false; s.phase = "done"; }
}

function input(s: StackState, action: StackInput, onPlacement: (event: StackPlacement) => void, rng: () => number) {
  const p = s.current;
  if (!p || s.phase !== "fall" || s.done) return;
  if (action.type === "hold") {
    if (p.holdUsed) return;
    const previous = s.hold;
    s.hold = { word: p.word, kind: p.kind, target: p.target, attempt: p.attempt, hinted: p.hinted, held: true };
    s.current = null;
    spawn(s, rng, previous ?? undefined, true); return;
  }
  if (action.type === "drop") { lock(s, onPlacement); return; }
  const col = action.type === "move" ? p.column + action.direction : action.column;
  if (col < 0 || col >= s.cols || !Number.isInteger(col)) return;
  if (action.type === "column" && col === p.column && p.moved) { lock(s, onPlacement); return; }
  if (p.y > landingRow(s, col) + EPS) return;
  if (col !== p.column && p.lock > 0 && p.resets < 3) { p.lock = 0; p.resets++; }
  p.column = col; p.moved = true;
}

function rise(s: StackState) {
  if (s.board[0]!.some(Boolean)) { s.done = true; s.phase = "done"; return; }
  s.board.shift();
  const bottom = Array.from({ length: s.cols }, (_, c): StackTile => {
    const word = c % s.words.length;
    return { id: s.nextId++, word, kind: "G", text: s.words[word]!.q.vocab.w, born: s.elapsed };
  });
  s.board.push(bottom); s.created += s.cols;
  if (s.current) s.current.y = Math.max(0, Math.min(s.current.y, landingRow(s, s.current.column)));
  s.riseIn = 12;
}

/** Event-sized steps: one fake-clock frame and 600 real frames give identical outcomes. */
export function advanceStack(s: StackState, elapsedSeconds: number, inputs: readonly StackInput[], onPlacement: (event: StackPlacement) => void, rng: () => number): void {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || s.done) return;
  inputs.forEach((action) => input(s, action, onPlacement, rng));
  let left = elapsedSeconds;
  while (!s.done && left > EPS) {
    if (s.phase !== "fall") {
      const dt = Math.min(left, s.timer);
      s.timer -= dt; left -= dt; s.elapsed += dt;
      if (s.timer <= EPS) {
        if (s.phase === "clear") resolveClear(s);
        else if (s.phase === "gravity") {
          gravity(s);
          if (!rescan(s)) spawn(s, rng);
        } else { gravity(s); spawn(s, rng); }
      }
      continue;
    }
    const p = s.current;
    if (!p) { spawn(s, rng); continue; }
    const row = landingRow(s, p.column);
    const touching = p.y >= row - EPS;
    const eventIn = touching ? Math.max(0, LOCK_SECONDS - p.lock) : (row - p.y) / p.speed;
    const dt = Math.min(left, eventIn, s.marathon ? s.riseIn : Infinity);
    s.elapsed += dt; left -= dt; p.age += dt;
    p.x = p.column + (p.x - p.column) * Math.exp(-18 * dt);
    if (touching) p.lock += dt;
    else p.y = Math.min(row, p.y + p.speed * dt);
    if (s.marathon) { s.riseIn -= dt; if (s.riseIn <= EPS) rise(s); }
    if (!s.done && touching && p.lock >= LOCK_SECONDS - EPS) lock(s, onPlacement);
  }
}

export function stackStats(s: StackState): StackStats {
  return { correct: s.correct, wrong: s.wrong, score: s.score, bestCombo: s.bestCombo, redeemed: s.redeemed, chains: s.chains, elapsed: s.elapsed, cleared: s.cleared, wordsCleared: s.clearedWords.length, totalWords: s.words.length };
}
