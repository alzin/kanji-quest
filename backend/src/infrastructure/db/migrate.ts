import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";

export type Migration = { name: string; sql: string };

export async function readMigrations(directory: URL): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error("No database migrations found.");
  return Promise.all(files.map(async (name) => ({ name, sql: await readFile(new URL(name, directory), "utf8") })));
}

/** One transaction and transaction-scoped lock serialize concurrent deploys. */
export async function runMigrations(pool: Pool, migrations: Migration[]): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(189238711, 1)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    const applied: string[] = [];
    for (const migration of migrations) {
      // Git may check out the same SQL as CRLF on Windows and LF in deployment.
      // Canonicalize only line endings; substantive edits must still fail.
      const checksum = createHash("sha256").update(migration.sql.replace(/\r\n?/g, "\n")).digest("hex");
      const existing = await client.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name = $1", [migration.name]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration ${migration.name} has changed; create a new migration instead.`);
        continue;
      }
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, checksum]);
      applied.push(migration.name);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
