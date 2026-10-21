import express, { type Request, type Response, type NextFunction, type CookieOptions } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../../config.js';
import type { AuthService } from '../../application/auth-service.js';
import type { GoogleProvider } from '../../application/auth-ports.js';
import type { ProgressService } from '../../application/progress-service.js';
import type { ReminderService } from '../../application/reminder-service.js';
import { AppError } from '../../domain/errors.js';
import { OAuthCookie, equalToken, secureTokens } from '../../infrastructure/auth/tokens.js';

export type AppDependencies = {
  config: Config;
  auth: AuthService;
  google: GoogleProvider;
  progress: ProgressService;
  /** Absent when VAPID keys are not configured; the app then hides the reminder offer. */
  reminders?: { service: ReminderService; publicKey: string; dispatchSecret: string } | null;
  ready: () => Promise<void>;
  reportError?: (error: unknown) => void;
};

export function createApp({ config, auth, google, progress, reminders = null, ready, reportError = () => {} }: AppDependencies) {
  const app = express();
  const secure = config.NODE_ENV === 'production';
  const sessionName = secure ? '__Host-kq_session' : 'kq_session';
  const flowName = secure ? '__Host-kq_oauth' : 'kq_oauth';
  const cookieOptions: CookieOptions = { httpOnly: true, secure, sameSite: config.COOKIE_SAME_SITE, path: '/' };
  const flowOptions: CookieOptions = { ...cookieOptions, sameSite: 'lax' };
  const oauthCookie = new OAuthCookie(config.COOKIE_SECRET);
  const origin = new URL(config.FRONTEND_URL).origin;
  app.disable('x-powered-by');
  if (config.TRUST_PROXY_HOPS) app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(cors({ origin, credentials: true, methods: ['GET', 'PUT', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use(express.json({ limit: '256kb', strict: true }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/ready', async (_req, res) => {
    try { await ready(); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });

  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' } } });
  app.use('/api/auth/google', loginLimit);
  app.get('/api/auth/google', (_req, res) => {
    const flow = { state: secureTokens.random(), nonce: secureTokens.random(), verifier: secureTokens.random(), expires: Date.now() + 10 * 60_000 };
    res.cookie(flowName, oauthCookie.seal(flow), { ...flowOptions, maxAge: 10 * 60_000 });
    res.redirect(google.authorizationUrl(flow));
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const flow = oauthCookie.open(readCookie(req, flowName));
    res.clearCookie(flowName, flowOptions);
    const destination = new URL(config.FRONTEND_URL);
    try {
      if (!flow || typeof req.query['state'] !== 'string' || !equalToken(req.query['state'], flow.state) || typeof req.query['code'] !== 'string' || req.query['code'].length > 4096 || req.query['error']) throw new AppError('INVALID_OAUTH_STATE', 'Invalid sign-in request', 400);
      const result = await auth.login(req.query['code'], flow.verifier, flow.nonce, readCookie(req, sessionName));
      res.cookie(sessionName, result.token, { ...cookieOptions, expires: result.expiresAt });
      destination.searchParams.set('auth', 'success');
    } catch (error) {
      reportError(error);
      destination.searchParams.set('auth', 'error');
    }
    res.redirect(destination.toString());
  });

  app.get('/api/auth/session', async (req, res) => {
    const session = await auth.session(readCookie(req, sessionName));
    if (!session) {
      res.clearCookie(sessionName, cookieOptions);
      res.json({ user: null });
      return;
    }
    res.json({ user: session.user, csrfToken: session.csrfToken });
  });

  const authenticated = async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.session(readCookie(req, sessionName));
    if (!session) throw new AppError('UNAUTHENTICATED', 'Sign in with Google to save your progress.', 401);
    res.locals['session'] = session;
    next();
  };
  const csrf = (req: Request, res: Response, next: NextFunction) => {
    const token = req.get('X-CSRF-Token');
    if (req.get('Origin') !== origin || !token || !equalToken(token, res.locals['session'].csrfToken)) throw new AppError('INVALID_CSRF', 'Refresh the page and try again.', 403);
    next();
  };
  app.post('/api/auth/logout', authenticated, csrf, async (req, res) => {
    await auth.logout(readCookie(req, sessionName)!);
    res.clearCookie(sessionName, cookieOptions);
    res.sendStatus(204);
  });
  app.get('/api/progress', authenticated, async (req, res) => {
    // Bind a client's previously verified identity to this read if another tab
    // switched the shared session cookie between /auth/session and /progress.
    const token = req.get('X-CSRF-Token');
    if (token && !equalToken(token, res.locals['session'].csrfToken)) throw new AppError('SESSION_CHANGED', 'Your account changed. Refresh and try again.', 403);
    res.json(await progress.get(res.locals['session'].user.id));
  });
  app.put('/api/progress', authenticated, csrf, async (req, res) => {
    if (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(k => !['save', 'expectedVersion'].includes(k))) throw new AppError('INVALID_REQUEST', 'Provide save and expectedVersion as JSON.', 400);
    const userId = res.locals['session'].user.id;
    try { res.json(await progress.save(userId, req.body.save, req.body.expectedVersion)); }
    catch (error) {
      if (error instanceof AppError && error.code === 'PROGRESS_CONFLICT') {
        res.status(409).json({ error: { code: error.code, message: error.message }, current: await progress.get(userId) });
        return;
      }
      throw error;
    }
  });

  // Daily reminders. A browser's push endpoint identifies its subscription, so guests
  // can opt in without an account; no cookie is read, so CSRF does not apply.
  const reminderLimit = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many reminder changes. Please try again later.' } } });
  const reminderService = () => {
    if (!reminders) throw new AppError('REMINDERS_UNAVAILABLE', 'Daily reminders are not available right now.', 503);
    return reminders.service;
  };
  const jsonObject = (req: Request) => {
    if (!req.is('application/json') || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new AppError('INVALID_REQUEST', 'Provide the reminder as JSON.', 400);
    return req.body as Record<string, unknown>;
  };
  app.get('/api/reminders', (_req, res) => { res.json({ publicKey: reminders?.publicKey ?? null }); });
  app.put('/api/reminders/subscription', reminderLimit, async (req, res) => {
    await reminderService().save(jsonObject(req));
    res.sendStatus(204);
  });
  app.post('/api/reminders/unsubscribe', reminderLimit, async (req, res) => {
    const body = jsonObject(req);
    if (Object.keys(body).some(k => k !== 'endpoint')) throw new AppError('INVALID_REQUEST', 'Provide only the endpoint.', 400);
    await reminderService().remove(body['endpoint']);
    res.sendStatus(204);
  });
  // Called hourly by Cloud Scheduler with the shared secret as a bearer token.
  app.post('/api/reminders/dispatch', async (req, res) => {
    const header = req.get('Authorization') ?? '';
    if (!reminders || !header.startsWith('Bearer ') || !equalToken(header.slice(7), reminders.dispatchSecret)) throw new AppError('NOT_FOUND', 'Endpoint not found.', 404);
    res.json(await reminders.service.dispatch());
  });

  app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'Endpoint not found.', 404)));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    const bodyError = error as { type?: string };
    if (bodyError?.type === 'entity.too.large') { res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Progress data is too large.' } }); return; }
    if (bodyError?.type === 'entity.parse.failed') { res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' } }); return; }
    reportError(error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed. Please try again.' } });
  });
  return app;
}

function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = req.cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}
