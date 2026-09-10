import { useState } from "react";
import { beginGoogleSignIn, importGuestProgress, importLegacyProgress, refreshAccount, resolveProgress, signOut, useAccount } from "@/lib/account";

const buttonClass = "min-h-11 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AccountStatus() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const busy = account.phase === "checking" || account.phase === "loading" || account.phase === "saving";
  const needsAttention = account.phase === "offline" || account.phase === "conflict";
  const expanded = open || needsAttention;
  return (
    <section aria-label="Account and cloud progress" className="border-t border-border/70 bg-card/70">
      <div className="mx-auto max-w-4xl px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <p className="font-bold">{account.user ? `Hi, ${account.user.name || account.user.email}` : "Guest adventure"}</p>
            <p aria-live="polite" className="text-muted-foreground">{account.message}</p>
          </div>
          {account.user ? (
            <button className={buttonClass} aria-expanded={expanded} aria-controls="account-details" onClick={() => setOpen(!open)}>Account</button>
          ) : (
            <button className={`${buttonClass} shrink-0`} onClick={beginGoogleSignIn} disabled={account.phase === "checking"}>Continue with Google</button>
          )}
        </div>
        {(expanded || (!account.user && account.message.startsWith("Google sign-in"))) && (
          <div id="account-details" className="mt-2 rounded-xl border border-border bg-background p-3 text-xs leading-relaxed">
            {account.user && <p className="break-all text-muted-foreground">{account.user.email}</p>}
            {account.conflict && (
              <div>
                <p className="font-bold">{account.conflict.source === "legacy" ? "Import your previous browser save" : "Two versions of your progress are available"}</p>
                <p className="mt-1 text-muted-foreground">Cloud: {account.conflict.cloudRuns} completed runs. {account.conflict.source === "legacy" ? "Previous browser save" : "This device"}: {account.conflict.deviceRuns} completed runs. Choosing one replaces the other; they are not combined.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={buttonClass} onClick={() => resolveProgress("cloud")}>Keep cloud progress</button>
                  <button className={buttonClass} onClick={() => resolveProgress("device")}>{account.conflict.source === "legacy" ? "Use previous browser save" : "Use this device’s progress"}</button>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {account.phase === "offline" && <button className={buttonClass} onClick={() => { void refreshAccount(); }}>Retry cloud connection</button>}
              {account.user && account.legacyAvailable && !account.conflict && <button className={buttonClass} disabled={busy || account.phase !== "synced"} onClick={importLegacyProgress}>Import previous browser save</button>}
              {account.user && account.guestAvailable && !account.conflict && <button className={buttonClass} disabled={busy || account.phase !== "synced"} onClick={importGuestProgress}>Import this tab’s guest progress</button>}
              {account.user && <button className={buttonClass} disabled={busy} onClick={() => { void signOut(); }}>Sign out</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
