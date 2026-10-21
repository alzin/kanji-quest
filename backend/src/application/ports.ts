import type { GoogleIdentity, ProgressSnapshot, SaveData, User } from "../domain/models.js";
import type { PushTarget, ReminderMessage, ReminderRegistration, ReminderSubscription } from "../domain/reminders.js";

export interface UserRepository {
  upsertGoogle(identity: GoogleIdentity): Promise<User>;
}

export type SessionRecord = { user: User; csrfToken: string; expiresAt: Date };

export interface SessionRepository {
  create(session: { tokenHash: string; userId: string; csrfToken: string; expiresAt: Date }): Promise<void>;
  find(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
}

export interface ProgressRepository {
  get(userId: string): Promise<ProgressSnapshot>;
  /** Atomic compare-and-set. A stale expected version returns null. */
  save(userId: string, save: SaveData, expectedVersion: number): Promise<ProgressSnapshot | null>;
}

export interface ReminderRepository {
  /** Insert or refresh a browser's subscription. A stale device never moves lastPlayedOn back. */
  save(registration: ReminderRegistration): Promise<void>;
  remove(endpoint: string): Promise<void>;
  /** Subscriptions that might be due; the service decides on each player's own clock. */
  candidates(): Promise<ReminderSubscription[]>;
  /** Atomically mark today's reminder sent. False if already sent or the player has played. */
  claim(endpoint: string, day: string): Promise<boolean>;
  /** Undo a claim whose delivery failed, so the next dispatch retries it. */
  release(endpoint: string, day: string, previous: string | null): Promise<void>;
  /** Note the first day of a run of refusals; the claim stands, so it is tried again tomorrow. */
  markRejected(endpoint: string, day: string): Promise<void>;
  /** A delivery went through, ending any run of refusals. */
  markDelivered(endpoint: string): Promise<void>;
}

/**
 * "gone" means the push service no longer knows this subscription. "rejected" means it
 * refused this one (a bad or mismatched key, say): retrying within the day will not help.
 * "failed" is anything that may pass on the next try, such as a timeout or a busy service.
 */
export type PushResult = "sent" | "gone" | "rejected" | "failed";

export interface PushSender {
  send(target: PushTarget, message: ReminderMessage): Promise<PushResult>;
}
