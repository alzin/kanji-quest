import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173/'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:5173/api/auth/google/callback'),
  COOKIE_SECRET: z.string().min(32),
  COOKIE_SAME_SITE: z.enum(['lax', 'none']).default('lax'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(30),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Daily reminders are optional: without all four, the API reports them unavailable.
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/).optional(),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/).optional(),
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)\S+$/).optional(),
  REMINDER_DISPATCH_SECRET: z.string().min(32).optional(),
});

const REMINDER_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'REMINDER_DISPATCH_SECRET'] as const;

export type Config = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // List names only: never echo database passwords or OAuth credentials.
    throw new Error(`Invalid configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  }
  const config = parsed.data;
  const frontend = new URL(config.FRONTEND_URL);
  const callback = new URL(config.GOOGLE_REDIRECT_URI);
  const db = new URL(config.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(db.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  for (const url of [frontend, callback]) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
      throw new Error('Frontend and callback URLs must be HTTP(S) URLs without credentials, query, or fragment');
    }
    if (config.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production requires HTTPS URLs');
  }
  if (config.COOKIE_SAME_SITE === 'none' && config.NODE_ENV !== 'production') throw new Error('SameSite=None requires production HTTPS');
  const reminderKeys = REMINDER_KEYS.filter(key => config[key] !== undefined).length;
  if (reminderKeys !== 0 && reminderKeys !== REMINDER_KEYS.length) throw new Error(`Daily reminders need all of ${REMINDER_KEYS.join(', ')}`);
  return config;
}

export type ReminderConfig = { publicKey: string; privateKey: string; subject: string; dispatchSecret: string };

export function reminderConfig(config: Config): ReminderConfig | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject, REMINDER_DISPATCH_SECRET: dispatchSecret } = config;
  return publicKey && privateKey && subject && dispatchSecret ? { publicKey, privateKey, subject, dispatchSecret } : null;
}
