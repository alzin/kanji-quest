import { SPIRITS, TRAILS, gateTimesOf, type GateMode, type RunnerDifficulty, type SpiritId, type TrailId } from "../../../lib/firefly-catalog";
import { HAZARD_PATTERNS } from "./patterns";
export { HAZARD_PATTERNS } from "./patterns";

/** Arrival times and all gameplay timers use active traversal time. */
export const FIXED_STEP = 1 / 120;
export const EVENT_WARNING_SECONDS = 2.6;
export const STAGE_SECONDS = 30;
export const LANE_CHANGE_SECONDS = 0.15;
/** Traversal seconds between a gate's lantern call appearing and the gate reaching the player. */
export const GATE_SIGHT: Record<RunnerDifficulty, number> = { standard: 3.4, relaxed: 3.6 };
/** Thorns never share the moments around a word decision. */
export const GATE_CLEARANCE = 0.8;
/** Travel speed while a new word's introduction is in sight. */
export const INTRO_SLOW = 0.6;
/**
 * Travel speed climbs steadily from the first gate to the shrine, and a run of
 * correct answers lifts it further. A miss lets the lift ease away again.
 */
export const PACE: Record<RunnerDifficulty, { start: number; end: number; streak: number }> = {
  standard: { start: 1.1, end: 1.35, streak: 0.1 },
  relaxed: { start: 0.8, end: 0.95, streak: 0.04 },
};
/** Per-second rate at which the pace eases toward its target (about two thirds of the way in 0.7 s). */
const PACE_EASE_RATE = 1.5;
const EPSILON = 1e-8;

export type { GateMode };
/** The words on one gate row. An introduction carries the same word in every lane. */
export type GateContent = { labels: [string, string, string]; answer: 0 | 1 | 2; card: string; word: string; mode: GateMode; slow: boolean };
export type GateResult = { id: number; gate: number; lane: number; correct: boolean; card: string; word: string; mode: GateMode; /** A Burst charge was earned. */ charged: boolean };
export type FireflyEntity = {
  id: number;
  kind: "hazard" | "firefly" | "cage" | "gate";
  lane: number;
  /** Total active traversal seconds at which this entity reaches the player. */
  time: number;
  resolved: boolean;
  spirit?: SpiritId;
  /** Adventure-wide order of a word gate. */
  gate?: number;
  content?: GateContent;
  /** The lane the player held when a gate arrived. */
  chosen?: number;
};
export type FireflyCue = {
  serial: number;
  kind: "firefly" | "rescue" | "hit" | "shield" | "burst" | "gate" | "miss" | "fork" | "delivery" | "lost";
  spirit?: SpiritId;
};
export type FireflyState = {
  phase: "running" | "fork" | "delivery" | "lost";
  stage: 0 | 1 | 2;
  elapsed: number;
  stageTime: number;
  lane: number;
  playerLane: number;
  hearts: number;
  maxHearts: number;
  charges: number;
  maxCharges: number;
  burstRemaining: number;
  immunityRemaining: number;
  recharge: number;
  chain: number;
  score: number;
  fireflies: number;
  rescued: SpiritId[];
  shield: boolean;
  magnet: boolean;
  burstDuration: number;
  trails: TrailId[];
  events: FireflyEntity[];
  lastEvent?: FireflyCue;
  difficulty: RunnerDifficulty;
  collected: SpiritId[];
  /** Traversal seconds of warning before each gate. */
  sight: number;
  /** A sighted gate waiting for its words. Traversal stops until it is assigned. */
  awaitingGate: number | null;
  /** Resolved gates not yet taken by the learning interface. */
  gateResults: GateResult[];
  gatesResolved: number;
  gatesCorrect: number;
  /** Consecutive correct word answers; every third grants a Burst charge. */
  gateStreak: number;
  /** Current travel speed multiplier; it eases toward {@link targetPace}. */
  pace: number;
  /** Serializable simulation bookkeeping; the renderer must not change it. */
  seed: number;
  accumulator: number;
  nextGate: number;
  nextEntityId: number;
  cueSerial: number;
};
export type FireflyResult = { score: number; rescued: SpiritId[]; delivered: boolean };

export const multiplierOf = (chain: number): number => Math.min(4, 1 + Math.floor(chain / 10));

export function targetPace(s: Pick<FireflyState, "difficulty" | "elapsed" | "gateStreak">): number {
  const pace = PACE[s.difficulty];
  const progress = Math.min(1, s.elapsed / (3 * STAGE_SECONDS));
  return pace.start + (pace.end - pace.start) * progress + pace.streak * Math.min(1, s.gateStreak / 6);
}

function random(s: FireflyState): number {
  s.seed = (s.seed + 0x6d2b79f5) >>> 0;
  let n = s.seed;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function shuffled<T>(s: FireflyState, values: readonly T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function cue(s: FireflyState, kind: FireflyCue["kind"], spirit?: SpiritId): void {
  s.lastEvent = { serial: ++s.cueSerial, kind, ...(spirit ? { spirit } : {}) };
}

function addEvent(s: FireflyState, kind: FireflyEntity["kind"], lane: number, time: number, spirit?: SpiritId, gate?: number): void {
  s.events.push({ id: s.nextEntityId++, kind, lane, time, resolved: false, ...(spirit ? { spirit } : {}), ...(gate === undefined ? {} : { gate }) });
}

function buildStage(s: FireflyState): void {
  const start = s.stage * STAGE_SECONDS;
  const trail = s.trails[s.stage - 1];
  const risky = trail === "bramble" || trail === "moonpath";
  const gates = gateTimesOf(s.stage);
  for (const time of gates) addEvent(s, "gate", 1, start + time, undefined, s.nextGate++);
  // Each gap between word decisions holds a cage or thorns, never both. The first
  // stage has one thorn row per gap; later stages ask for a dodge, a dodge, then a choice.
  const gaps = gates.slice(0, -1).map((time, i) => [time, gates[i + 1]!] as const);
  const cageGaps = s.stage === 2 ? [0, 3, ...(risky ? [4] : [])] : [0, 4, ...(risky ? [6] : [])];
  let arrivals: number[] = [];
  gaps.forEach(([from, to], i) => {
    if (cageGaps.includes(i)) return;
    if (s.stage > 0) arrivals.push(from + 1.1, from + 2.5);
    else if ((from + to) / 2 >= 8) arrivals.push((from + to) / 2);
  });
  if (trail === "bridge") arrivals = arrivals.filter((_, i) => i % 2 === 0);
  const patterns = shuffled(s, HAZARD_PATTERNS);
  const mirror = random(s) < 0.5;
  arrivals.forEach((time, i) => {
    const pattern = patterns[Math.floor(i / 3) % patterns.length]!;
    let lanes = [...pattern.rows[i % pattern.rows.length]!];
    if ((s.stage === 0 && i < 2) || (trail === "grove" && i % 3 === 0)) lanes = lanes.slice(0, 1);
    if (risky && i % 3 === 1 && lanes.length === 1) lanes.push((lanes[0]! + 1) % 3);
    for (const lane of lanes) addEvent(s, "hazard", mirror ? 2 - lane : lane, start + time);
  });

  const spirits = shuffled(s, SPIRITS.filter((spirit) => spirit.stage === s.stage).map((spirit) => spirit.id));
  // Stable partition after shuffling retains variety while prioritizing uncollected identities.
  spirits.sort((a, b) => Number(s.collected.includes(a)) - Number(s.collected.includes(b)));
  cageGaps.forEach((gap, i) => {
    // A cage does not share a hazard arrival. Its lead-in is a visible firefly trail.
    const [from, to] = gaps[gap]!, time = (from + to) / 2;
    const lane = s.stage === 0 && i === 0 ? 1 : Math.floor(random(s) * 3);
    addEvent(s, "cage", lane, start + time, spirits[i]!);
    for (const offset of [-1.2, -0.8, -0.4]) addEvent(s, "firefly", lane, start + time + offset);
  });

  const lastPickup = s.stage === 2 ? 23.3 : 28.7;
  let lane = 1;
  const spacing = trail === "grove" ? 0.48 : 0.8;
  for (let time = 2.8; time < lastPickup; time += spacing) {
    if (Math.floor(time * 10) % 4 === 0) lane = Math.floor(random(s) * 3);
    // Word gates keep their row to themselves so the choice reads clearly.
    if (gates.some((gate) => Math.abs(gate - time) < 0.5)) continue;
    const nearbyHazards = s.events.filter((e) => e.kind === "hazard" && Math.abs(e.time - start - time) < 0.55);
    if (nearbyHazards.some((e) => e.lane === lane)) {
      lane = [0, 1, 2].find((candidate) => !nearbyHazards.some((e) => e.lane === candidate)) ?? lane;
    }
    addEvent(s, "firefly", lane, start + time);
  }
  s.events.sort((a, b) => a.time - b.time || a.id - b.id);
}

export function createFireflyState(options: { seed: number; difficulty: RunnerDifficulty; collected: SpiritId[] }): FireflyState {
  const maxHearts = options.difficulty === "relaxed" ? 5 : 3;
  const s: FireflyState = {
    phase: "running", stage: 0, elapsed: 0, stageTime: 0, lane: 1, playerLane: 1,
    hearts: maxHearts, maxHearts, charges: 1, maxCharges: 2, burstRemaining: 0,
    immunityRemaining: 0, recharge: 0, chain: 0, score: 0, fireflies: 0, rescued: [],
    shield: false, magnet: false, burstDuration: 1, trails: [], events: [],
    difficulty: options.difficulty, collected: [...options.collected],
    sight: GATE_SIGHT[options.difficulty], awaitingGate: null, gateResults: [], gatesResolved: 0, gatesCorrect: 0, gateStreak: 0,
    pace: PACE[options.difficulty].start,
    seed: options.seed >>> 0, accumulator: 0, nextGate: 0, nextEntityId: 1, cueSerial: 0,
  };
  buildStage(s);
  return s;
}

export function chooseLane(s: FireflyState, lane: number): boolean {
  if (s.phase !== "running" || !Number.isFinite(lane)) return false;
  s.lane = Math.max(0, Math.min(2, Math.round(lane)));
  return true;
}

export function burst(s: FireflyState): boolean {
  if (s.phase !== "running" || s.charges <= 0 || s.burstRemaining > EPSILON) return false;
  s.charges--;
  s.burstRemaining = s.burstDuration;
  cue(s, "burst");
  return true;
}

export function grantCharge(s: FireflyState): void {
  if (s.phase === "delivery" || s.phase === "lost") return;
  s.charges = Math.min(s.maxCharges, s.charges + 1);
  if (s.charges === s.maxCharges) s.recharge = 0;
}

/** Supplies the words for a sighted gate. Content is fixed once assigned. */
export function assignGate(s: FireflyState, id: number, content: GateContent): boolean {
  const gate = s.events.find((e) => e.id === id && e.kind === "gate");
  if (!gate || gate.resolved || gate.content) return false;
  if (content.labels.length !== 3 || content.labels.some((label) => typeof label !== "string" || !label)) return false;
  if (![0, 1, 2].includes(content.answer) || !content.card || !content.word) return false;
  gate.content = { ...content, labels: [...content.labels] };
  if (s.awaitingGate === id) s.awaitingGate = null;
  return true;
}

/** Hands resolved gates to the learning interface exactly once. */
export function takeGateResults(s: FireflyState): GateResult[] {
  const results = s.gateResults;
  s.gateResults = [];
  return results;
}

export function chooseTrail(s: FireflyState, trail: TrailId): boolean {
  if (s.phase !== "fork" || !Object.hasOwn(TRAILS, trail) || TRAILS[trail].stage !== s.stage + 1) return false;
  s.trails.push(trail);
  if (trail === "grove") s.magnet = true;
  if (trail === "bramble") s.burstDuration = 1.5;
  if (trail === "bridge") s.shield = true;
  if (trail === "moonpath") { s.maxCharges = 3; grantCharge(s); }
  s.stage = (s.stage + 1) as 1 | 2;
  s.stageTime = 0;
  s.phase = "running";
  s.accumulator = 0;
  buildStage(s);
  return true;
}

function resolveGate(s: FireflyState, event: FireflyEntity, content: GateContent): void {
  // The lane the player committed to counts, even while Aki is still stepping across.
  const lane = s.lane, intro = content.mode === "intro";
  const correct = intro || lane === content.answer;
  let charged = false;
  event.chosen = lane;
  s.gatesResolved++;
  if (intro) {
    // Meeting a word is a gentle moment, not a streak or a free charge.
    s.score += 25;
    cue(s, "gate");
  } else if (correct) {
    s.gatesCorrect++;
    s.score += 50 * multiplierOf(s.chain);
    s.chain++;
    if (++s.gateStreak % 3 === 0) { grantCharge(s); charged = true; }
    cue(s, "gate");
  } else {
    // A missed word returns soon; it never costs a heart.
    s.chain = 0;
    s.gateStreak = 0;
    cue(s, "miss");
  }
  s.gateResults.push({ id: event.id, gate: event.gate ?? 0, lane, correct, card: content.card, word: content.word, mode: content.mode, charged });
}

function resolveArrivals(s: FireflyState): void {
  for (const event of s.events) {
    if (event.resolved || event.time > s.elapsed + EPSILON) continue;
    event.resolved = true;
    const distance = Math.abs(s.playerLane - event.lane);
    if (event.kind === "gate") {
      if (event.content) resolveGate(s, event, event.content);
    } else if (event.kind === "firefly") {
      if (distance > (s.magnet ? 1.15 : 0.45)) continue;
      s.score += 10 * multiplierOf(s.chain);
      s.chain++;
      s.fireflies++;
      cue(s, "firefly");
    } else if (event.kind === "cage") {
      if (distance > 0.45 || s.burstRemaining <= EPSILON || !event.spirit) continue;
      s.rescued.push(event.spirit);
      s.score += 250;
      cue(s, "rescue", event.spirit);
    } else {
      if (distance > 0.45 || s.burstRemaining > EPSILON || s.immunityRemaining > EPSILON) continue;
      s.immunityRemaining = 1.5;
      if (s.shield) {
        s.shield = false;
        cue(s, "shield");
      } else {
        s.hearts--;
        s.chain = 0;
        cue(s, "hit");
        if (s.hearts <= 0) {
          s.hearts = 0;
          s.phase = "lost";
          cue(s, "lost");
          return;
        }
      }
    }
  }
}

function inSight(s: FireflyState, e: FireflyEntity): boolean {
  return e.kind === "gate" && !e.resolved && e.time - s.elapsed <= s.sight + EPSILON;
}

/** Only the nearest unresolved gate can ask for words, so one lantern call is live at a time. */
function pendingGate(s: FireflyState): FireflyEntity | undefined {
  const next = s.events.find((e) => e.kind === "gate" && !e.resolved);
  return next && !next.content && inSight(s, next) ? next : undefined;
}

function tick(s: FireflyState): void {
  const slow = s.events.some((e) => inSight(s, e) && e.content?.slow);
  s.pace += (targetPace(s) - s.pace) * Math.min(1, FIXED_STEP * PACE_EASE_RATE);
  const dt = FIXED_STEP * s.pace * (slow ? INTRO_SLOW : 1);
  const stageEnd = (s.stage + 1) * STAGE_SECONDS;
  const step = Math.min(dt, Math.max(0, stageEnd - s.elapsed));
  s.elapsed += step;
  s.stageTime = s.elapsed - s.stage * STAGE_SECONDS;
  s.playerLane += Math.sign(s.lane - s.playerLane) * Math.min(Math.abs(s.lane - s.playerLane), step / LANE_CHANGE_SECONDS);
  s.burstRemaining = Math.max(0, s.burstRemaining - step);
  s.immunityRemaining = Math.max(0, s.immunityRemaining - step);
  if (s.charges < s.maxCharges) {
    s.recharge += step;
    if (s.recharge + EPSILON >= 12) {
      s.charges++;
      s.recharge = s.charges === s.maxCharges ? 0 : Math.max(0, s.recharge - 12);
    }
  } else s.recharge = 0;
  resolveArrivals(s);
  if (s.phase !== "running") return;
  if (s.elapsed + EPSILON < stageEnd) return;
  s.elapsed = stageEnd;
  s.stageTime = STAGE_SECONDS;
  if (s.stage < 2) {
    s.phase = "fork";
    cue(s, "fork");
  } else {
    s.phase = "delivery";
    s.score += 500;
    cue(s, "delivery");
  }
}

/**
 * Frame-rate-independent advancement. Time supplied while a route choice is
 * open, or while a sighted gate waits for its words, is discarded. Call again
 * with zero seconds after assigning a gate to finish the current frame.
 */
export function advanceFirefly(s: FireflyState, seconds: number): void {
  if (s.phase !== "running" || !Number.isFinite(seconds) || seconds < 0) return;
  if (s.awaitingGate === null) s.accumulator += seconds;
  while (s.accumulator + EPSILON >= FIXED_STEP && s.phase === "running") {
    const pending = pendingGate(s);
    if (pending) { s.awaitingGate = pending.id; return; }
    s.accumulator = Math.max(0, s.accumulator - FIXED_STEP);
    tick(s);
  }
  // Never carry a long frame across a route choice.
  if (s.phase !== "running") { s.accumulator = 0; return; }
  s.awaitingGate = pendingGate(s)?.id ?? null;
}

/**
 * Advances and supplies words to every gate sighted during the frame. A provider
 * returning null leaves that gate quiet rather than stalling the trail.
 */
export function advanceWithGates(s: FireflyState, seconds: number, provide: (gate: Readonly<FireflyEntity>) => GateContent | null): void {
  advanceFirefly(s, seconds);
  for (let guard = 0; s.awaitingGate !== null && guard < 8; guard++) {
    const gate = s.events.find((e) => e.id === s.awaitingGate)!;
    const content = provide(gate);
    if (!content || !assignGate(s, gate.id, content)) { gate.resolved = true; s.awaitingGate = null; }
    advanceFirefly(s, 0);
  }
}

export function getFireflyResult(s: FireflyState): FireflyResult {
  return { score: s.score, rescued: [...s.rescued], delivered: s.phase === "delivery" };
}

/** Check a stage's gate spacing, warnings, clearances and reachable safe lanes without using Burst. */
export function validateRoute(events: readonly FireflyEntity[], stageStart = 0): boolean {
  const inStage = (e: FireflyEntity) => e.time >= stageStart && e.time < stageStart + STAGE_SECONDS;
  const gates = events.filter((e) => e.kind === "gate" && inStage(e)).map((e) => e.time).sort((a, b) => a - b);
  const longestSight = Math.max(...Object.values(GATE_SIGHT));
  // A call never opens before its stage does, and never overlaps the previous call.
  if (gates.length && gates[0]! - stageStart < longestSight + FIXED_STEP) return false;
  if (gates.some((time, i) => i > 0 && time - gates[i - 1]! < longestSight - EPSILON)) return false;
  const near = (time: number, clearance: number) => gates.some((gate) => Math.abs(gate - time) < clearance - EPSILON);
  const rows = new Map<number, Set<number>>();
  for (const event of events) {
    if (!inStage(event)) continue;
    if (event.kind === "cage" && near(event.time, 1)) return false;
    if (event.kind === "firefly" && near(event.time, 0.45)) return false;
    if (event.kind !== "hazard") continue;
    if (event.time - stageStart < EVENT_WARNING_SECONDS || near(event.time, GATE_CLEARANCE)) return false;
    const lanes = rows.get(event.time) ?? new Set<number>();
    lanes.add(event.lane);
    rows.set(event.time, lanes);
  }
  let previous = stageStart;
  let reachable = [0, 1, 2];
  for (const [time, blocked] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    if (time - previous < 1.4 - EPSILON) return false;
    reachable = [0, 1, 2].filter((lane) => !blocked.has(lane) && reachable.some((from) => Math.abs(lane - from) * LANE_CHANGE_SECONDS <= time - previous));
    if (reachable.length === 0) return false;
    previous = time;
  }
  return true;
}
