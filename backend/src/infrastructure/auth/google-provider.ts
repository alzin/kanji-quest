import { createHash } from 'node:crypto';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import type { GoogleProvider } from '../../application/auth-ports.js';
import { AppError } from '../../domain/errors.js';
import { equalToken } from './tokens.js';

export class GoogleOAuthProvider implements GoogleProvider {
  private readonly client: OAuth2Client;
  constructor(private readonly clientId: string, clientSecret: string, redirectUri: string) {
    this.client = new OAuth2Client({ clientId, clientSecret, redirectUri, transporterOptions: { timeout: 10_000 } });
  }

  authorizationUrl({ state, nonce, verifier }: { state: string; nonce: string; verifier: string }) {
    return this.client.generateAuthUrl({
      access_type: 'online', scope: ['openid', 'email', 'profile'], prompt: 'select_account', state, nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: CodeChallengeMethod.S256,
    });
  }

  async exchange(code: string, verifier: string, nonce: string) {
    try {
      const { tokens } = await this.client.getToken({ code, codeVerifier: verifier });
      if (!tokens.id_token) throw new Error('Missing ID token');
      // Google library checks signature, issuer, audience, and expiration.
      const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token, audience: this.clientId });
      const payload = ticket.getPayload();
      const claims = payload as unknown as Record<string, unknown> | undefined;
      if (!payload?.sub || !payload.email || payload.email_verified !== true || typeof claims?.['nonce'] !== 'string' || !equalToken(claims['nonce'], nonce)) throw new Error('Invalid identity');
      return { subject: payload.sub, email: payload.email, name: payload.name || payload.email.split('@')[0]!, picture: payload.picture ?? null };
    } catch {
      // Tokens, authorization codes, and upstream responses are never logged.
      throw new AppError('GOOGLE_AUTH_FAILED', 'Google sign-in could not be completed. Please try again.', 401);
    }
  }
}
