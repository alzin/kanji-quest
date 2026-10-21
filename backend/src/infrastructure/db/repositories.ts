import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ProgressRepository, ReminderRepository, SessionRecord, SessionRepository, UserRepository } from "../../application/ports.js";
import type { GoogleIdentity, ProgressSnapshot, SaveData, User } from "../../domain/models.js";
import { REMINDER_GIVE_UP_DAYS, type ReminderRegistration, type ReminderSubscription } from "../../domain/reminders.js";

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
    // Each branch is one atomic statement, including the first-save race. An older client omits
    // the runner and checkpoint steps it predates; its write keeps what newer clients stored.
    const result = expectedVersion === 0
      ? await this.pool.query<ProgressRow>(`
          INSERT INTO user_progress (user_id, save_data, version)
          VALUES ($1, $2::jsonb, 1)
          ON CONFLICT (user_id) DO NOTHING
          RETURNING save_data, version`, [userId, JSON.stringify(save)])
      : await this.pool.query<ProgressRow>(`
          UPDATE user_progress
          SET save_data = $2::jsonb
                || CASE WHEN NOT ($2::jsonb ? 'runner') AND save_data ? 'runner'
                     THEN jsonb_build_object('runner', save_data->'runner') ELSE '{}'::jsonb END
                || CASE WHEN NOT ($2::jsonb ? 'checkpointSteps') AND save_data ? 'checkpointSteps'
                     THEN jsonb_build_object('checkpointSteps', save_data->'checkpointSteps') ELSE '{}'::jsonb END,
              version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND version = $3
          RETURNING save_data, version`, [userId, JSON.stringify(save), expectedVersion]);
    return result.rows[0] ? snapshot(result.rows[0]) : null;
  }
}

type ReminderRow = {
  endpoint: string; p256dh: string; auth: string; time_zone: string; reminder_hour: number;
  last_played_on: string | null; streak_count: number; last_sent_on: string | null;
};

export class PgReminderRepository implements ReminderRepository {
  constructor(private readonly pool: Pool) {}

  async save(r: ReminderRegistration): Promise<void> {
    // The newest play day wins, with its streak; an older tab cannot rewind either.
    await this.pool.query(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, time_zone, reminder_hour, last_played_on, streak_count)
      VALUES ($1, $2, $3, $4, $5, $6::date, $7)
      ON CONFLICT (endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, time_zone = EXCLUDED.time_zone,
            reminder_hour = EXCLUDED.reminder_hour,
            streak_count = CASE WHEN EXCLUDED.last_played_on IS NOT NULL
                                 AND (push_subscriptions.last_played_on IS NULL OR EXCLUDED.last_played_on >= push_subscriptions.last_played_on)
                               THEN EXCLUDED.streak_count ELSE push_subscriptions.streak_count END,
            last_played_on = GREATEST(push_subscriptions.last_played_on, EXCLUDED.last_played_on),
            updated_at = CURRENT_TIMESTAMP`,
    [r.endpoint, r.keys.p256dh, r.keys.auth, r.timeZone, r.hour, r.lastPlayedOn, r.streak]);
  }

  async remove(endpoint: string): Promise<void> {
    await this.pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  }

  async candidates(): Promise<ReminderSubscription[]> {
    // Every zone's "today" is within a day of UTC's, so this only skips rows that cannot be due.
    // A device that never reported a play day ages from when it subscribed; changing the
    // reminder time must not restart that clock, so this is created_at, not updated_at.
    const result = await this.pool.query<ReminderRow>(`
      SELECT endpoint, p256dh, auth, time_zone, reminder_hour, last_played_on::text, streak_count, last_sent_on::text
      FROM push_subscriptions
      WHERE COALESCE(last_played_on, created_at::date) > CURRENT_DATE - ($1::int + 2)`, [REMINDER_GIVE_UP_DAYS]);
    return result.rows.map((row) => ({
      endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth },
      timeZone: row.time_zone, hour: Number(row.reminder_hour),
      lastPlayedOn: row.last_played_on, streak: Number(row.streak_count), lastSentOn: row.last_sent_on,
    }));
  }

  async claim(endpoint: string, day: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE push_subscriptions SET last_sent_on = $2::date
      WHERE endpoint = $1
        AND (last_sent_on IS NULL OR last_sent_on < $2::date)
        AND (last_played_on IS NULL OR last_played_on < $2::date)`, [endpoint, day]);
    return result.rowCount === 1;
  }

  async release(endpoint: string, day: string, previous: string | null): Promise<void> {
    await this.pool.query("UPDATE push_subscriptions SET last_sent_on = $3::date WHERE endpoint = $1 AND last_sent_on = $2::date", [endpoint, day, previous]);
  }
}
