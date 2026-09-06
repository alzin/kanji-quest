import { useEffect } from "react";

/** Register once for every entry route, including links straight into a run. */
export function PwaRegistration() {
  useEffect(() => {
    if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registering = false;
    let registration: ServiceWorkerRegistration | undefined;

    const register = async () => {
      if (registering || disposed) return;
      registering = true;
      try {
        const result = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
          updateViaCache: "none",
        });
        if (!disposed) registration = result;
      } catch (error) {
        // The online game remains usable if browser settings block offline storage.
        console.warn("Kanji Dash could not enable offline play.", error);
      } finally {
        registering = false;
      }
    };

    const checkForUpdate = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        if (registration) {
          void registration.update().catch(() => {
            // Retry on the next visit or when connectivity returns.
          });
        } else {
          void register();
        }
      }
    };

    // Hydration is complete; don't let a stalled external font block offline setup.
    void register();
    window.addEventListener("online", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      disposed = true;
      window.removeEventListener("online", checkForUpdate);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  return null;
}
