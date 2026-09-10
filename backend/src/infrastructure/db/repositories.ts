import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ProgressRepository, SessionRecord, SessionRepository, UserRepository } from "../../application/ports.js";
import type { GoogleIdentity, ProgressSnapshot, SaveData, User } from "../../domain/models.js";

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async upsertGoogle(identity: GoogleIdentity): Promise<User> {
    // Google subject is stable. An email match must never link two identities.
    const result = await this.pool.query<User>(`
      INSERT INTO users (id, google_subject, email, name, picture)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (google_subject) DO UPDATE
        SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture,
            updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, name, picture`,
    [randomUUID(), identity.subject, identity.email, identity.name, identity.picture]);
    return result.rows[0]!;
  }
}

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(session: { tokenHash: string; userId: string; csrfToken: string; expiresAt: Date }): Promise<void> {
    await this.pool.query(`
      INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at)
      VALUES ($1, $2, $3, $4)`,
    [session.tokenHash, session.userId, session.csrfToken, session.expiresAt]);
  }

  async find(tokenHash: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<User & { csrf_token: string; expires_at: Date }>(`
      SELECT u.id, u.email, u.name, u.picture, s.csrf_token, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP`, [tokenHash]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      user: { id: row.id, email: row.email, name: row.name, picture: row.picture },
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    };
  }

  async delete(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }
}

type ProgressRow = { save_data: SaveData; version: string };
const snapshot = (row: ProgressRow): ProgressSnapshot => ({ save: row.save_data, version: Number(row.version) });

export class PgProgressRepository implements ProgressRepository {
  constructor(private readonly pool: Pool) {}

  async get(userId: string): Promise<ProgressSnapshot> {
    const result = await this.pool.query<ProgressRow>("SELECT save_data, version FROM user_progress WHERE user_id = $1", [userId]);
    return result.rows[0] ? snapshot(result.rows[0]) : { save: null, version: 0 };
  }

  async save(userId: string, save: SaveData, expectedVersion: number): Promise<ProgressSnapshot | null> {
    // Each branch is one atomic statement, including the first-save race.
    const result = expectedVersion === 0
      ? await this.pool.query<ProgressRow>(`
          INSERT INTO user_progress (user_id, save_data, version)
          VALUES ($1, $2::jsonb, 1)
          ON CONFLICT (user_id) DO NOTHING
          RETURNING save_data, version`, [userId, JSON.stringify(save)])
      : await this.pool.query<ProgressRow>(`
          UPDATE user_progress
          SET save_data = $2::jsonb, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND version = $3
          RETURNING save_data, version`, [userId, JSON.stringify(save), expectedVersion]);
    return result.rows[0] ? snapshot(result.rows[0]) : null;
  }
}
