import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ForestBridge } from "./ForestScene";

export function ForestCanvas({ bridge }: { bridge: ForestBridge }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    let game: { destroy: (remove: boolean) => void } | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const originalReady = bridge.onReady;
    bridge.onReady = () => {
      clearTimeout(timer);
      originalReady();
    };
    timer = setTimeout(() => {
      if (!disposed) setError(true);
    }, 20000);
    import("./ForestScene")
      .then(({ mountForest }) => {
        if (disposed || !host.current) return;
        game = mountForest(host.current, bridge);
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
    <div
      className="forest-canvas"
      ref={host}
      role="img"
      aria-label="Playable forest with a lantern, river crossing, and shrine. Use WASD or arrow keys to walk, or tap the ground."
    >
      {error &&
        createPortal(
          <div className="forest-load-error" role="alert">
            <h2>The forest couldn’t load.</h2>
            <p>
              Please reload to try again. Your saved learning progress is safe.
            </p>
            <button onClick={() => location.reload()}>Reload the forest</button>
            <a href={`${import.meta.env.BASE_URL}camp`}>Return to camp</a>
          </div>,
          document.body,
        )}
    </div>
  );
}
