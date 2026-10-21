import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import type { AuthService } from '../src/application/auth-service.js';
import type { GoogleProvider } from '../src/application/auth-ports.js';
import type { PushResult, PushSender, ReminderRepository } from '../src/application/ports.js';
import type { ProgressService } from '../src/application/progress-service.js';
import { ReminderService } from '../src/application/reminder-service.js';
import { parseReminderRegistration } from '../src/application/reminder-validation.js';
import { readConfig, type Config } from '../src/config.js';
import { AppError } from '../src/domain/errors.js';
import { localClock, reminderDay, reminderMessage, type PushTarget, type ReminderMessage, type ReminderRegistration, type ReminderSubscription } from '../src/domain/reminders.js';
import { createApp } from '../src/interfaces/http/app.js';

const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
const keys = { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) };
const sub = (patch: Partial<ReminderSubscription> = {}): ReminderSubscription => ({
  endpoint, keys, timeZone: 'Asia/Tokyo', hour: 19, lastPlayedOn: '2026-10-18', streak: 4, lastSentOn: null, ...patch,
});
// 2026-10-19 10:30 UTC is 19:30 in Tokyo and 06:30 in New York.
const evening = new Date('2026-10-19T10:30:00Z');

test('reminders fall due on the player\'s own clock, once a day, only when they have not played', () => {
  assert.deepEqual(localClock('Asia/Tokyo', evening), { day: '2026-10-19', hour: 19 });
  assert.deepEqual(localClock('America/New_York', evening), { day: '2026-10-19', hour: 6 });
  assert.equal(reminderDay(sub(), evening), '2026-10-19');
  assert.equal(reminderDay(sub({ hour: 20 }), evening), null, 'Too early in Tokyo.');
  assert.equal(reminderDay(sub({ timeZone: 'America/New_York' }), evening), null, 'Too early in New York.');
  assert.equal(reminderDay(sub({ lastPlayedOn: '2026-10-19' }), evening), null, 'Already played today.');
  assert.equal(reminderDay(sub({ lastPlayedOn: '2026-10-20' }), evening), null, 'A device clock ahead still counts as played.');
  assert.equal(reminderDay(sub({ lastSentOn: '2026-10-19' }), evening), null, 'Already reminded today.');
  assert.equal(reminderDay(sub({ lastPlayedOn: null }), evening), '2026-10-19');
  assert.equal(reminderDay(sub({ lastPlayedOn: '2026-09-19' }), evening), '2026-10-19', 'Thirty days away is still reminded.');
  assert.equal(reminderDay(sub({ lastPlayedOn: '2026-09-18' }), evening), null, 'Longer than that, we stop.');
});

test('the message mentions the streak only while it is still alive', () => {
  assert.match(reminderMessage(sub(), '2026-10-19').title, /4-day streak/);
  assert.doesNotMatch(reminderMessage(sub({ lastPlayedOn: '2026-10-17' }), '2026-10-19').title, /streak/);
  assert.doesNotMatch(reminderMessage(sub({ streak: 1 }), '2026-10-19').title, /streak/);
  assert.equal(reminderMessage(sub(), '2026-10-19').tag, 'daily-reminder');
});

const body = (patch: Record<string, unknown> = {}) => ({
  subscription: { endpoint, expirationTime: null, keys }, timeZone: 'Asia/Tokyo', hour: 19, lastPlayedOn: '2026-10-18', streak: 4, ...patch,
});

test('registrations accept real push services only and validate every field', () => {
  assert.deepEqual(parseReminderRegistration(body()), { endpoint, keys, timeZone: 'Asia/Tokyo', hour: 19, lastPlayedOn: '2026-10-18', streak: 4 });
  assert.equal(parseReminderRegistration(body({ lastPlayedOn: '' })).lastPlayedOn, null);
  for (const host of ['web.push.apple.com', 'updates.push.services.mozilla.com', 'wns2-par02p.notify.windows.com']) {
    assert.ok(parseReminderRegistration(body({ subscription: { endpoint: `https://${host}/x`, keys } })));
  }
  const malformed = [
    body({ subscription: { endpoint: 'https://evil.example/fcm.googleapis.com', keys } }),
    body({ subscription: { endpoint: 'https://fcm.googleapis.com.evil.example/x', keys } }),
    body({ subscription: { endpoint: 'http://fcm.googleapis.com/x', keys } }),
    body({ subscription: { endpoint: 'https://user:pw@fcm.googleapis.com/x', keys } }),
    body({ subscription: { endpoint, keys: { ...keys, auth: 'short' } } }),
    body({ subscription: { endpoint, keys: { ...keys, p256dh: 'not base64!'.repeat(4) } } }),
    body({ timeZone: 'Mars/Olympus' }), body({ hour: 24 }), body({ hour: 7.5 }),
    body({ lastPlayedOn: '2026-02-30' }), body({ streak: -1 }), body({ extra: true }), null, [],
  ];
  for (const value of malformed) {
    assert.throws(() => parseReminderRegistration(value), (error: unknown) => error instanceof AppError && error.status === 400);
  }
});

class MemoryReminders implements ReminderRepository {
  readonly rows = new Map<string, ReminderSubscription>();
  async save(r: ReminderRegistration) {
    const old = this.rows.get(r.endpoint);
    const newer = !old?.lastPlayedOn || (r.lastPlayedOn !== null && r.lastPlayedOn >= old.lastPlayedOn);
    this.rows.set(r.endpoint, { ...r, lastPlayedOn: newer ? r.lastPlayedOn ?? null : old!.lastPlayedOn, streak: newer ? r.streak : old!.streak, lastSentOn: old?.lastSentOn ?? null });
  }
  async remove(endpoint: string) { this.rows.delete(endpoint); }
  async candidates() { return [...this.rows.values()].map(row => structuredClone(row)); }
  async claim(endpoint: string, day: string) {
    const row = this.rows.get(endpoint);
    if (!row || (row.lastSentOn ?? '') >= day || (row.lastPlayedOn ?? '') >= day) return false;
    row.lastSentOn = day;
    return true;
  }
  async release(endpoint: string, day: string, previous: string | null) {
    const row = this.rows.get(endpoint);
    if (row?.lastSentOn === day) row.lastSentOn = previous;
  }
}

class FakeSender implements PushSender {
  readonly sent: { target: PushTarget; message: ReminderMessage }[] = [];
  constructor(private readonly results: Record<string, PushResult> = {}) {}
  async send(target: PushTarget, message: ReminderMessage) {
    this.sent.push({ target, message });
    return this.results[target.endpoint] ?? 'sent';
  }
}

const secret = 'a-dispatch-secret-with-at-least-32-chars';
const config: Config = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://test:test@localhost/test',
  FRONTEND_URL: 'http://localhost:5173/', GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test',
  GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback', COOKIE_SECRET: 'a-test-secret-with-at-least-thirty-two-characters',
  COOKIE_SAME_SITE: 'lax', SESSION_DAYS: 30, TRUST_PROXY_HOPS: 0,
};

function harness(enabled = true, results: Record<string, PushResult> = {}) {
  const repository = new MemoryReminders();
  const sender = new FakeSender(results);
  const service = new ReminderService(repository, sender, () => evening);
  const app = createApp({
    config, auth: {} as AuthService, google: {} as GoogleProvider, progress: {} as ProgressService, ready: async () => {},
    reminders: enabled ? { service, publicKey: 'public-key', dispatchSecret: secret } : null,
  });
  return { app, repository, sender };
}

test('without VAPID keys the API reports reminders unavailable', async () => {
  const { app } = harness(false);
  await request(app).get('/api/reminders').expect(200, { publicKey: null });
  await request(app).put('/api/reminders/subscription').send(body()).expect(503);
  await request(app).post('/api/reminders/dispatch').set('Authorization', `Bearer ${secret}`).expect(404);
});

test('guests subscribe, update and unsubscribe by endpoint without an account', async () => {
  const { app, repository } = harness();
  await request(app).get('/api/reminders').expect(200, { publicKey: 'public-key' });
  await request(app).put('/api/reminders/subscription').send(body()).expect(204);
  await request(app).put('/api/reminders/subscription').send(body({ hour: 8, lastPlayedOn: '2026-10-19', streak: 5 })).expect(204);
  assert.deepEqual(repository.rows.get(endpoint), { endpoint, keys, timeZone: 'Asia/Tokyo', hour: 8, lastPlayedOn: '2026-10-19', streak: 5, lastSentOn: null });
  await request(app).put('/api/reminders/subscription').send(body({ hour: 25 })).expect(400);
  await request(app).put('/api/reminders/subscription').set('Content-Type', 'text/plain').send('x').expect(400);
  await request(app).post('/api/reminders/unsubscribe').send({ endpoint, other: 1 }).expect(400);
  await request(app).post('/api/reminders/unsubscribe').send({ endpoint }).expect(204);
  assert.equal(repository.rows.size, 0);
});

test('dispatch needs the scheduler secret and sends each due player one reminder a day', async () => {
  const gone = 'https://fcm.googleapis.com/fcm/send/gone';
  const flaky = 'https://fcm.googleapis.com/fcm/send/flaky';
  const played = 'https://fcm.googleapis.com/fcm/send/played';
  const { app, repository, sender } = harness(true, { [gone]: 'gone', [flaky]: 'failed' });
  for (const [url, lastPlayedOn] of [[endpoint, '2026-10-18'], [gone, '2026-10-18'], [flaky, '2026-10-18'], [played, '2026-10-19']] as const) {
    await request(app).put('/api/reminders/subscription').send(body({ subscription: { endpoint: url, keys }, lastPlayedOn })).expect(204);
  }
  await request(app).post('/api/reminders/dispatch').expect(404);
  await request(app).post('/api/reminders/dispatch').set('Authorization', 'Bearer wrong').expect(404);
  const first = await request(app).post('/api/reminders/dispatch').set('Authorization', `Bearer ${secret}`).expect(200);
  assert.deepEqual(first.body, { checked: 3, sent: 1, removed: 1, failed: 1 });
  assert.deepEqual(sender.sent.map(s => s.target.endpoint).sort(), [endpoint, flaky, gone].sort());
  assert.match(sender.sent.find(s => s.target.endpoint === endpoint)!.message.title, /4-day streak/);
  assert.ok(!repository.rows.has(gone), 'Expired subscriptions are deleted.');
  const second = await request(app).post('/api/reminders/dispatch').set('Authorization', `Bearer ${secret}`).expect(200);
  assert.deepEqual(second.body, { checked: 1, sent: 0, removed: 0, failed: 1 }, 'Only the failed delivery is retried.');
});

test('reminder settings are all-or-nothing', () => {
  const env = {
    DATABASE_URL: 'postgresql://u:p@localhost/db', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret',
    COOKIE_SECRET: 'x'.repeat(32),
  };
  assert.equal(readConfig(env).VAPID_PUBLIC_KEY, undefined);
  const full = { ...env, VAPID_PUBLIC_KEY: 'B'.repeat(87), VAPID_PRIVATE_KEY: 'p'.repeat(43), VAPID_SUBJECT: 'mailto:team@example.com', REMINDER_DISPATCH_SECRET: secret };
  assert.equal(readConfig(full).VAPID_SUBJECT, 'mailto:team@example.com');
  assert.throws(() => readConfig({ ...full, REMINDER_DISPATCH_SECRET: undefined }), /Daily reminders need all/);
  assert.throws(() => readConfig({ ...full, VAPID_SUBJECT: 'team@example.com' }), /VAPID_SUBJECT/);
});
