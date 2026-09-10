import type { GoogleIdentity, ProgressSnapshot, SaveData, User } from "../domain/models.js";

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
