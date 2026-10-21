import { readConfig, reminderConfig } from './config.js';
import { AuthService } from './application/auth-service.js';
import { ProgressService } from './application/progress-service.js';
import { ReminderService } from './application/reminder-service.js';
import { createDatabasePool } from './infrastructure/db/pool.js';
import { PgUserRepository, PgSessionRepository, PgProgressRepository, PgReminderRepository } from './infrastructure/db/repositories.js';
import { GoogleOAuthProvider } from './infrastructure/auth/google-provider.js';
import { secureTokens } from './infrastructure/auth/tokens.js';
import { WebPushSender } from './infrastructure/push/web-push-sender.js';
import { createApp } from './interfaces/http/app.js';

const config = readConfig();
const pool = createDatabasePool(config.DATABASE_URL);
const google = new GoogleOAuthProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
const sessions = new PgSessionRepository(pool);
const auth = new AuthService(new PgUserRepository(pool), sessions, google, secureTokens, config.SESSION_DAYS);
const push = reminderConfig(config);
const reminders = push && {
  service: new ReminderService(new PgReminderRepository(pool), new WebPushSender({ subject: push.subject, publicKey: push.publicKey, privateKey: push.privateKey })),
  publicKey: push.publicKey,
  dispatchSecret: push.dispatchSecret,
};
const app = createApp({
  config, auth, google, progress: new ProgressService(new PgProgressRepository(pool)), reminders,
  ready: async () => { await pool.query('SELECT 1 FROM users, sessions, user_progress LIMIT 1'); },
  // Intentionally avoid URLs, cookies, tokens, request bodies, and raw DB errors.
  reportError: () => console.error('API request failed'),
});
pool.on('error', () => console.error('Database connection failed'));
const server = app.listen(config.PORT, config.HOST, () => console.log(`Kanji Quest API listening on port ${config.PORT}`));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => { void pool.end().then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
