import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import request, { type Response } from 'supertest';
import { AuthService } from '../src/application/auth-service.js';
import type { GoogleProvider } from '../src/application/auth-ports.js';
import type { ProgressRepository, SessionRecord, SessionRepository, UserRepository } from '../src/application/ports.js';
import { ProgressService } from '../src/application/progress-service.js';
import type { Config } from '../src/config.js';
import { CURRICULUM_VERSION } from '../src/domain/curriculum.js';
import { AppError } from '../src/domain/errors.js';
import type { GoogleIdentity, ProgressSnapshot, SaveData, User } from '../src/domain/models.js';
import { GoogleOAuthProvider } from '../src/infrastructure/auth/google-provider.js';
import { OAuthCookie, secureTokens } from '../src/infrastructure/auth/tokens.js';
import { createApp } from '../src/interfaces/http/app.js';

const config: Config = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  FRONTEND_URL: 'http://localhost:5173/',
  GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:5173/api/auth/google/callback',
  COOKIE_SECRET: 'a-test-secret-with-at-least-thirty-two-characters',
  COOKIE_SAME_SITE: 'lax', SESSION_DAYS: 30, TRUST_PROXY_HOPS: 0,
};
const origin = new URL(config.FRONTEND_URL).origin;

function emptySave(coins = 0): SaveData {
  return {
    curriculumVersion: CURRICULUM_VERSION, unlockedChapters: [], progress: {},
    streak: { count: 0, last: '' }, coins, runsCompleted: 0, gatesCleared: 0,
    clearedChapters: [], selectedLevel: 'N5',
  };
}

class MemoryUsers implements UserRepository {
  readonly users = new Map<string, User>();
  async upsertGoogle(identity: GoogleIdentity) {
    const user = { id: identity.subject, email: identity.email, name: identity.name, picture: identity.picture };
    this.users.set(user.id, user);
    return user;
  }
}

class MemorySessions implements SessionRepository {
  readonly records = new Map<string, { userId: string; csrfToken: string; expiresAt: Date }>();
  constructor(private readonly users: MemoryUsers) {}
  async create(session: { tokenHash: string; userId: string; csrfToken: string; expiresAt: Date }) {
    const { tokenHash, ...record } = session;
    this.records.set(tokenHash, record);
  }
  async find(tokenHash: string): Promise<SessionRecord | null> {
    const record = this.records.get(tokenHash);
    const user = record && this.users.users.get(record.userId);
    return record && user ? { user, csrfToken: record.csrfToken, expiresAt: record.expiresAt } : null;
  }
  async delete(tokenHash: string) { this.records.delete(tokenHash); }
}

class MemoryProgress implements ProgressRepository {
  readonly records = new Map<string, ProgressSnapshot>();
  async get(userId: string) { return structuredClone(this.records.get(userId) ?? { save: null, version: 0 }); }
  async save(userId: string, save: SaveData, expectedVersion: number) {
    const current = this.records.get(userId) ?? { save: null, version: 0 };
    if (expectedVersion !== current.version) return null;
    const next = structuredClone({ save, version: current.version + 1 });
    this.records.set(userId, next);
    return structuredClone(next);
  }
}

type Flow = { state: string; nonce: string; verifier: string };

function harness(overrides: Partial<Config> = {}) {
  const settings = { ...config, ...overrides };
  const users = new MemoryUsers();
  const sessions = new MemorySessions(users);
  const progress = new MemoryProgress();
  const issued: Flow[] = [];
  const exchanged: { code: string; verifier: string; nonce: string }[] = [];
  const errors: unknown[] = [];
  const realProvider = new GoogleOAuthProvider(settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET, settings.GOOGLE_REDIRECT_URI);
  const google: GoogleProvider = {
    authorizationUrl(flow) { issued.push(flow); return realProvider.authorizationUrl(flow); },
    async exchange(code, verifier, nonce) {
      exchanged.push({ code, verifier, nonce });
      if (code === 'rejected-code') throw new AppError('GOOGLE_AUTH_FAILED', 'Google sign-in failed.', 401);
      assert.ok(issued.some(flow => flow.verifier === verifier && flow.nonce === nonce));
      return { subject: code, email: `${code}@gmail.com`, name: code, picture: null };
    },
  };
  let now = Date.now();
  const auth = new AuthService(users, sessions, google, secureTokens, settings.SESSION_DAYS, () => new Date(now));
  const app = createApp({ config: settings, auth, google, progress: new ProgressService(progress), ready: async () => {}, reportError: error => errors.push(error) });
  return { app, settings, users, sessions, progress, issued, exchanged, errors, advance: (ms: number) => { now += ms; } };
}

type Harness = ReturnType<typeof harness>;
function cookie(response: Response, name: string): string {
  const values = response.headers['set-cookie'] as string[] | undefined;
  const value = values?.find(item => item.startsWith(`${name}=`));
  assert.ok(value, `Response must set ${name}`);
  return value.split(';')[0]!;
}

async function startSignIn(h: Harness) {
  const response = await request(h.app).get('/api/auth/google').expect(302);
  return { response, flow: h.issued.at(-1)!, flowCookie: cookie(response, h.settings.NODE_ENV === 'production' ? '__Host-kq_oauth' : 'kq_oauth') };
}

async function signIn(h: Harness, subject = 'alice', previous?: string) {
  const { flow, flowCookie } = await startSignIn(h);
  const response = await request(h.app).get('/api/auth/google/callback')
    .query({ code: subject, state: flow.state })
    .set('Cookie', previous ? [flowCookie, previous] : [flowCookie]).expect(302);
  assert.equal(new URL(response.headers.location).searchParams.get('auth'), 'success');
  const sessionCookie = cookie(response, h.settings.NODE_ENV === 'production' ? '__Host-kq_session' : 'kq_session');
  const session = await request(h.app).get('/api/auth/session').set('Cookie', sessionCookie).expect(200);
  assert.equal(session.body.user.id, subject);
  return { response, cookie: sessionCookie, csrf: session.body.csrfToken as string, user: session.body.user as User };
}

function authenticatedPut(h: Harness, account: { cookie: string; csrf: string }, body: unknown) {
  return request(h.app).put('/api/progress').set('Cookie', account.cookie)
    .set('Origin', new URL(h.settings.FRONTEND_URL).origin).set('X-CSRF-Token', account.csrf).send(body);
}

test('guest session is public but progress reads, writes, and logout require authentication', async () => {
  const h = harness();
  const session = await request(h.app).get('/api/auth/session').expect(200);
  assert.deepEqual(session.body, { user: null });
  assert.equal(session.headers['cache-control'], 'no-store');
  await request(h.app).get('/api/health').expect(200, { status: 'ok' });
  for (const response of [
    await request(h.app).get('/api/progress'),
    await request(h.app).put('/api/progress').send({ save: emptySave(), expectedVersion: 0 }),
    await request(h.app).post('/api/auth/logout'),
    await request(h.app).get('/api/progress').set('Cookie', 'kq_session=invalid'),
  ]) {
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal(h.progress.records.size, 0);
});

test('Google redirect requests OpenID scopes, unique state and nonce, and S256 PKCE', async () => {
  const h = harness();
  const first = await startSignIn(h);
  const second = await startSignIn(h);
  const url = new URL(first.response.headers.location);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), config.GOOGLE_CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), config.GOOGLE_REDIRECT_URI);
  assert.deepEqual(new Set(url.searchParams.get('scope')?.split(' ')), new Set(['openid', 'email', 'profile']));
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), first.flow.state);
  assert.equal(url.searchParams.get('nonce'), first.flow.nonce);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(first.flow.verifier).digest('base64url'));
  assert.equal(url.searchParams.has('code_verifier'), false);
  assert.notEqual(first.flow.state, second.flow.state);
  assert.notEqual(first.flow.nonce, second.flow.nonce);
  assert.notEqual(first.flow.verifier, second.flow.verifier);
  assert.equal(first.flowCookie.includes(first.flow.verifier), false);
  assert.match(first.response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(first.response.headers['set-cookie'][0], /SameSite=Lax/);
  assert.match(first.response.headers['set-cookie'][0], /Max-Age=600/);
});

test('callback uses the cookie-bound verifier and nonce and issues a hashed session', async () => {
  const h = harness();
  const account = await signIn(h);
  assert.deepEqual(h.exchanged, [{ code: 'alice', verifier: h.issued[0]!.verifier, nonce: h.issued[0]!.nonce }]);
  const token = account.cookie.split('=')[1]!;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(h.sessions.records.has(token), false);
  assert.equal(h.sessions.records.has(secureTokens.hash(token)), true);
  assert.notEqual(token, account.csrf);
  assert.match(account.csrf, /^[A-Za-z0-9_-]{43}$/);
  const sessionHeader = (account.response.headers['set-cookie'] as string[]).find(value => value.startsWith('kq_session='))!;
  assert.match(sessionHeader, /HttpOnly/);
  assert.match(sessionHeader, /SameSite=Lax/);
  assert.match(sessionHeader, /Path=\//);
  assert.ok((account.response.headers['set-cookie'] as string[]).some(value => value.startsWith('kq_oauth=;')));
  await request(h.app).get('/api/progress').set('Cookie', account.cookie).expect(200, { save: null, version: 0 });
});

test('callback rejects missing, mismatched, tampered, expired, and denied flows without creating sessions', async () => {
  const h = harness();
  const { flow, flowCookie } = await startSignIn(h);
  const expired = new OAuthCookie(config.COOKIE_SECRET).seal({ ...flow, expires: Date.now() - 1 });
  const altered = flowCookie.slice(0, -3) + (flowCookie.endsWith('aaa') ? 'bbb' : 'aaa');
  const attempts = [
    { query: { code: 'alice', state: flow.state }, cookies: [] },
    { query: { code: 'alice' }, cookies: [flowCookie] },
    { query: { code: 'alice', state: 'wrong-state' }, cookies: [flowCookie] },
    { query: { code: 'alice', state: flow.state }, cookies: [altered] },
    { query: { code: 'alice', state: flow.state }, cookies: [`kq_oauth=${expired}`] },
    { query: { state: flow.state, error: 'access_denied' }, cookies: [flowCookie] },
    { query: { state: flow.state, code: 'a'.repeat(4097) }, cookies: [flowCookie] },
  ];
  for (const attempt of attempts) {
    const response = await request(h.app).get('/api/auth/google/callback').query(attempt.query).set('Cookie', attempt.cookies).expect(302);
    const target = new URL(response.headers.location);
    assert.equal(target.origin, origin);
    assert.equal(target.searchParams.get('auth'), 'error');
    assert.equal((response.headers['set-cookie'] as string[]).some(value => value.startsWith('kq_session=')), false);
  }
  assert.equal(h.exchanged.length, 0);
  assert.equal(h.sessions.records.size, 0);
  const rejected = await request(h.app).get('/api/auth/google/callback')
    .query({ code: 'rejected-code', state: flow.state }).set('Cookie', flowCookie).expect(302);
  assert.equal(new URL(rejected.headers.location).searchParams.get('auth'), 'error');
  assert.equal(h.sessions.records.size, 0);
});

test('sign-in rotates the current session, logout revokes it, and expired sessions cannot save', async () => {
  const h = harness();
  const first = await signIn(h);
  const second = await signIn(h, 'alice', first.cookie);
  assert.notEqual(first.cookie, second.cookie);
  assert.notEqual(first.csrf, second.csrf);
  assert.equal(h.users.users.size, 1);
  assert.equal(h.sessions.records.size, 1);
  await request(h.app).get('/api/auth/session').set('Cookie', first.cookie).expect(200, { user: null });
  await request(h.app).post('/api/auth/logout').set('Cookie', second.cookie)
    .set('Origin', origin).set('X-CSRF-Token', second.csrf).expect(204);
  assert.equal(h.sessions.records.size, 0);
  await request(h.app).get('/api/progress').set('Cookie', second.cookie).expect(401);
  const third = await signIn(h);
  h.advance((config.SESSION_DAYS + 1) * 86_400_000);
  await request(h.app).get('/api/auth/session').set('Cookie', third.cookie).expect(200, { user: null });
  await authenticatedPut(h, third, { save: emptySave(), expectedVersion: 0 }).expect(401);
  assert.equal(h.progress.records.size, 0);
});

test('saving and logout require both the exact frontend origin and the session CSRF token', async () => {
  const h = harness();
  const account = await signIn(h);
  const other = await signIn(h, 'bob');
  const invalid = [
    { origin, token: '' },
    { origin, token: 'wrong-token' },
    { origin, token: other.csrf },
    { origin: '', token: account.csrf },
    { origin: 'http://attacker.example', token: account.csrf },
    { origin: `${origin}.attacker.example`, token: account.csrf },
  ];
  for (const headers of invalid) {
    for (const method of ['put', 'post'] as const) {
      const call = request(h.app)[method](method === 'put' ? '/api/progress' : '/api/auth/logout').set('Cookie', account.cookie);
      if (headers.origin) call.set('Origin', headers.origin);
      if (headers.token) call.set('X-CSRF-Token', headers.token);
      if (method === 'put') call.send({ save: emptySave(5), expectedVersion: 0 });
      const response = await call.expect(403);
      assert.equal(response.body.error.code, 'INVALID_CSRF');
    }
  }
  assert.equal(h.progress.records.size, 0);
  assert.equal(h.sessions.records.size, 2);
  await authenticatedPut(h, account, { save: emptySave(5), expectedVersion: 0 }).expect(200);
});

test('progress belongs to the session user and stale writes return the current saved version', async () => {
  const h = harness();
  const alice = await signIn(h);
  const bob = await signIn(h, 'bob');
  const switchedRead = await request(h.app).get('/api/progress').set('Cookie', bob.cookie).set('X-CSRF-Token', alice.csrf).expect(403);
  assert.equal(switchedRead.body.error.code, 'SESSION_CHANGED');
  await request(h.app).get('/api/progress').set('Cookie', bob.cookie).set('X-CSRF-Token', bob.csrf).expect(200, { save: null, version: 0 });
  const first = await authenticatedPut(h, alice, { save: emptySave(10), expectedVersion: 0 }).expect(200);
  assert.deepEqual(first.body, { save: emptySave(10), version: 1 });
  await request(h.app).get('/api/progress').query({ userId: 'alice' }).set('Cookie', bob.cookie).expect(200, { save: null, version: 0 });
  await authenticatedPut(h, bob, { save: emptySave(20), expectedVersion: 0, userId: 'alice' }).expect(400);
  await authenticatedPut(h, bob, { save: emptySave(20), expectedVersion: 0 }).expect(200, { save: emptySave(20), version: 1 });
  const stale = await authenticatedPut(h, alice, { save: emptySave(999), expectedVersion: 0 }).expect(409);
  assert.equal(stale.body.error.code, 'PROGRESS_CONFLICT');
  assert.deepEqual(stale.body.current, first.body);
  const updates = await Promise.all([
    authenticatedPut(h, alice, { save: emptySave(11), expectedVersion: 1 }),
    authenticatedPut(h, alice, { save: emptySave(12), expectedVersion: 1 }),
  ]);
  assert.deepEqual(updates.map(response => response.status).sort(), [200, 409]);
  const winner = updates.find(response => response.status === 200)!;
  assert.equal(winner.body.version, 2);
  assert.deepEqual(updates.find(response => response.status === 409)!.body.current, winner.body);
  await request(h.app).get('/api/progress').set('Cookie', alice.cookie).expect(200, winner.body);
  await request(h.app).get('/api/progress').set('Cookie', bob.cookie).expect(200, { save: emptySave(20), version: 1 });
});

test('the HTTP boundary rejects invalid saves, versions, JSON and oversized bodies', async () => {
  const h = harness();
  const account = await signIn(h);
  const invalidBodies: unknown[] = [
    {}, [], { expectedVersion: 0 },
    { save: { ...emptySave(), coins: -1 }, expectedVersion: 0 },
    { save: { ...emptySave(), curriculumVersion: -1 }, expectedVersion: 0 },
    { save: { ...emptySave(), selectedLevel: 'N1' }, expectedVersion: 0 },
    { save: { ...emptySave(), clearedChapters: [999] }, expectedVersion: 0 },
    { save: { ...emptySave(), gatesCleared: 5 }, expectedVersion: 0 },
    { save: { ...emptySave(), streak: { count: 2, last: '2026-02-30' } }, expectedVersion: 0 },
    { save: { ...emptySave(), progress: { unknown: { mastery: 3, ivl: 1, ease: 2.5, due: 0, correct: 1, wrong: 0 } } }, expectedVersion: 0 },
    ...[-1, 0.5, '0', Number.MAX_SAFE_INTEGER].map(expectedVersion => ({ save: emptySave(), expectedVersion })),
  ];
  for (const body of invalidBodies) {
    const response = await authenticatedPut(h, account, body).expect(400);
    assert.ok(['INVALID_REQUEST', 'INVALID_PROGRESS', 'INVALID_VERSION'].includes(response.body.error.code));
  }
  const malformed = await request(h.app).put('/api/progress').set('Cookie', account.cookie)
    .set('Origin', origin).set('X-CSRF-Token', account.csrf).set('Content-Type', 'application/json').send('{broken').expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  const oversized = await authenticatedPut(h, account, { save: emptySave(), expectedVersion: 0, padding: 'x'.repeat(270_000) }).expect(413);
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
  await request(h.app).put('/api/progress').set('Cookie', account.cookie)
    .set('Origin', origin).set('X-CSRF-Token', account.csrf).type('text').send('text').expect(400);
  assert.equal(h.progress.records.size, 0);
});

test('production session cookies are host-only, secure, HttpOnly and support explicit cross-site configuration', async () => {
  const h = harness({ NODE_ENV: 'production', COOKIE_SAME_SITE: 'none', FRONTEND_URL: 'https://learn.example.com/', GOOGLE_REDIRECT_URI: 'https://api.example.com/api/auth/google/callback' });
  const account = await signIn(h);
  const headers = account.response.headers['set-cookie'] as string[];
  const session = headers.find(value => value.startsWith('__Host-kq_session='))!;
  assert.match(session, /; Secure/);
  assert.match(session, /; HttpOnly/);
  assert.match(session, /; SameSite=None/);
  assert.match(session, /; Path=\//);
  assert.doesNotMatch(session, /Domain=/i);
  await authenticatedPut(h, account, { save: emptySave(), expectedVersion: 0 }).expect(200);
});
