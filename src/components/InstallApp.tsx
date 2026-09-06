import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type MobilePlatform = "ios" | "android" | null;
type InstallationUnavailable = "insecure" | "development" | null;

type InstallContextValue = {
  ready: boolean;
  platform: MobilePlatform;
  installPrompt: InstallPromptEvent | null;
  standalone: boolean;
  installed: boolean;
  installing: boolean;
  message: string;
  unavailable: InstallationUnavailable;
  install: () => Promise<void>;
};

const InstallContext = createContext<InstallContextValue | null>(null);

/** Keep the browser's one-use prompt alive when visitors move between game screens. */
export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<MobilePlatform>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState<InstallationUnavailable>(null);
  const prompting = useRef(false);

  useEffect(() => {
    const unavailableReason = !window.isSecureContext ? "insecure" : import.meta.env.DEV ? "development" : null;
    setUnavailable(unavailableReason);

    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent)
      || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /Android/.test(userAgent) ? "android" : null);

    const displayMode = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
    const isStandalone = () => displayMode.matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const syncDisplayMode = () => setStandalone(isStandalone());
    syncDisplayMode();
    setReady(true);

    const onInstallPrompt = (event: Event) => {
      if (isStandalone() || unavailableReason) return;
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setMessage("");
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", syncDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", syncDisplayMode);
    };
  }, []);

  async function install() {
    if (!installPrompt || unavailable || prompting.current) return;
    prompting.current = true;
    setInstalling(true);
    setMessage("");
    // A browser install prompt can only be used once.
    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
      } else {
        setMessage("You can install later using your browser's menu.");
      }
    } catch {
      setMessage("The install prompt couldn't open. Try your browser's menu instead.");
    } finally {
      prompting.current = false;
      setInstalling(false);
    }
  }

  return (
    <InstallContext.Provider value={{ ready, platform, installPrompt, standalone, installed, installing, message, unavailable, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function InstallApp() {
  const context = useContext(InstallContext);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();

  if (!context || !context.ready || context.standalone || context.installed) return null;

  const { platform, installPrompt, installing, message, unavailable, install } = context;

  async function handleInstall() {
    if (installPrompt && !unavailable) await install();
    setHelpOpen(true);
  }

  return (
    <section aria-labelledby="install-app-title" className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="install-app-title" className="font-serif font-bold">Keep Kanji Dash one tap away</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add the game to your home screen for your next daily run.</p>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          aria-controls={helpId}
          aria-expanded={installPrompt ? undefined : helpOpen}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {installing ? "Opening install…" : "Install app"}
        </button>
      </div>
      <details id={helpId} open={helpOpen} onToggle={(event) => setHelpOpen(event.currentTarget.open)} className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {unavailable ? "How to test installation locally" : platform === "ios" ? "How to install on iPhone or iPad" : "How to install from your browser"}
        </summary>
        {unavailable ? (
          <p className="mt-2 text-muted-foreground">
            {unavailable === "insecure" ? "This network address uses HTTP. PWA installation and offline play need a secure connection." : "This is the development server, where offline support is disabled."}
            {" "}Open the production preview over trusted HTTPS to test installation and offline play on your phone.
            The game still works online here.
          </p>
        ) : platform === "ios" ? (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Open this page in Safari, then tap Share.</li>
            <li>Choose Add to Home Screen (you may need to scroll).</li>
            <li>If shown, turn on Open as Web App, then tap Add.</li>
          </ol>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Open your browser's menu and choose Install app or Add to Home screen when available,
            then follow the instructions. On Android, Chrome supports installing this game.
          </p>
        )}
      </details>
      <p role="status" className={message ? "mt-3 text-sm text-muted-foreground" : "sr-only"}>{message}</p>
    </section>
  );
}
