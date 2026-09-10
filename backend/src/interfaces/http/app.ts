import express, { type Request, type Response, type NextFunction, type CookieOptions } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../../config.js';
import type { AuthService } from '../../application/auth-service.js';
import type { GoogleProvider } from '../../application/auth-ports.js';
import type { ProgressService } from '../../application/progress-service.js';
import { AppError } from '../../domain/errors.js';
import { OAuthCookie, equalToken, secureTokens } from '../../infrastructure/auth/tokens.js';

export type AppDependencies = {
  config: Config;
  auth: AuthService;
  google: GoogleProvider;
  progress: ProgressService;
  ready: () => Promise<void>;
  reportError?: (error: unknown) => void;
};

export function createApp({ config, auth, google, progress, ready, reportError = () => {} }: AppDependencies) {
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
