import { deleteExpiredSessions } from "../src/infrastructure/db/maintenance.js";
import { createDatabasePool } from "../src/infrastructure/db/pool.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL before cleaning up expired sessions.");
const pool = createDatabasePool(connectionString);
try {
  console.log(`Deleted ${await deleteExpiredSessions(pool)} expired sessions.`);
} finally {
  await pool.end();
}
