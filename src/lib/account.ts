import { useSyncExternalStore } from "react";
import { GUEST_SAVE_KEY, getSnapshot, normalizeSave, readLegacySave, replaceSave, resetGuestSave, setProgressPersistence, type SaveData } from "./srs";

export type AccountUser = { id: string; email: string; name: string; picture: string | null };
type CloudSave = { save: SaveData | null; version: number };
type Cache = { save: SaveData; version: number; dirty: boolean; confirmation?: Conflict["source"] };
type Conflict = { source: "guest" | "device" | "legacy"; cloud: CloudSave };
type AccountState = {
  user: AccountUser | null;
  phase: "checking" | "guest" | "loading" | "synced" | "saving" | "offline" | "conflict";
  message: string;
  legacyAvailable: boolean;
  guestAvailable: boolean;
  conflict: { source: Conflict["source"]; cloudRuns: number; deviceRuns: number } | null;
};

const API = (import.meta.env["VITE_API_URL"] || "/api").replace(/\/$/, "");
const initial: AccountState = { user: null, phase: "checking", message: "Checking cloud saves…", legacyAvailable: false, guestAvailable: false, conflict: null };
let snapshot = initial;
const listeners = new Set<() => void>();
let started = false;
let refreshing = false;
let saving = false;
let csrfToken = "";
let owner: string | null = null;
let version = 0;
let dirty = false;
let revision = 0;
let generation = 0;
let timer: number | undefined;
let conflict: Conflict | null = null;

function update(patch: Partial<AccountState>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function useAccount() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot, () => initial);
}

function hasProgress(save: SaveData) {
  return save.runsCompleted > 0 || save.coins > 0 || Object.keys(save.progress).length > 0 || save.clearedChapters.length > 0;
}

const cacheKey = (id: string) => `kanji-dash-account-v1:${encodeURIComponent(id)}`;

function readCache(id: string): Cache | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(cacheKey(id)) || "null") as Cache | null;
    return raw && Number.isSafeInteger(raw.version) && raw.version >= 0 && typeof raw.dirty === "boolean" && raw.save
      ? { save: normalizeSave(raw.save), version: raw.version, dirty: raw.dirty, ...(["guest", "device", "legacy"].includes(raw.confirmation || "") ? { confirmation: raw.confirmation } : {}) } : null;
  } catch { return null; }
}

function cache() {
  if (!owner) return;
  try { window.localStorage.setItem(cacheKey(owner), JSON.stringify({ save: getSnapshot(), version, dirty, confirmation: conflict?.source })); } catch { /* The tab still retains pending progress. */ }
}

function clearGuest() {
  try { window.sessionStorage.removeItem(GUEST_SAVE_KEY); } catch { /* Storage can be unavailable. */ }
}

class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) { super("Cloud request failed"); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API}${path}`, { ...init, credentials: "include", signal: controller.signal });
    const body: unknown = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new ApiError(response.status, body);
    return body as T;
  } finally { window.clearTimeout(timeout); }
}

function normalizeCloud(value: CloudSave): CloudSave {
  if (!value || !Number.isSafeInteger(value.version) || value.version < 0 || !("save" in value)) throw new Error("Invalid cloud save");
  return { version: value.version, save: value.save === null ? null : normalizeSave(value.save) };
}

function presentConflict(source: Conflict["source"], cloud: CloudSave) {
  conflict = { source, cloud };
  cache();
  update({ phase: "conflict", message: "Choose which progress to keep before cloud saving resumes.", conflict: {
    source, cloudRuns: cloud.save?.runsCompleted ?? 0, deviceRuns: getSnapshot().runsCompleted,
  } });
}

function scheduleSave() {
  window.clearTimeout(timer);
  if (!conflict && owner) timer = window.setTimeout(() => { void flush(); }, 450);
}

function onProgress() {
  dirty = true;
  revision += 1;
  cache();
  if (conflict) {
    presentConflict(conflict.source, conflict.cloud);
  } else {
    update({ phase: "saving", message: "Saving progress…" });
    scheduleSave();
  }
}

function becomeGuest(message = "Progress lasts in this tab. Sign in with Google to save across devices.") {
  generation += 1;
  window.clearTimeout(timer);
  owner = null;
  csrfToken = "";
  dirty = false;
  conflict = null;
  resetGuestSave();
  update({ user: null, phase: "guest", message, conflict: null, guestAvailable: false });
}

async function flush() {
  if (!owner || !dirty || conflict || saving || refreshing) return;
  const id = owner;
  const currentGeneration = generation;
  const sentRevision = revision;
  const sentSave = getSnapshot();
  saving = true;
  update({ phase: "saving", message: "Saving progress…" });
  try {
    const result = normalizeCloud(await request<CloudSave>("/progress", {
      method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ save: sentSave, expectedVersion: version }),
    }));
    if (generation !== currentGeneration || owner !== id) return;
    version = result.version;
    dirty = revision !== sentRevision;
    cache();
    if (!dirty) update({ phase: "synced", message: "Progress saved to your account." });
  } catch (error) {
    if (generation !== currentGeneration || owner !== id) return;
    if (error instanceof ApiError && error.status === 409) {
      try {
        const body = error.body as { current: CloudSave };
        presentConflict("device", normalizeCloud(body.current));
      } catch { update({ phase: "offline", message: "Cloud save unavailable. Your changes are waiting on this device." }); }
    } else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      becomeGuest("Your session ended. Sign in again to recover this account’s pending progress.");
    } else {
      update({ phase: "offline", message: "Not saved to the cloud. Your changes are waiting on this device. Retry when connected." });
    }
  } finally {
    saving = false;
    if (generation === currentGeneration && dirty && !conflict && snapshot.phase === "saving") scheduleSave();
  }
}

/** Fetch identity before reading any account cache; an old account is never a guest save. */
export async function refreshAccount() {
  if (refreshing || saving || conflict) return;
  refreshing = true;
  const currentGeneration = generation;
  let shouldSave = false;
  try {
    const session = await request<{ user: AccountUser | null; csrfToken?: string }>("/auth/session");
    if (generation !== currentGeneration) return;
    if (!session.user) {
      if (owner) becomeGuest("Your session ended. Sign in again to recover your account’s progress.");
      else update({ user: null, phase: "guest", message: snapshot.message.startsWith("Google sign-in") ? snapshot.message : "Progress lasts in this tab. Sign in with Google to save across devices.", conflict: null });
      return;
    }
    if (!session.csrfToken) throw new Error("Missing session protection");
    const id = session.user.id;
    if (owner && owner !== id) becomeGuest();
    csrfToken = session.csrfToken;
    update({ user: session.user, phase: "loading", message: "Loading your cloud progress…" });
    const cloud = normalizeCloud(await request<CloudSave>("/progress", { headers: { "X-CSRF-Token": csrfToken } }));
    // becomeGuest above increments generation only when switching account; this request
    // still belongs to the identity just returned by /auth/session.
    if (snapshot.user?.id !== id) return;
    const guest = owner ? null : getSnapshot();
    const local: Cache | null = owner === id ? { save: getSnapshot(), version, dirty } : readCache(id);
    owner = id;
    version = cloud.version;
    dirty = false;
    conflict = null;
    setProgressPersistence(onProgress);
    update({ conflict: null });

    if (local?.dirty) {
      replaceSave(local.save);
      dirty = true;
      // Preserve the version the offline edit was based on until a conflict is resolved.
      version = local.version;
      if (JSON.stringify(local.save) === JSON.stringify(cloud.save)) {
        version = cloud.version;
        dirty = false;
      } else if (local.confirmation || local.version !== cloud.version) presentConflict(local.confirmation || "device", cloud);
    } else if (guest && hasProgress(guest)) {
      replaceSave(guest);
      dirty = true;
      if (cloud.save && JSON.stringify(guest) !== JSON.stringify(cloud.save)) presentConflict("guest", cloud);
      else if (cloud.save) dirty = false;
    } else replaceSave(cloud.save);

    if (guest && hasProgress(guest) && local?.dirty) update({ guestAvailable: true });
    else if (guest) { clearGuest(); update({ guestAvailable: false }); }
    cache();
    if (!conflict) {
      update({ phase: dirty ? "saving" : "synced", message: dirty ? "Saving progress…" : "Progress saved to your account." });
      shouldSave = dirty;
    }
  } catch {
    update({ phase: "offline", message: owner ? "Cloud saves are unavailable. Your changes are waiting on this device." : "Cloud saves are unavailable. You can keep playing in this tab and retry." });
  } finally {
    refreshing = false;
    if (shouldSave) scheduleSave();
  }
}

export function initializeAccount() {
  if (started || typeof window === "undefined") return;
  started = true;
  getSnapshot();
  const url = new URL(window.location.href);
  const authError = url.searchParams.get("auth") === "error";
  if (url.searchParams.has("auth")) {
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  update({ legacyAvailable: !!readLegacySave(), ...(authError ? { message: "Google sign-in did not finish. You can try again and continue playing." } : {}) });
  void refreshAccount();
  window.addEventListener("online", () => { void refreshAccount(); });
  window.addEventListener("focus", () => { void refreshAccount(); });
  window.addEventListener("storage", (event) => {
    if (event.key === "kanji-dash-signout") {
      if (owner) becomeGuest("Signed out. Sign in with Google to save future progress.");
      void refreshAccount();
    }
  });
}

export function beginGoogleSignIn() {
  window.location.assign(`${API}/auth/google`);
}

export async function signOut() {
  if (!snapshot.user || refreshing || saving) return;
  const previousPhase = snapshot.phase;
  update({ phase: "loading", message: "Signing out…" });
  try {
    await request("/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
    finishSignOut();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { finishSignOut(); return; }
    update({ phase: previousPhase, message: "Sign-out could not reach the server. Please retry." });
  }
}

function finishSignOut() {
  becomeGuest("Signed out. Progress lasts in this tab; sign in with Google to save it.");
  try { window.localStorage.setItem("kanji-dash-signout", String(Date.now())); } catch { /* Other tabs verify their sessions on focus. */ }
}

export function resolveProgress(choice: "cloud" | "device") {
  if (!owner || !conflict) return;
  const source = conflict.source;
  version = conflict.cloud.version;
  if (choice === "cloud") replaceSave(conflict.cloud.save);
  dirty = choice === "device";
  revision += 1;
  conflict = null;
  if (source === "guest") { clearGuest(); update({ guestAvailable: false }); }
  cache();
  update({ conflict: null, phase: dirty ? "saving" : "synced", message: dirty ? "Saving your chosen progress…" : "Cloud progress restored." });
  if (dirty) scheduleSave();
}

export function importLegacyProgress() {
  const legacy = readLegacySave();
  if (!owner || !legacy || dirty || conflict || snapshot.phase !== "synced") return;
  const cloud = { save: getSnapshot(), version };
  replaceSave(legacy);
  dirty = true;
  cache();
  presentConflict("legacy", cloud);
}

export function importGuestProgress() {
  if (!owner || dirty || conflict || snapshot.phase !== "synced") return;
  try {
    const raw = window.sessionStorage.getItem(GUEST_SAVE_KEY);
    if (!raw) return;
    const guest = normalizeSave(JSON.parse(raw));
    const cloud = { save: getSnapshot(), version };
    replaceSave(guest);
    dirty = true;
    presentConflict("guest", cloud);
  } catch { update({ guestAvailable: false }); }
}
