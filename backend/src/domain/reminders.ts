export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

/** What a player's device reports. Days are YYYY-MM-DD on the player's own calendar. */
export type ReminderRegistration = PushTarget & {
  timeZone: string;
  hour: number;
  lastPlayedOn: string | null;
  streak: number;
};

export type ReminderSubscription = ReminderRegistration & { lastSentOn: string | null };

export type ReminderMessage = { title: string; body: string; tag: string };

/** A player who has not played for this long has moved on; stop reminding them. */
export const REMINDER_GIVE_UP_DAYS = 30;

/** Calendar day and hour on the player's clock, from the zone their device reported. */
export function localClock(timeZone: string, now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return { day: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The local day to remind on, or null when the player already played, was already
 * reminded, it is too early, or they have been away too long to keep nudging. */
export function reminderDay(sub: ReminderSubscription, now: Date): string | null {
  const { day, hour } = localClock(sub.timeZone, now);
  if (hour < sub.hour) return null;
  // ISO days compare as strings; a device clock running ahead still counts as played.
  if (sub.lastPlayedOn !== null && sub.lastPlayedOn >= day) return null;
  if (sub.lastSentOn !== null && sub.lastSentOn >= day) return null;
  if (sub.lastPlayedOn !== null && daysBetween(sub.lastPlayedOn, day) > REMINDER_GIVE_UP_DAYS) return null;
  return day;
}

export function reminderMessage(sub: ReminderSubscription, day: string): ReminderMessage {
  // Only a streak that played yesterday is still alive today.
  const alive = sub.lastPlayedOn !== null && daysBetween(sub.lastPlayedOn, day) === 1 && sub.streak >= 2;
  return alive
    ? { title: `Keep your ${sub.streak}-day streak alive 🔥`, body: "One short run today keeps the flame lit.", tag: "daily-reminder" }
    : { title: "Your kanji are waiting 🏮", body: "A few minutes today keeps them fresh. Ready for a quick run?", tag: "daily-reminder" };
}
