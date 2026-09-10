import pg from "pg";

/** Use Neon's pooled URL at runtime; never disable certificate verification. */
export function createDatabasePool(connectionString: string): pg.Pool {
  const url = new URL(connectionString);
  if (url.hostname.endsWith(".neon.tech")) url.searchParams.set("sslmode", "verify-full");
  return new pg.Pool({
    connectionString: url.toString(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: "kanji-quest",
  });
}
