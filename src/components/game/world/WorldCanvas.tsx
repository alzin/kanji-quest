import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorldBridge } from "./WorldScene";

/** Hosts the Phaser overworld; Phaser loads lazily and is destroyed with its host. */
export function WorldCanvas({ bridge }: { bridge: WorldBridge }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let game: { destroy: (remove: boolean) => void } | undefined;
    const originalReady = bridge.onReady;
    const timer = setTimeout(() => { if (!disposed) setError(true); }, 20000);
    bridge.onReady = () => {
      clearTimeout(timer);
      originalReady();
    };
    import("./WorldScene")
      .then(({ mountWorld }) => {
        if (disposed || !host.current) return;
        game = mountWorld(host.current, bridge);
      })
      .catch(() => {
        if (!disposed) {
          clearTimeout(timer);
          setError(true);
        }
      });
    return () => {
      disposed = true;
      clearTimeout(timer);
      game?.destroy(true);
      bridge.onReady = originalReady;
    };
  }, [bridge]);
  return (
    <div className="forest-canvas" ref={host} role="img" aria-label="The Kanji Journey world map: five roads from N5 in the south to N1 in the north, with every checkpoint along the way. Drag to explore, or use the arrow keys to walk from stop to stop.">
      {error &&
        createPortal(
          <div className="forest-load-error" role="alert">
            <h2>The map couldn’t load.</h2>
            <p>Please reload to try again. Your saved learning progress is safe.</p>
            <button onClick={() => location.reload()}>Reload the map</button>
          </div>,
          document.body,
        )}
    </div>
  );
}
