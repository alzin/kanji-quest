import { useEffect } from "react";

export type CompanionMood = "idle" | "correct" | "miss" | "celebrate";
const POSES: Record<CompanionMood, string> = { idle: "idle", correct: "success", miss: "encourage", celebrate: "celebrate" };
const asset = (pose: string) => `${import.meta.env.BASE_URL}art/aki/${pose}.webp`;

/** Four matching poses share the same scale and foot anchor, so reactions never shift the layout. */
export function TrailCompanion({ mood = "idle", message, className = "", reactionKey = "", paused = false }: {
  mood?: CompanionMood; message?: string; className?: string; reactionKey?: string | number; paused?: boolean;
}) {
  useEffect(() => { Object.values(POSES).forEach((pose) => { const image = new Image(); image.src = asset(pose); }); }, []);
  return <div className={`trail-companion ${className}`} data-mood={mood} data-paused={paused} data-testid="aki-companion">
    {message && <div className="aki-dialogue"><span>AKI <small>YOUR LANTERN KEEPER</small></span><p>{message}</p></div>}
    <div className="aki-stage" aria-hidden="true"><span className="aki-shadow" /><img key={`${mood}-${reactionKey}`} className="aki-sprite" src={asset(POSES[mood])} alt="" width="384" height="384" draggable="false" /><span className="aki-firefly" /><span className="aki-firefly second" /></div>
  </div>;
}
