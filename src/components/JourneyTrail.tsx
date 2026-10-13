import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AppIcon } from "@/components/AppIcon";
import { CheckpointRail } from "@/components/CheckpointRail";
import { CHAPTER_NAMES, JOURNEY_STOPS, ROADS, journeyNumber, kanjiOfChapter, kanjiOfLevel, nextLevel, roadOfLevel, type JLPTLevel, type Road } from "@/data";
import { CHECKPOINT_STEPS } from "@/lib/checkpoint-steps";
import { isRoadSealed, journeySeals, roadSeals, stopState, type StopState } from "@/lib/journey";
import { chapterMasteryPct, getCard, type SaveData } from "@/lib/srs";

export const stopId = (ch: number) => `checkpoint-${ch}`;
export const roadId = (road: Road["id"]) => `road-${road}`;
export const roadEndId = (road: Road["id"]) => `road-${road}-end`;

/** The trail meanders across the node column: x is a percentage of that column's width. */
export function trailX(i: number): number {
  return Math.round((50 + 20 * Math.sin(i * Math.PI / 4)) * 10) / 10;
}

type Trail = "walked" | "ahead";
const roadStyle = (road: Road) => ({ "--road-h": road.hue }) as CSSProperties;
// The uncharted N1 road is drawn about as long as N2 on the overview bar.
const UNCHARTED_SHARE = 70;
const GHOST_STOPS = 5;

export function JourneyOverview({ save, here, onTravel, onFindHere, onShowOnMap }: {
  save: SaveData;
  here: { road: Road; ch: number | undefined };
  onTravel: (level: JLPTLevel) => void;
  onFindHere: () => void;
  /** Close the log and walk to the learner's own stop on the world map. */
  onShowOnMap?: () => void;
}) {
  const total = JOURNEY_STOPS.length;
  const level = save.selectedLevel;
  const position = here.ch === undefined ? -1 : here.road.regions.indexOf(here.ch);
  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-e1" aria-label="Journey progress">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">One journey. {total} checkpoints.</span>
        <span className="shrink-0 whitespace-nowrap text-xs font-bold text-primary tabular-nums">{journeySeals(save)} / {total} earned</span>
      </div>
      <div className="journey-overview-bar mt-3" aria-hidden="true">
        {ROADS.map((road) => {
          const count = road.regions.length;
          return (
            <span key={road.id} className="journey-overview-road road-tint" data-charted={count > 0} style={{ ...roadStyle(road), flexGrow: count || UNCHARTED_SHARE }}>
              {count > 0 && <span className="journey-overview-fill" style={{ width: `${roadSeals(save, road) / count * 100}%` }} />}
              {road === here.road && <span className="journey-overview-here" style={{ left: `${position < 0 ? 100 : (position + 0.5) / count * 100}%` }} />}
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground" aria-hidden="true">
        <span>N5 · Start</span>
        <span>N1 · Journey’s end</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          {here.ch !== undefined
            ? <>You are here: <strong>{level} · Region {position + 1}</strong>, checkpoint {journeyNumber(here.ch)} of {total}.</>
            : <>Every checkpoint on the {level} road is sealed.</>}
        </p>
        <button type="button" onClick={onFindHere} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold text-primary transition-colors hover:bg-secondary">
          {here.ch !== undefined ? "Go to my checkpoint" : `Go to the ${level} seal`}
          <AppIcon name="arrow" className="h-4 w-4 rotate-90" />
        </button>
      </div>
      <div role="group" aria-label="JLPT level" className="mt-3 flex gap-1 rounded-xl border border-border bg-surface-sunken p-1">
        {ROADS.map((road) => road.level ? (
          <button key={road.id} type="button" aria-pressed={road.level === level} onClick={() => onTravel(road.level!)}
            className={`min-h-11 min-w-0 flex-1 rounded-lg px-1 py-2 text-sm font-bold transition-colors ${road.level === level ? "bg-card text-primary shadow-e1" : "text-muted-foreground hover:text-foreground"}`}>
            {road.id} <span className="block text-[11px] font-normal sm:ml-1 sm:inline sm:text-xs">{kanjiOfLevel(road.level).length}<span className="max-[379px]:sr-only"> kanji</span></span>
          </button>
        ) : (
          <button key={road.id} type="button" disabled className="min-h-11 min-w-0 flex-1 rounded-lg px-1 py-2 text-sm font-bold text-muted-foreground/60">
            {road.id} <span className="block text-[11px] font-normal sm:ml-1 sm:inline sm:text-xs">Soon</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Start on any road. Your daily runs follow the road you travel, and each road keeps its own seals.</p>
      {onShowOnMap && (
        <button type="button" onClick={onShowOnMap} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-primary">
          <AppIcon name="map" className="h-4 w-4" /> Walk there on the map
        </button>
      )}
    </section>
  );
}

function Station({ road, index, trailIn, trailOut, mark, children }: { road: Road; index: number; trailIn: Trail; trailOut: Trail; mark: ReactNode; children: ReactNode }) {
  return (
    <header className="journey-station">
      {index > 0 && <span className="journey-line journey-station-in" data-trail={trailIn} aria-hidden="true" />}
      <span className="journey-line journey-station-out" data-trail={trailOut} aria-hidden="true" />
      <span className="journey-station-mark" aria-hidden="true">{mark}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Road {index + 1} of {ROADS.length} · {road.level ? `${road.regions.length} checkpoints · ${kanjiOfLevel(road.level).length} kanji` : "Being charted"}
        </p>
        <h2 id={`${roadId(road.id)}-title`} className="mt-1 font-serif text-2xl font-bold">The {road.id} Road</h2>
        <p className="mt-0.5 font-serif text-sm text-accent">{road.jp} · {road.romaji}</p>
        {children}
      </div>
    </header>
  );
}

export function JourneyRoad({ road, index, save, here, active, newSeals, onToggle, onTravel, onShowOnMap }: {
  road: Road;
  index: number;
  save: SaveData;
  here: number | undefined;
  active: number | undefined;
  newSeals: readonly number[];
  onToggle: (ch: number) => void;
  onTravel: (level: JLPTLevel) => void;
  onShowOnMap?: (ch: number) => void;
}) {
  const previous = ROADS[index - 1];
  const trailIn: Trail = previous && isRoadSealed(save, previous) ? "walked" : "ahead";
  if (!road.level) return <UnchartedRoad road={road} index={index} trailIn={trailIn} />;

  const level = road.level;
  const count = road.regions.length;
  const seals = roadSeals(save, road);
  const selected = save.selectedLevel === level;
  const states = road.regions.map((ch) => stopState(save, ch));
  // The locked run ahead is explained once, on the travelled road, under its last open checkpoint.
  const noteAt = selected ? states.findIndex((state, i) => state.status !== "locked" && states[i + 1]?.status === "locked") : -1;
  return (
    <section id={roadId(road.id)} aria-labelledby={`${roadId(road.id)}-title`} className="journey-road road-tint" style={roadStyle(road)}>
      <Station road={road} index={index} trailIn={trailIn} trailOut={states[0]!.status === "sealed" ? "walked" : "ahead"} mark={road.id}>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-bold text-primary tabular-nums">{seals} / {count} earned</span>
          {selected
            ? <span className="journey-badge">Your road</span>
            : <button type="button" onClick={() => onTravel(level)} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-xs font-bold text-foreground transition-colors hover:bg-secondary">Travel the {level} road</button>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div className="journey-road-fill h-full rounded-full" style={{ width: `${seals / count * 100}%` }} />
        </div>
      </Station>
      <ol aria-label={`${level} checkpoints`} className="journey-trail">
        {road.regions.map((ch, i) => {
          const sealIndex = states[i]!.status === "sealed" ? newSeals.indexOf(ch) : -1;
          return (
            <JourneyStop key={ch} ch={ch} i={i} count={count} save={save} state={states[i]!} here={ch === here} active={ch === active}
              previous={road.regions[i - 1]} sealDelay={sealIndex >= 0 ? 200 + sealIndex * 80 : undefined} onToggle={onToggle} onShowOnMap={onShowOnMap}
              note={i === noteAt ? <p className="journey-note">The road ahead opens one region at a time — clear a checkpoint, or reach 55% mastery progress.</p> : null} />
          );
        })}
      </ol>
      {seals === count && <RoadMilestone road={road} save={save} onTravel={onTravel} />}
    </section>
  );
}

function StepRing({ steps }: { steps: number }) {
  // Three steps, then the seal: each checkpoint is itself a row of smaller ones.
  const segments = CHECKPOINT_STEPS.length + 1;
  const circumference = 2 * Math.PI * 18.5, segment = circumference / segments, gap = segment * 0.18;
  const dash = `${(segment - gap).toFixed(2)} ${gap.toFixed(2)}`;
  return (
    <svg className="journey-node-ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle className="journey-node-ring-track" cx="20" cy="20" r="18.5" strokeDasharray={dash} strokeDashoffset={gap / 2} />
      {steps > 0 && <circle className="journey-node-ring-done" cx="20" cy="20" r="18.5" strokeDasharray={`${Array(steps).fill(dash).join(" ")} 0 ${circumference.toFixed(2)}`} strokeDashoffset={gap / 2} />}
    </svg>
  );
}

function chipFor({ status, steps, perfect }: StopState, here: boolean): { kind: string; text: ReactNode } {
  const total = CHECKPOINT_STEPS.length;
  if (status === "sealed") return { kind: "sealed", text: perfect ? "Perfect seal" : "Sealed" };
  if (status === "locked") return { kind: "locked", text: <><AppIcon name="lock" className="h-3.5 w-3.5" /><span className="sr-only">Locked</span></> };
  if (here) return { kind: "here", text: "Next" };
  if (steps === total) return { kind: "progress", text: "Seal ready" };
  if (steps > 0) return { kind: "progress", text: <><span aria-hidden="true">Step {steps + 1}/{total}</span><span className="sr-only">Step {steps + 1} of {total}</span></> };
  return { kind: "open", text: "Open" };
}

function JourneyStop({ ch, i, count, save, state, here, active, previous, sealDelay, note, onToggle, onShowOnMap }: {
  ch: number;
  i: number;
  count: number;
  save: SaveData;
  state: StopState;
  here: boolean;
  active: boolean;
  previous: number | undefined;
  sealDelay: number | undefined;
  note: ReactNode;
  onToggle: (ch: number) => void;
  onShowOnMap: ((ch: number) => void) | undefined;
}) {
  const x = trailX(i), nx = i + 1 < count ? trailX(i + 1) : 50;
  const trail: Trail = state.status === "sealed" ? "walked" : "ahead";
  const kanji = kanjiOfChapter(ch).map((k) => k.c);
  const detailId = `${stopId(ch)}-detail`;
  const chip = chipFor(state, here);
  return (
    <li id={stopId(ch)} className="journey-stop" data-state={state.status} data-here={here ? "" : undefined} data-perfect={state.perfect ? "" : undefined} data-last={i + 1 === count ? "" : undefined} style={{ "--x": x } as CSSProperties}>
      <span className="journey-line journey-stop-run" data-trail={trail} aria-hidden="true" />
      <svg className="journey-segment" data-trail={trail} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={`M${x} 0C${x} 50 ${nx} 50 ${nx} 100`} />
      </svg>
      <h3 className="journey-stop-heading">
        <button type="button" className="journey-stop-toggle" aria-expanded={active} aria-controls={active ? detailId : undefined} onClick={() => onToggle(ch)}>
          <span className={`journey-node${sealDelay !== undefined ? " seal-in" : ""}`} style={sealDelay !== undefined ? { animationDelay: `${sealDelay}ms` } : undefined} aria-hidden="true">
            {state.status === "open" && <StepRing steps={state.steps} />}
            <span className="journey-node-label">{state.status === "sealed" ? "印" : i + 1}</span>
          </span>
          <span className="journey-stop-text">
            <span className="journey-stop-title"><span className="sr-only">Region {i + 1}: </span>{CHAPTER_NAMES[ch]!.name}</span>
            <span className="journey-stop-kanji" aria-hidden="true">{kanji.join(" ")}</span>
            <span className="sr-only">, {kanji.join("、")}, </span>
          </span>
          <span className="journey-chip" data-kind={chip.kind}>{chip.text}</span>
        </button>
      </h3>
      {active && <StopDetail id={detailId} ch={ch} i={i} save={save} state={state} here={here} previous={previous} onShowOnMap={onShowOnMap} />}
      {note}
    </li>
  );
}

function StopDetail({ id, ch, i, save, state, here, previous, onShowOnMap }: { id: string; ch: number; i: number; save: SaveData; state: StopState; here: boolean; previous: number | undefined; onShowOnMap: ((ch: number) => void) | undefined }) {
  const name = CHAPTER_NAMES[ch]!;
  const kanji = kanjiOfChapter(ch);
  const count = kanji.length;
  const pct = chapterMasteryPct(save, ch);
  const mastered = kanji.filter((entry) => getCard(save, entry.c).mastery === 3).length;
  const { status, steps } = state;
  const total = CHECKPOINT_STEPS.length;
  return (
    <div id={id} className={`journey-detail rounded-2xl border bg-card p-4 ${here ? "glow-next border-primary/50 shadow-e2" : "border-border shadow-e1"}`}>
      <p className={`text-[11px] font-bold uppercase tracking-widest ${here ? "text-primary" : "text-muted-foreground"}`}>
        Region {i + 1}{here ? " · Next checkpoint" : status === "sealed" ? " · Cleared" : status === "locked" ? " · Locked" : ""}
      </p>
      <p className="mt-1 font-serif text-sm text-muted-foreground">
        {name.jp} · {count} kanji · {kanji.reduce((n, k) => n + k.vocab.length, 0)}-word checkpoint
      </p>
      <p className="mt-2 font-serif text-2xl tracking-[0.2em]">
        <span aria-hidden="true">{kanji.map((k) => k.c).join(" ")}</span>
        <span className="sr-only">Kanji in this region: {kanji.map((k) => k.c).join("、")}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`${name.name} mastery`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="ring-fill h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {status === "open" && <CheckpointRail done={steps} current={steps < total ? steps : "seal"} className="mt-4" />}
      <div className="mt-3 flex flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground tabular-nums">{pct}% progress · {mastered}/{count} mastered</span>
        {status === "open" && (
          <Link to="/run" search={{ gate: ch }} data-sfx="tap"
            className="pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-e1 transition-transform">
            {steps === 0 ? "Prepare checkpoint" : steps < total ? `Continue · ${CHECKPOINT_STEPS[steps]!.label}` : "Earn your seal"}
            <AppIcon name="arrow" className="h-4 w-4" />
          </Link>
        )}
        {status === "sealed" && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-primary">
            <span className="inline-flex items-center gap-1.5"><AppIcon name="check" className="h-4 w-4" /> Seal stamped</span>
            <Link to="/run" search={{ gate: ch }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-3">Repeat checkpoint</Link>
          </div>
        )}
      </div>
      {status === "locked" && previous !== undefined && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Opens when you clear {CHAPTER_NAMES[previous]!.name}, or reach 55% mastery progress there.
        </p>
      )}
      {onShowOnMap && (
        <button type="button" onClick={() => onShowOnMap(ch)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground">
          <AppIcon name="map" className="h-4 w-4" /> Show on the map
        </button>
      )}
    </div>
  );
}

function RoadMilestone({ road, save, onTravel }: { road: Road; save: SaveData; onTravel: (level: JLPTLevel) => void }) {
  const level = road.level!;
  const next = nextLevel(level);
  const offer = next !== undefined && save.selectedLevel !== next && !isRoadSealed(save, roadOfLevel(next));
  return (
    <div id={roadEndId(road.id)} className="journey-milestone">
      <span className="journey-line journey-milestone-line" data-trail="walked" aria-hidden="true" />
      <div className="flex items-center gap-4 rounded-2xl border-2 border-gold bg-card p-4 shadow-e2 sm:p-5">
        <div className="flex h-14 w-14 shrink-0 rotate-[-8deg] items-center justify-center rounded-full border-4 border-primary font-serif text-xl font-bold text-primary sm:h-16 sm:w-16 sm:text-2xl">
          {level}
        </div>
        <div className="min-w-0">
          <div className="font-serif text-lg font-bold">JLPT {level} kanji seal earned!</div>
          <p className="text-sm text-muted-foreground">
            {next
              ? `Every checkpoint on the ${level} road is sealed. The journey continues on the ${next} road.`
              : `Every checkpoint on the ${level} road is sealed. The N1 road is still being charted — keep revisiting your words to build lasting mastery.`}
          </p>
          {offer && (
            <button type="button" onClick={() => onTravel(next)} className="mt-2 min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-e1 transition-colors hover:bg-primary-hover">
              Start the {next} road →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** N1 sits on the journey before its regions exist: the road is drawn, its checkpoints are not. */
function UnchartedRoad({ road, index, trailIn }: { road: Road; index: number; trailIn: Trail }) {
  return (
    <section id={roadId(road.id)} aria-labelledby={`${roadId(road.id)}-title`} className="journey-road road-tint" data-uncharted="" style={roadStyle(road)}>
      <Station road={road} index={index} trailIn={trailIn} trailOut="ahead" mark={road.id}>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {road.id}’s checkpoints are still being surveyed. When they arrive, they will carry the road on from the last {ROADS[index - 1]?.id ?? ""} seal to the end of the journey.
        </p>
      </Station>
      <div className="journey-trail" aria-hidden="true">
        {Array.from({ length: GHOST_STOPS }, (_, i) => (
          <div key={i} className="journey-stop journey-ghost" data-last={i + 1 === GHOST_STOPS ? "" : undefined} style={{ "--x": trailX(i), "--fade": 1 - i * 0.15 } as CSSProperties}>
            <span className="journey-line journey-stop-run" data-trail="ahead" />
            <svg className="journey-segment" data-trail="ahead" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={`M${trailX(i)} 0C${trailX(i)} 50 ${i + 1 < GHOST_STOPS ? trailX(i + 1) : 50} 50 ${i + 1 < GHOST_STOPS ? trailX(i + 1) : 50} 100`} />
            </svg>
            <div className="journey-ghost-row">
              <span className="journey-node" />
              <span className="journey-ghost-bar" style={{ width: `${46 + (i * 37) % 30}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="journey-destination">
        <span className="journey-line journey-station-in" data-trail="ahead" aria-hidden="true" />
        <span className="journey-station-mark" aria-hidden="true">頂</span>
        <div className="min-w-0">
          <p className="font-serif text-base font-bold">Journey’s end</p>
          <p className="text-xs text-muted-foreground">The summit of JLPT {road.id}.</p>
        </div>
      </div>
    </section>
  );
}
