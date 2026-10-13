import { useEffect, useRef, useState } from "react";
import { JourneyOverview, JourneyRoad, roadEndId, stopId } from "@/components/JourneyTrail";
import { ROADS, type JLPTLevel } from "@/data";
import { journeyHere } from "@/lib/journey";
import { getSnapshot, selectLevel, useSave, type SaveData } from "@/lib/srs";
import { GameDrawer } from "./GameDrawer";

/** The learner's next checkpoint, else the seal at their sealed road's end. */
function hereTarget(save: SaveData): string {
  const here = journeyHere(save);
  return here.ch !== undefined ? stopId(here.ch) : roadEndId(here.road.id);
}

/**
 * Every checkpoint of the journey as a readable list: the accessible companion to the canvas.
 * "Show on the map" closes the log and walks the traveller to that stop.
 */
export function JourneyLogPanel({ newSeals, onClose, onShowOnMap }: {
  newSeals: readonly number[];
  onClose: () => void;
  onShowOnMap: (ch: number | undefined) => void;
}) {
  const save = useSave();
  const here = journeyHere(save);
  // undefined follows the learner's next checkpoint; null closes them all.
  const [open, setOpen] = useState<number | null | undefined>(undefined);
  const active = open === undefined ? here.ch : open ?? undefined;
  const [target, setTarget] = useState<{ id: string; smooth: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);

  // Open on the learner's place (or the newest seal), then glide for in-log travel.
  useEffect(() => {
    const seal = newSeals[newSeals.length - 1];
    setTarget({ id: seal !== undefined ? stopId(seal) : hereTarget(getSnapshot()), smooth: false });
  }, [newSeals]);
  useEffect(() => {
    if (!target) return;
    const timer = setTimeout(() => {
      try {
        const smooth = target.smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches;
        body.current?.querySelector(`#${CSS.escape(target.id)}`)?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
      } catch {
        /* scrolling is cosmetic */
      }
    });
    return () => clearTimeout(timer);
  }, [target]);

  const findHere = () => {
    setOpen(undefined);
    setTarget({ id: hereTarget(getSnapshot()), smooth: true });
  };
  const travel = (level: JLPTLevel) => {
    selectLevel(level);
    findHere();
  };

  return (
    <GameDrawer label="Journey log" eyebrow="五街道 · JOURNEY LOG" title="The Kanji Journey" onClose={onClose} className="journey-drawer">
      <div ref={body}>
        <p className="game-drawer-lead">
          Five roads from your first 一 to N1, walked in small wins of 4–6 kanji. Each checkpoint is three steps — learn &amp; write, stack &amp; recall, Firefly Rescue — then a typed seal. Clear a checkpoint or reach 55% mastery progress to open the next.
        </p>
        <JourneyOverview save={save} here={here} onTravel={travel} onFindHere={findHere} onShowOnMap={() => onShowOnMap(journeyHere(getSnapshot()).ch)} />
        <div className="journey mt-2">
          {ROADS.map((road, index) => (
            <JourneyRoad key={road.id} road={road} index={index} save={save} here={here.ch} active={active} newSeals={newSeals}
              onToggle={(ch) => setOpen(ch === active ? null : ch)} onTravel={travel} onShowOnMap={onShowOnMap} />
          ))}
        </div>
      </div>
    </GameDrawer>
  );
}
