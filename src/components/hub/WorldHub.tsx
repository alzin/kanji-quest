import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAPTER_NAMES, JOURNEY_STOPS, ROADS, journeyNumber, kanjiOfChapter, type RoadId } from "@/data";
import { AccountStatus } from "@/components/AccountStatus";
import { AppIcon } from "@/components/AppIcon";
import { CheckpointRail } from "@/components/CheckpointRail";
import { ResourceChips } from "@/components/GameScreen";
import { WorldCanvas } from "@/components/game/world/WorldCanvas";
import type { WorldBridge, WorldView } from "@/components/game/world/WorldScene";
import { nodeOfRegion, worldLayout } from "@/components/game/world/layout";
import { areaForLevel } from "@/components/game/forest/areas";
import { useAccount } from "@/lib/account";
import { diffFx, readFx, rememberFx } from "@/lib/celebrations";
import { CHECKPOINT_STEPS } from "@/lib/checkpoint-steps";
import { isNewTraveller, rememberTitleSeen, titleSeen } from "@/lib/hub";
import { journeyHere, journeySeals, roadSeals, stopState } from "@/lib/journey";
import { chapterMasteryPct, getCard, getSnapshot, learningLevel, useSave, type SaveData } from "@/lib/srs";
import { isAudioRunning, play, unlock } from "@/lib/sfx";
import { localDay } from "@/lib/stack-progress";
import { CampPanel } from "./CampPanel";
import { JourneyLogPanel } from "./JourneyLogPanel";
import { TitleCard } from "./TitleCard";

export type HubPanel = "camp" | "journey";
export type HubSearch = { panel?: HubPanel; stop?: number; title?: true };

/** Where the learner stands: their road's next checkpoint, else the last stop of that sealed road. */
function viewOf(save: SaveData): WorldView {
  const here = journeyHere(save);
  const ch = here.ch ?? here.road.regions[here.road.regions.length - 1]!;
  return { states: new Map(JOURNEY_STOPS.map((id) => [id, stopState(save, id)])), here: nodeOfRegion(ch)!.index };
}

/**
 * The hub of the whole game: the overworld map of the Kanji Journey. Camp and the journey log
 * open as panels over it, every screen returns to it, and a new traveller meets the title here.
 */
export function WorldHub({ search }: { search: HubSearch }) {
  const navigate = useNavigate({ from: "/" });
  const router = useRouter();
  const account = useAccount();
  const save = useSave();
  const view = useMemo(() => viewOf(save), [save]);
  const { nodes } = worldLayout();

  // Seals earned since the map last saw this save: stamped once, here and in the journey log.
  const [arrival] = useState(() => {
    const seals = diffFx(readFx(), getSnapshot(), localDay()).newSeals.sort((a, b) => journeyNumber(a) - journeyNumber(b));
    // A return address (a checkpoint just left) wins; otherwise the traveller stands on "here",
    // their next checkpoint, and new seals are announced rather than walked to.
    const focus = search.stop !== undefined ? nodeOfRegion(search.stop)?.index : undefined;
    return { seals, focus };
  });
  const [toast, setToast] = useState("");
  useEffect(() => {
    rememberFx(getSnapshot(), localDay());
    const latest = arrival.seals[arrival.seals.length - 1];
    if (latest === undefined) return;
    if (isAudioRunning()) play("sealEarned"); // never creates an audio context on load
    setToast(`印 Seal earned · ${CHAPTER_NAMES[latest]!.name}`);
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [arrival]);

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [road, setRoad] = useState<RoadId>(nodes[arrival.focus ?? view.here]!.road.id);
  const actions = useRef({ camp: () => {} });
  const [bridge] = useState<WorldBridge>(() => ({
    view,
    version: 0,
    blocked: false,
    reducedMotion: false,
    selected: null,
    ...(arrival.focus !== undefined ? { focus: arrival.focus } : {}),
    onReady: () => setReady(true),
    onArrive: setSelected,
    onRoad: setRoad,
    onCamp: () => actions.current.camp(),
  }));
  useEffect(() => {
    bridge.view = view;
    bridge.version += 1;
  }, [bridge, view]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { bridge.reducedMotion = media.matches; };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [bridge]);
  // Open on the stop the traveller came back from, else their own checkpoint; a return
  // address is spent once used, so a reload lands on "here" again.
  useEffect(() => {
    if (!ready) return;
    setSelected(bridge.focus ?? bridge.view.here);
    if (search.stop !== undefined) void navigate({ search: ({ stop: _stop, ...rest }) => rest, replace: true });
  }, [ready]);

  // Panels live in the URL, so the browser's Back button closes them.
  const panel = search.panel;
  const openedHere = useRef(false);
  const openPanel = (next: HubPanel) => {
    openedHere.current = true;
    void navigate({ search: (s) => ({ ...s, panel: next }) });
  };
  const closePanel = () => {
    if (openedHere.current) {
      openedHere.current = false;
      router.history.back();
    } else void navigate({ search: ({ panel: _panel, ...rest }) => rest, replace: true });
  };
  useEffect(() => { if (!panel) openedHere.current = false; }, [panel]);
  actions.current.camp = () => openPanel("camp");

  // The title card greets a traveller who has not set out yet, once the cloud save (if any)
  // has had its say, so a returning player never sees it flash.
  // Arriving through a deep link (a panel, or back from a checkpoint) means the traveller is
  // already inside the game; the title would only interrupt them, now or after a panel closes.
  const [dismissed, setDismissed] = useState(() => {
    if (search.panel || search.stop !== undefined) rememberTitleSeen();
    return titleSeen();
  });
  const settled = account.phase !== "checking" && account.phase !== "loading";
  const showTitle = !!search.title || (!panel && search.stop === undefined && settled && !dismissed && isNewTraveller(save));
  const startJourney = () => {
    unlock();
    rememberTitleSeen();
    setDismissed(true);
    if (search.title) void navigate({ search: ({ title: _title, ...rest }) => rest, replace: true });
    setSelected(bridge.view.here);
  };
  const showTitleAgain = () => void navigate({ search: ({ panel: _panel, ...rest }) => ({ ...rest, title: true as const }), replace: true });

  const overlay = showTitle ? "title" : panel ?? (selected !== null ? "stop" : null);
  bridge.blocked = overlay === "title" || overlay === "camp" || overlay === "journey" || account.prompt;
  bridge.selected = overlay === "stop" ? selected : null;
  // Nothing moves under a panel or the title card, so the map need not draw at all.
  const covered = overlay === "title" || overlay === "camp" || overlay === "journey";
  useEffect(() => {
    if (!ready) return;
    bridge.sleep?.(covered);
  }, [bridge, ready, covered]);

  const showOnMap = (ch: number | undefined) => {
    const node = ch === undefined ? view.here : nodeOfRegion(ch)?.index;
    closePanel();
    if (node === undefined) return;
    // Walk once the panel has let go of the map.
    setTimeout(() => bridge.walkTo?.(node), 60);
  };

  const here = nodes[view.here]!;
  const hereRoad = here.road;
  const node = selected === null ? undefined : nodes[selected];
  const newTraveller = isNewTraveller(save);

  return (
    <main className="forest-game world-game" data-testid="world-map" data-overlay={overlay ?? "none"} onPointerDown={() => unlock()}>
      <WorldCanvas bridge={bridge} />
      <div className="forest-vignette" aria-hidden="true" />
      {!ready && (
        <div className="forest-loading">
          <span className="forest-seal">道</span>
          <p>Unrolling the map…</p>
        </div>
      )}

      <header className="forest-hud hub-hud">
        <button type="button" className="forest-wordmark hub-wordmark" onClick={showTitleAgain} aria-label="Kanji Dash title screen">
          <span className="forest-seal" aria-hidden="true">森</span>
          <span>KANJI DASH<small>THE SPIRIT TRAIL</small></span>
        </button>
        <div className="forest-hud-right">
          <span className="hub-chips"><ResourceChips /><span className="hub-account"><AccountStatus /></span></span>
          <button type="button" className="hub-button" onClick={() => openPanel("camp")} aria-haspopup="dialog" aria-expanded={panel === "camp"}>
            <AppIcon name="home" />
            <span>Camp</span>
          </button>
          <button type="button" className="hub-button" onClick={() => openPanel("journey")} aria-haspopup="dialog" aria-expanded={panel === "journey"}>
            <AppIcon name="map" />
            <span>Journey log</span>
          </button>
        </div>
      </header>

      <section className="forest-objective world-position" aria-label="Your position">
        <span className="forest-eyebrow">THE KANJI JOURNEY <span>•</span> 五街道</span>
        <h1>You are on the {hereRoad.id} road</h1>
        <p className="world-position-line">
          {hereRoad.jp} {hereRoad.romaji} · {here.ch !== undefined && view.states.get(here.ch)?.status !== "sealed"
            ? `Region ${here.regionIndex + 1} of ${hereRoad.regions.length}`
            : "Every seal on this road earned"}
        </p>
        <p className="world-position-line"><b>{journeySeals(save)}</b> of {JOURNEY_STOPS.length} seals on the journey</p>
        <div className="world-actions">
          <button className="forest-track" disabled={!ready} onClick={() => bridge.recenter?.()}>
            You are here <span aria-hidden="true">◆</span>
          </button>
          <Link className="forest-track" to="/run" search={{ mode: "expedition" }}>
            Walk today’s trail <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <nav className="world-roads" aria-label="Roads of the journey">
        {[...ROADS].reverse().map((r) => (
          <button key={r.id} aria-pressed={r.id === road} disabled={!ready} onClick={() => bridge.showRoad?.(r.id)}
            aria-label={`Show the ${r.id} road${r.level ? `, ${roadSeals(save, r)} of ${r.regions.length} seals` : ", uncharted"}`}>
            <b>{r.id}</b>
            <span lang="ja">{r.jp}</span>
            <small>{r.level ? `${roadSeals(save, r)}/${r.regions.length}` : "soon"}</small>
          </button>
        ))}
      </nav>

      {overlay === "stop" && node ? (
        <StopPanel key={node.index} index={node.index} save={save} here={node.index === view.here} newTraveller={newTraveller}
          onStep={(direction) => bridge.step?.(direction)} onClose={() => setSelected(null)} />
      ) : overlay === null && (
        <div className="forest-bottom">
          <div className="forest-controls">
            <span>Drag to explore</span><i /><span>Tap a stop to walk there</span><i /><span><kbd>↑</kbd><kbd>↓</kbd> Step</span>
          </div>
        </div>
      )}

      {toast && <div className="forest-toast hub-toast" role="status">{toast}</div>}

      {overlay === "camp" && <CampPanel onClose={closePanel} onShowTitle={showTitleAgain} />}
      {overlay === "journey" && <JourneyLogPanel newSeals={arrival.seals} onClose={closePanel} onShowOnMap={showOnMap} />}
      {overlay === "title" && <TitleCard onStart={startJourney} />}
    </main>
  );
}

function StopPanel({ index, save, here, newTraveller, onStep, onClose }: {
  index: number; save: SaveData; here: boolean; newTraveller: boolean;
  onStep: (direction: 1 | -1) => void; onClose: () => void;
}) {
  const { nodes } = worldLayout();
  const node = nodes[index]!;
  const total = CHECKPOINT_STEPS.length;
  const header = (
    <div className="forest-dialog-top">
      <span className="forest-eyebrow">
        {here ? "YOU ARE HERE · " : ""}{node.road.id} · {node.ch !== undefined ? `REGION ${node.regionIndex + 1} OF ${node.road.regions.length}` : "UNCHARTED"}
      </span>
      <button className="forest-close" onClick={onClose} aria-label="Close checkpoint">×</button>
    </div>
  );
  const steps = (
    <div className="world-steps">
      <button onClick={() => onStep(-1)} disabled={index === 0}>‹ Previous stop</button>
      <button onClick={() => onStep(1)} disabled={index === nodes.length - 1}>Next stop ›</button>
    </div>
  );
  if (node.ch === undefined)
    return (
      <section className="world-panel" aria-label="Uncharted stop">
        {header}
        <h2>The road north is still being surveyed.</h2>
        <p>N1’s checkpoints will continue the journey from the last N2 seal, all the way to the summit.</p>
        {steps}
      </section>
    );
  const ch = node.ch;
  const state = stopState(save, ch);
  const name = CHAPTER_NAMES[ch]!;
  const kanji = kanjiOfChapter(ch);
  const pct = chapterMasteryPct(save, ch);
  const mastered = kanji.filter((k) => getCard(save, k.c).mastery === 3).length;
  const previous = node.road.regions[node.regionIndex - 1];
  const area = areaForLevel(learningLevel(save));
  // A brand-new traveller starts with a short walk in the woods; after that the checkpoint leads
  // and the walk stays one tap away in the position card.
  const trailFirst = here && newTraveller;
  const trail = here && (
    <div className="world-trail" data-primary={trailFirst || undefined}>
      <div>
        <span className="forest-eyebrow">TODAY’S TRAIL</span>
        <p><b lang="ja">{area.name.jp}</b> {area.name.en.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())} · about 5 minutes</p>
      </div>
      <Link className={trailFirst ? "forest-primary" : "world-trail-link"} to="/run" search={{ mode: "expedition" }} data-sfx="tap">
        Walk today’s trail <span aria-hidden="true">{trailFirst ? "→" : "↗"}</span>
      </Link>
    </div>
  );
  return (
    <section className="world-panel" aria-label={`${name.name} checkpoint`} data-state={state.status}>
      {header}
      <h2>{name.name} <small lang="ja">{name.jp}</small></h2>
      <p className="world-kanji" lang="ja">
        <span aria-hidden="true">{kanji.map((k) => k.c).join(" ")}</span>
        <span className="sr-only">Kanji: {kanji.map((k) => k.c).join("、")}</span>
      </p>
      <div className="world-meter" role="progressbar" aria-label={`${name.name} mastery`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="world-fine">{pct}% progress · {mastered}/{kanji.length} mastered</p>
      {trailFirst && trail}
      {state.status === "open" && <CheckpointRail done={state.steps} current={state.steps < total ? state.steps : "seal"} className="mt-3" />}
      {state.status === "open" && (
        <Link className={trailFirst ? "world-secondary" : "forest-primary"} to="/run" search={{ gate: ch }}>
          {state.steps === 0 ? "Prepare checkpoint" : state.steps < total ? `Continue · ${CHECKPOINT_STEPS[state.steps]!.label}` : "Earn your seal"}
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {state.status === "sealed" && (
        <p className="world-sealed">
          <span>{state.perfect ? "✦ Perfect seal stamped" : "印 Seal stamped"}</span>
          <Link to="/run" search={{ gate: ch }} className="forest-text-button">Repeat checkpoint</Link>
        </p>
      )}
      {state.status === "locked" && previous !== undefined && (
        <p className="world-fine">Opens when you clear {CHAPTER_NAMES[previous]!.name}, or reach 55% mastery progress there.</p>
      )}
      {steps}
    </section>
  );
}
