import { AppIcon } from "@/components/AppIcon";
import { openAccountPrompt, useAccount } from "@/lib/account";

const chipClass = "flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function givenName(name: string, email: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.split(/\s+/)[0]! : email.split("@")[0]!;
}

/** Identity only: a name when all is well, an action when saving actually needs one. */
export function AccountStatus() {
  const account = useAccount();
  // A guest has nothing pending in the cloud, so an unreachable backend is not their alarm.
  const needsAction = account.phase === "conflict" || (account.phase === "offline" && !!account.user);

  return (
    <>
      <span className="sr-only" aria-live="polite">{account.message}</span>
      {needsAction ? (
        <button type="button" onClick={openAccountPrompt} className={`${chipClass} bg-destructive/10 text-destructive hover:bg-destructive/15`}>
          <AppIcon name="alert" className="h-4 w-4" />
          <span>Not saved</span>
        </button>
      ) : account.user ? (
        <span className={`${chipClass} text-muted-foreground`} title={account.user.name || account.user.email}>
          {account.user.picture ? (
            <img src={account.user.picture} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full object-cover" width={24} height={24} />
          ) : (
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
              {givenName(account.user.name, account.user.email).charAt(0).toUpperCase()}
            </span>
          )}
          <span className="sr-only">Signed in as {account.user.name || account.user.email}</span>
          <span aria-hidden="true" className="hidden max-w-24 truncate sm:inline">{givenName(account.user.name, account.user.email)}</span>
        </span>
      ) : (
        <button type="button" onClick={openAccountPrompt} disabled={account.phase === "checking"} aria-label="Save your progress" className={`${chipClass} text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50`}>
          <AppIcon name="cloud" className="h-4 w-4" />
          <span className="hidden sm:inline">Save progress</span>
        </button>
      )}
    </>
  );
}
