import { createDatabasePool } from "../src/infrastructure/db/pool.js";
import { readMigrations, runMigrations } from "../src/infrastructure/db/migrate.js";

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DIRECT_DATABASE_URL (recommended for Neon migrations) or DATABASE_URL.");
const hostname = new URL(connectionString).hostname;
if (hostname.endsWith(".neon.tech") && hostname.includes("-pooler.")) throw new Error("Use Neon's direct connection URL for migrations: set DIRECT_DATABASE_URL without -pooler in its hostname.");
const pool = createDatabasePool(connectionString);
try {
  const applied = await runMigrations(pool, await readMigrations(new URL("../migrations/", import.meta.url)));
  console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date.");
} finally {
  await pool.end();
}
