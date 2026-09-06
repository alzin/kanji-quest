import type { Question } from "@/lib/srs";

export const RUNNER_LANES = 3;
export const RUNNER_HEARTS = 3;
const GATE_SPACING = 560;
const SPEED = 150; // world px per second

export type RunnerStats = {
  correct: number;
  wrong: number;
  bestCombo: number;
  score: number;
};

export function checkpointPassed(correct: number, total: number): boolean {
  return total > 0 && correct * 10 >= total * 7;
}

export function dailyRunReward(stats: RunnerStats): number {
  return stats.correct * 2 + stats.bestCombo;
}

export type RunnerGate = {
  q: Question;
  x: number;
  correctLane: number;
  laneChoices: (string | null)[];
  resolved: -1 | 0 | 1;
};

export type RunnerState = RunnerStats & {
  lane: number;
  targetLane: number;
  hearts: number;
  combo: number;
  dist: number;
  qi: number;
  gates: RunnerGate[];
  done: boolean;
  flash: number;
  bump: number;
};

export type GameLayout = {
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

export function getDecisionX(layout: GameLayout) {
  return layout.compact ? layout.playerX + layout.signWidth / 2 : layout.playerX;
}

export function getPreviewX(width: number, layout: GameLayout) {
  return layout.compact ? width - layout.signWidth / 2 - 10 : width;
}

export function getGateSpeed(width: number, layout: GameLayout) {
  if (!layout.compact) return SPEED;
  const runway = Math.max(1, getPreviewX(width, layout) - getDecisionX(layout));
  return Math.min(SPEED, runway / 3);
}

export function getGateSpacing(width: number, layout: GameLayout) {
  return layout.compact ? getGateSpeed(width, layout) * 3 : GATE_SPACING;
}

export function getGameLayout(width: number, height: number): GameLayout {
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
  const signHeight = Math.min(48, Math.max(36, laneSpan / RUNNER_LANES - 10));

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

function spawnGate(q: Question, x: number, random: () => number): RunnerGate {
  const order = [0, 1, 2];
  // Fisher-Yates gives each lane the same chance of containing the answer.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const laneChoices: (string | null)[] = [null, null, null];
  let correctLane = 0;
  order.forEach((lane, i) => {
    const choice = q.choices[i] ?? null;
    laneChoices[lane] = choice;
    if (choice === q.answer) correctLane = lane;
  });
  return { q, x, correctLane, laneChoices, resolved: -1 };
}

function fillPendingGates(
  s: RunnerState,
  questions: Question[],
  width: number,
  layout: GameLayout,
  random: () => number,
) {
  let pending = s.gates.filter((gate) => gate.resolved === -1).length;
  while (s.qi < questions.length && pending < RUNNER_LANES) {
    const x = s.gates.length
      ? Math.max(...s.gates.map((gate) => gate.x)) + getGateSpacing(width, layout)
      : Math.max(
        layout.compact ? getPreviewX(width, layout) : 700,
        getDecisionX(layout) + getGateSpeed(width, layout) * 3,
      );
    s.gates.push(spawnGate(questions[s.qi]!, x, random));
    s.qi += 1;
    pending += 1;
  }
}

export function createRunnerState(
  questions: Question[],
  width: number,
  height: number,
  random: () => number = Math.random,
): RunnerState {
  const s: RunnerState = {
    lane: 1,
    targetLane: 1,
    hearts: RUNNER_HEARTS,
    correct: 0,
    wrong: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    dist: 0,
    qi: 0,
    gates: [],
    done: questions.length === 0,
    flash: 0,
    bump: 0,
  };
  fillPendingGates(s, questions, width, getGameLayout(width, height), random);
  return s;
}

export function getRunnerStats(s: RunnerState): RunnerStats {
  return { correct: s.correct, wrong: s.wrong, bestCombo: s.bestCombo, score: s.score };
}

export function getRunnerRemaining(s: RunnerState, total: number): number {
  return Math.max(0, total - s.correct - s.wrong);
}

/** Advance to each decision at its actual time, including when frames are slow.
 * Returning false from onAnswer pauses immediately and discards paused time.
 */
export function advanceRunner(
  s: RunnerState,
  questions: Question[],
  width: number,
  height: number,
  elapsedSeconds: number,
  onAnswer: (question: Question, correct: boolean) => boolean | void,
  random: () => number = Math.random,
) {
  if (s.done || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
  const layout = getGameLayout(width, height);
  const speed = getGateSpeed(width, layout);
  const decisionX = getDecisionX(layout);
  let remaining = elapsedSeconds;

  while (remaining > 0 && !s.done) {
    const nextGate = s.gates
      .filter((gate) => gate.resolved === -1)
      .reduce<RunnerGate | null>((next, gate) => !next || gate.x < next.x ? gate : next, null);
    if (!nextGate) break;
    const secondsToDecision = Math.max(0, (nextGate.x - decisionX) / speed);
    const reachesDecision = secondsToDecision <= remaining;
    const dt = reachesDecision ? secondsToDecision : remaining;

    s.dist += speed * dt;
    // Exponential smoothing is independent of frame rate.
    s.lane = s.targetLane + (s.lane - s.targetLane) * Math.exp(-14 * dt);
    s.flash = Math.max(0, s.flash - dt);
    s.bump = Math.max(0, s.bump - dt);
    for (const gate of s.gates) gate.x -= speed * dt;
    remaining = Math.max(0, remaining - dt);

    if (reachesDecision) {
      const correct = nextGate.laneChoices[Math.round(s.lane)] === nextGate.q.answer;
      nextGate.resolved = correct ? 1 : 0;
      if (correct) {
        s.correct += 1;
        s.combo += 1;
        s.bestCombo = Math.max(s.bestCombo, s.combo);
        s.score += 100 * s.combo;
        s.bump = 0.5;
      } else {
        s.wrong += 1;
        s.combo = 0;
        s.hearts -= 1;
        s.flash = 0.6;
      }
      s.done = s.hearts === 0 || getRunnerRemaining(s, questions.length) === 0;
      const keepRunning = onAnswer(nextGate.q, correct);
      if (!s.done) fillPendingGates(s, questions, width, layout, random);
      if (keepRunning === false) break;
    }

    s.gates = s.gates.filter((gate) =>
      gate.resolved === -1 || gate.x > (layout.compact ? layout.playerX : -200),
    );
  }
}
