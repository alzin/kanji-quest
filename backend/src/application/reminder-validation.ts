import { AppError } from "../domain/errors.js";
import type { ReminderRegistration } from "../domain/reminders.js";

/** The dispatcher POSTs to stored endpoints, so only accept the browsers' push services. */
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function invalid(field: string): never {
  throw new AppError("INVALID_REMINDER", `Invalid reminder field: ${field}.`, 400);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

export function parseEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) invalid("endpoint");
  let url: URL;
  try { url = new URL(value); } catch { invalid("endpoint"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) invalid("endpoint");
  if (!PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) invalid("endpoint");
  return value;
}

function key(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length < 16 || value.length > max || !BASE64URL.test(value)) invalid(field);
  return value;
}

function timeZone(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) invalid("timeZone");
  try { return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone; }
  catch { invalid("timeZone"); }
}

function day(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !DAY.test(value)) invalid("lastPlayedOn");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid("lastPlayedOn");
  return value;
}

export function parseReminderRegistration(value: unknown): ReminderRegistration {
  const raw = record(value, "body");
  if (Object.keys(raw).some((k) => !["subscription", "timeZone", "hour", "lastPlayedOn", "streak", "freezes"].includes(k))) invalid("body");
  // PushSubscription.toJSON() also carries expirationTime, which push services leave null.
  const subscription = record(raw["subscription"], "subscription");
  const keys = record(subscription["keys"], "subscription.keys");
  const hour = raw["hour"];
  if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) invalid("hour");
  const streak = raw["streak"];
  if (typeof streak !== "number" || !Number.isSafeInteger(streak) || streak < 0) invalid("streak");
  // Installed apps still on an older build do not send freezes yet.
  const freezes = raw["freezes"] ?? 0;
  if (typeof freezes !== "number" || !Number.isSafeInteger(freezes) || freezes < 0) invalid("freezes");
  return {
    endpoint: parseEndpoint(subscription["endpoint"]),
    keys: { p256dh: key(keys["p256dh"], "subscription.keys.p256dh", 256), auth: key(keys["auth"], "subscription.keys.auth", 64) },
    timeZone: timeZone(raw["timeZone"]),
    hour,
    lastPlayedOn: day(raw["lastPlayedOn"]),
    streak: Math.min(streak, 2_147_483_647),
    freezes: Math.min(freezes, 32_767),
  };
}
