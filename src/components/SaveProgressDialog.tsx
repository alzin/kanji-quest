import { useEffect, useRef } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { dismissAccountPrompt, GUEST_MESSAGE, importGuestProgress, importLegacyProgress, refreshAccount, resolveProgress, useAccount } from "@/lib/account";
import { useSave } from "@/lib/srs";

const actionClass = "min-h-11 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const quietClass = "min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** What the guest stands to lose, in their own numbers. */
function atRisk(runs: number, gates: number, coins: number) {
  const parts: string[] = [];
  if (runs) parts.push(`${runs} ${runs === 1 ? "run" : "runs"}`);
  if (gates) parts.push(`${gates} ${gates === 1 ? "checkpoint" : "checkpoints"}`);
  if (coins) parts.push(`${coins} mon`);
  const earned = parts.length ? `${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`}` : "Your progress";
  return `${earned} — saved only in this tab, and gone once you close it. Sign in to keep everything on every device.`;
}

export function SaveProgressDialog() {
  const account = useAccount();
  const save = useSave();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = account.prompt;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    // Focus the dialog itself: no action is pre-armed for a stray Enter, and the title is announced.
    dialog.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const busy = account.phase === "loading" || account.phase === "saving";
  const restorable = !!account.user && !account.conflict && (account.legacyAvailable || account.guestAvailable);
  const title = account.conflict
    ? account.conflict.source === "legacy" ? "Import your previous browser save" : "Two versions of your progress are available"
    : account.phase === "offline" ? "Not saved to the cloud"
    : restorable ? "Earlier progress found"
    : account.user ? "Progress saved"
    : "Keep your progress";

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby="save-progress-title"
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); dismissAccountPrompt(); }}
      onClick={(event) => { if (event.target === event.currentTarget) dismissAccountPrompt(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      className="save-dialog outline-none m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-paper p-0 text-foreground shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
          <AppIcon name={account.conflict || account.phase === "offline" ? "alert" : "cloud"} className="h-5 w-5" />
        </span>
        <h2 id="save-progress-title" className="mt-3 font-serif text-lg font-bold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {account.conflict
            ? `Cloud: ${account.conflict.cloudRuns} completed runs. ${account.conflict.source === "legacy" ? "Previous browser save" : "This device"}: ${account.conflict.deviceRuns} completed runs. Choosing one replaces the other; they are not combined.`
            : account.phase === "offline" || restorable || account.user
              ? account.message
              : atRisk(save.runsCompleted, save.gatesCleared, save.coins)}
        </p>
        {!account.user && account.message !== GUEST_MESSAGE && account.phase === "guest" && (
          <p className="mt-2 text-sm font-bold text-destructive">{account.message}</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {account.conflict && (
            <>
              <button className={actionClass} onClick={() => resolveProgress("cloud")}>Keep cloud progress</button>
              <button className={actionClass} onClick={() => resolveProgress("device")}>{account.conflict.source === "legacy" ? "Use previous browser save" : "Use this device’s progress"}</button>
            </>
          )}
          {!account.conflict && account.phase === "offline" && (
            <button className={actionClass} onClick={() => { void refreshAccount(); }}>Retry cloud connection</button>
          )}
          {!account.conflict && restorable && account.legacyAvailable && (
            <button className={actionClass} disabled={busy || account.phase !== "synced"} onClick={importLegacyProgress}>Import previous browser save</button>
          )}
          {!account.conflict && restorable && account.guestAvailable && (
            <button className={actionClass} disabled={busy || account.phase !== "synced"} onClick={importGuestProgress}>Import this tab’s guest progress</button>
          )}
          {!account.user && <GoogleSignInButton disabled={account.phase === "checking"} />}
          <button className={quietClass} onClick={dismissAccountPrompt}>
            {account.user ? "Close" : "Not now — keep learning"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
