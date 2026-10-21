import { useSyncExternalStore } from "react";
import { API } from "./account";
import { getSnapshot, streakCount, subscribe as subscribeSave } from "./srs";

/**
 * Daily reminders through Web Push. The browser's push subscription is the identity,
 * so guests can opt in too. The server reminds once a local day, at the chosen hour,
 * only when this device has not reported playing that day.
 *
 * - "install": an iPhone or iPad browser tab. Push works only from the Home Screen app.
 * - "unavailable": the API has no VAPID keys (or could not be reached), so nothing is offered.
 */
export type ReminderSupport = "checking" | "unsupported" | "install" | "unavailable" | "ready";
export type ReminderState = {
  support: ReminderSupport;
  enabled: boolean;
  blocked: boolean;
  hour: number;
  busy: boolean;
  message: string;
  offerDismissed: boolean;
};

const PREFS_KEY = "kanji-dash-reminders-v1";
export const DEFAULT_REMINDER_HOUR = 19;
/** "Not now" quiets the post-run offer for two weeks; settings always keep the switch. */
const OFFER_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type Prefs = { hour: number; dismissedAt: number; synced: string };

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") as Partial<Prefs>;
    return {
      hour: Number.isInteger(raw.hour) && raw.hour! >= 0 && raw.hour! <= 23 ? raw.hour! : DEFAULT_REMINDER_HOUR,
      dismissedAt: Number.isFinite(raw.dismissedAt) ? raw.dismissedAt! : 0,
      synced: typeof raw.synced === "string" ? raw.synced : "",
    };
  } catch { return { hour: DEFAULT_REMINDER_HOUR, dismissedAt: 0, synced: "" }; }
}

function writePrefs(patch: Partial<Prefs>) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch })); }
  catch { /* Reminders still work; the offer may simply return sooner. */ }
}

const initial: ReminderState = { support: "checking", enabled: false, blocked: false, hour: DEFAULT_REMINDER_HOUR, busy: false, message: "", offerDismissed: false };
let snapshot = initial;
const listeners = new Set<() => void>();
let started = false;
let publicKey = "";
let registration: ServiceWorkerRegistration | undefined;
let syncing = false;
let syncAgain = false;
/** What this page last confirmed with the server, so ordinary save changes during play cost nothing. */
let confirmed = "";

function update(patch: Partial<ReminderState>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function useReminders(): ReminderState {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot, () => initial);
}

/** A Safari tab on iPhone or iPad, where installing to the Home Screen unlocks push. */
function installUnlocksPush() {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.isSecureContext && appleMobile && !standalone;
}

function pushCapable() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function initializeReminders() {
  if (started || typeof window === "undefined") return;
  started = true;
  const prefs = readPrefs();
  update({ hour: prefs.hour, offerDismissed: Date.now() - prefs.dismissedAt < OFFER_SNOOZE_MS });
  // The service worker that receives pushes is only registered in production builds.
  if (!import.meta.env.PROD || !pushCapable()) {
    update({ support: import.meta.env.PROD && installUnlocksPush() ? "install" : "unsupported" });
    return;
  }
  void detect();
}

async function detect() {
  try {
    const response = await fetch(`${API}/reminders`, { headers: { Accept: "application/json" } });
    const body = response.ok ? await response.json() as { publicKey?: unknown } : {};
    publicKey = typeof body.publicKey === "string" ? body.publicKey : "";
  } catch { publicKey = ""; }
  if (!publicKey) { update({ support: "unavailable" }); return; }
  // Pushes need an active worker. On a first visit it activates once offline play is
  // cached; if storage is blocked it never does, and reminders simply stay hidden.
  registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription().catch(() => null);
  const key = subscription?.options.applicationServerKey;
  if (subscription && key && Notification.permission === "granted" && !sameBytes(new Uint8Array(key), keyBytes(publicKey))) {
    // The server's VAPID key changed. The old subscription can never be delivered to again.
    const old = subscription;
    subscription = await old.unsubscribe()
      .then(() => registration!.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
      .catch(() => null);
  }
  const blocked = Notification.permission === "denied";
  update({ support: "ready", blocked, enabled: !!subscription && Notification.permission === "granted" });
  // Learn about days played from now on, and refresh the zone or a rotated endpoint.
  subscribeSave(() => { void sync(); });
  void sync();
}

/** Tell the server this device's current play day, streak, zone and hour. Skips repeats. */
async function sync(force = false) {
  if (!snapshot.enabled || !registration) return;
  const save = getSnapshot();
  const play = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour: snapshot.hour, lastPlayedOn: save.streak.last, streak: streakCount(save) };
  const playKey = JSON.stringify(play);
  if (!force && playKey === confirmed) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) { update({ enabled: false }); return; }
    // The endpoint is part of the key: browsers may rotate it between visits.
    const key = JSON.stringify([subscription.endpoint, playKey]);
    if (force || key !== readPrefs().synced) {
      const response = await fetch(`${API}/reminders/subscription`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), ...play }) });
      if (!response.ok) throw new Error(`Reminder sync failed: ${response.status}`);
      writePrefs({ synced: key });
    }
    confirmed = playKey;
  } catch {
    // Offline or the API is busy: the next save change or visit tries again.
    if (force) throw new Error("sync");
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; void sync(); }
  }
}

/** Must run straight from a tap: browsers only show the permission prompt for a user gesture. */
export async function enableReminders(hour = snapshot.hour) {
  if (snapshot.support !== "ready" || !registration || snapshot.busy) return;
  update({ busy: true, message: "" });
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      update({ blocked: permission === "denied", message: permission === "denied" ? "Notifications are blocked. Allow them for Kanji Dash in your settings to get reminders." : "" });
      return;
    }
    const subscription = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    writePrefs({ hour });
    update({ enabled: true, blocked: false, hour });
    try { await sync(true); }
    catch {
      await subscription.unsubscribe().catch(() => {});
      update({ enabled: false, message: "Couldn’t turn on reminders right now. Check your connection and try again." });
      return;
    }
    update({ message: `Reminders on. We’ll nudge you at ${formatHour(hour)} on days you haven’t played.` });
  } catch {
    update({ message: "Your browser couldn’t turn on reminders. Try again from the installed app." });
  } finally {
    update({ busy: false });
  }
}

export async function disableReminders() {
  if (!registration || snapshot.busy) return;
  update({ busy: true, message: "" });
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      // Unsubscribing in the browser alone already stops delivery; the server forgets it too.
      void fetch(`${API}/reminders/unsubscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
      await subscription.unsubscribe();
    }
    writePrefs({ synced: "" });
    confirmed = "";
    update({ enabled: false, message: "Reminders off." });
  } catch {
    update({ message: "Couldn’t turn reminders off. Please try again." });
  } finally {
    update({ busy: false });
  }
}

export function setReminderHour(hour: number) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
  writePrefs({ hour });
  update({ hour, message: "" });
  void sync();
}

export function dismissReminderOffer() {
  writePrefs({ dismissedAt: Date.now() });
  update({ offerDismissed: true });
}

export const REMINDER_HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21];

export function formatHour(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
