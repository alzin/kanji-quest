import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { ProgressService } from "../src/application/progress-service.js";
import { parseSaveData } from "../src/application/progress-validation.js";
import { CHAPTER_IDS, CURRICULUM_VERSION, KANJI_CHARACTERS } from "../src/domain/curriculum.js";
import { AppError } from "../src/domain/errors.js";
import type { SaveData } from "../src/domain/models.js";
import { readMigrations, runMigrations } from "../src/infrastructure/db/migrate.js";
import { deleteExpiredSessions } from "../src/infrastructure/db/maintenance.js";
import { createDatabasePool } from "../src/infrastructure/db/pool.js";
import { PgProgressRepository, PgSessionRepository, PgUserRepository } from "../src/infrastructure/db/repositories.js";

const emptySave = (): SaveData => ({
  curriculumVersion: 2, unlockedChapters: [], progress: {},
  streak: { count: 0, last: "" }, coins: 0, runsCompleted: 0,
  gatesCleared: 0, clearedChapters: [], selectedLevel: "N5",
});

test("progress validation accepts current saves, copies input, and rejects corrupt payloads", () => {
  const save = emptySave();
  save.progress["一"] = { mastery: 1, ivl: 0.02, ease: 2.58, due: Date.now(), correct: 1, wrong: 0 };
  save.streak = { count: 1, last: "2026-09-10" };
  save.unlockedChapters = [14, 13];
  const parsed = parseSaveData(save);
  assert.deepEqual(parsed.unlockedChapters, [13, 14]);
  assert.notEqual(parsed.progress, save.progress);
  assert.notEqual(parsed.progress["一"], save.progress["一"]);
  const malformed: unknown[] = [
    null, [], {}, { ...save, userId: randomUUID() },
    { ...save, curriculumVersion: 1 }, { ...save, selectedLevel: "N1" },
    { ...save, coins: -1 }, { ...save, runsCompleted: 1.1 },
    { ...save, coins: Number.MAX_SAFE_INTEGER + 1 },
    { ...save, unlockedChapters: [56] }, { ...save, clearedChapters: [1, 1], gatesCleared: 2 },
    { ...save, clearedChapters: [1], gatesCleared: 0 },
    { ...save, streak: { count: 1, last: "" } },
    { ...save, streak: { count: 1, last: "2026-02-30" } },
    { ...save, progress: { unknown: save.progress["一"] } },
    { ...save, progress: { "一": { ...save.progress["一"], mastery: 4 } } },
    { ...save, progress: { "一": { ...save.progress["一"], ivl: Infinity } } },
    { ...save, progress: { "一": { ...save.progress["一"], ease: 1.2 } } },
    { ...save, progress: { "一": { ...save.progress["一"], due: 1.5 } } },
    { ...save, progress: { "一": { ...save.progress["一"], wrong: NaN } } },
    JSON.parse('{"curriculumVersion":2,"unlockedChapters":[],"progress":{"__proto__":{}},"streak":{"count":0,"last":""},"coins":0,"runsCompleted":0,"gatesCleared":0,"clearedChapters":[],"selectedLevel":"N5"}'),
  ];
  for (const value of malformed) {
    assert.throws(() => parseSaveData(value), (error: unknown) => error instanceof AppError && error.status === 400 && error.code === "INVALID_PROGRESS");
  }
});

test("backend curriculum manifest matches the actual frontend curriculum", async () => {
  const source = await readFile(new URL("../../src/data/regions.ts", import.meta.url), "utf8");
  const version = Number(source.match(/CURRICULUM_VERSION\s*=\s*(\d+)/)?.[1]);
  const regions = [...source.matchAll(/\[(\d+),\s*"[^"]*",\s*"[^"]*",\s*"([^"]+)"\]/g)];
  assert.equal(CURRICULUM_VERSION, version, "Run npm run db:generate-curriculum in backend after changing regions.ts.");
  assert.deepEqual(CHAPTER_IDS, regions.map((match) => Number(match[1])).sort((a, b) => a - b));
  assert.equal(KANJI_CHARACTERS, regions.map((match) => match[2]).join(""));
});

/** PGlite executes the same PostgreSQL SQL; the adapter only translates driver results. */
function pglitePool(db: PGlite): Pool {
  const query = async (sql: string, parameters?: unknown[]) => {
    const result = parameters ? await db.query(sql, parameters) : (await db.exec(sql)).at(-1)!;
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  return { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
}

test("migration checksums accept Windows/Unix line endings and reject substantive edits", async () => {
  const db = new PGlite();
  const pool = pglitePool(db);
  const unix = { name: "001_line_endings.sql", sql: "CREATE TABLE line_endings (\n  id integer PRIMARY KEY\n);\n" };
  const windows = { ...unix, sql: unix.sql.replaceAll("\n", "\r\n") };
  try {
    assert.deepEqual(await runMigrations(pool, [windows]), [windows.name]);
    assert.deepEqual(await runMigrations(pool, [unix]), [], "A Linux deployment recognizes the migration first applied on Windows.");
    assert.deepEqual(await runMigrations(pool, [windows]), []);
    const stored = await pool.query("SELECT checksum FROM schema_migrations WHERE name = $1", [unix.name]);
    assert.equal(stored.rows[0].checksum, createHash("sha256").update(unix.sql).digest("hex"));
    await assert.rejects(runMigrations(pool, [{ ...unix, sql: unix.sql.replace("id integer", "id text") }]), /has changed/);
    assert.deepEqual(await runMigrations(pool, [unix]), [], "A rejected edit leaves the recorded migration intact.");
  } finally {
    await db.close();
  }
});

async function exerciseDatabase(pool: Pool) {
  const migrations = await readMigrations(new URL("../migrations/", import.meta.url));
  assert.deepEqual(await runMigrations(pool, migrations), ["001_initial.sql"]);
  assert.deepEqual(await runMigrations(pool, migrations), []);
  await assert.rejects(runMigrations(pool, [{ ...migrations[0]!, sql: `${migrations[0]!.sql}\n-- changed` }]), /has changed/);
  await assert.rejects(runMigrations(pool, [{ name: "002_failure.sql", sql: "CREATE TABLE should_rollback (id integer); SELECT missing_column;" }]));
  const rollback = await pool.query("SELECT to_regclass('should_rollback') AS table_name");
  assert.equal(rollback.rows[0].table_name, null, "Failed migrations roll back all their DDL.");

  const users = new PgUserRepository(pool);
  const sessions = new PgSessionRepository(pool);
  const repository = new PgProgressRepository(pool);
  const progress = new ProgressService(repository);
  const identity = { subject: "google-subject-1", email: "learner@example.com", name: "Learner", picture: null };
  const user = await users.upsertGoogle(identity);
  const renamed = await users.upsertGoogle({ ...identity, email: "renamed@example.com", name: "Renamed" });
  assert.equal(renamed.id, user.id);
  assert.equal(renamed.email, "renamed@example.com");
  const other = await users.upsertGoogle({ ...identity, subject: "google-subject-2", email: renamed.email });
  assert.notEqual(user.id, other.id, "An equal email does not link distinct Google subjects.");

  const tokenHash = createHash("sha256").update("unguessable-session-token-for-test").digest("hex");
  const csrfToken = "c".repeat(43);
  await sessions.create({ tokenHash, userId: user.id, csrfToken, expiresAt: new Date(Date.now() + 60_000) });
  const session = await sessions.find(tokenHash);
  assert.equal(session?.user.id, user.id);
  assert.equal(session?.csrfToken, csrfToken);
  assert.ok(session?.expiresAt instanceof Date);
  assert.equal(await sessions.find("missing-session-token"), null);
  await sessions.create({ tokenHash: "a".repeat(64), userId: user.id, csrfToken, expiresAt: new Date(Date.now() - 60_000) });
  assert.equal(await sessions.find("a".repeat(64)), null, "Expired sessions cannot authenticate.");
  assert.equal(await deleteExpiredSessions(pool), 1);
  assert.ok(await sessions.find(tokenHash), "Expired-session cleanup preserves active sessions.");
  await assert.rejects(sessions.create({ tokenHash: "raw-cookie-token", userId: user.id, csrfToken, expiresAt: new Date() }));
  await sessions.delete(tokenHash);
  assert.equal(await sessions.find(tokenHash), null);

  assert.deepEqual(await progress.get(user.id), { save: null, version: 0 });
  await assert.rejects(progress.save(user.id, emptySave(), -1), (error: unknown) => error instanceof AppError && error.code === "INVALID_VERSION");
  await assert.rejects(progress.save(user.id, {}, 0), (error: unknown) => error instanceof AppError && error.code === "INVALID_PROGRESS");
  const firstWrites = await Promise.allSettled([
    progress.save(user.id, { ...emptySave(), coins: 10 }, 0),
    progress.save(user.id, { ...emptySave(), coins: 20 }, 0),
  ]);
  assert.equal(firstWrites.filter((result) => result.status === "fulfilled").length, 1, "Only one concurrent initial save succeeds.");
  const firstConflict = firstWrites.find((result) => result.status === "rejected");
  assert.ok(firstConflict?.status === "rejected" && firstConflict.reason instanceof AppError && firstConflict.reason.status === 409);
  const current = await progress.get(user.id);
  assert.equal(current.version, 1);
  assert.deepEqual(await progress.get(other.id), { save: null, version: 0 }, "Accounts cannot see each other's progress.");
  const nextWrites = await Promise.allSettled([
    progress.save(user.id, { ...emptySave(), coins: 30 }, 1),
    progress.save(user.id, { ...emptySave(), coins: 40 }, 1),
  ]);
  assert.equal(nextWrites.filter((result) => result.status === "fulfilled").length, 1, "Only one writer can advance a given version.");
  const updated = await progress.get(user.id);
  assert.equal(updated.version, 2);
  assert.ok(updated.save?.coins === 30 || updated.save?.coins === 40);
  await assert.rejects(progress.save(user.id, emptySave(), 1), (error: unknown) => error instanceof AppError && error.code === "PROGRESS_CONFLICT");
  assert.deepEqual(await progress.get(user.id), updated, "Stale saves cannot overwrite newer progress.");
  await assert.rejects(repository.save(randomUUID(), emptySave(), 0), "Foreign keys reject progress for missing accounts.");

  await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
  assert.deepEqual(await progress.get(user.id), { save: null, version: 0 });
  const deletedSessions = await pool.query("SELECT count(*)::integer AS count FROM sessions WHERE user_id = $1", [user.id]);
  assert.equal(deletedSessions.rows[0].count, 0, "Account deletion cascades to all sessions and progress.");
}

test("PostgreSQL migrations, identities, sessions, and optimistic progress writes (PGlite)", async () => {
  const db = new PGlite();
  try {
    await exerciseDatabase(pglitePool(db));
  } finally {
    await db.close();
  }
});

test("real PostgreSQL/Neon driver integration in an isolated schema", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL!;
  const connectionUrl = new URL(connectionString);
  assert.ok(!(connectionUrl.hostname.endsWith(".neon.tech") && connectionUrl.hostname.includes("-pooler.")), "TEST_DATABASE_URL must use Neon's direct connection; isolated-schema tests require the search_path startup option.");
  const schema = `kanji_test_${randomUUID().replaceAll("-", "")}`;
  const admin = createDatabasePool(connectionString);
  const scopedUrl = new URL(connectionString);
  scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  const pool = createDatabasePool(scopedUrl.toString());
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await exerciseDatabase(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
