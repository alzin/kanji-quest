import { randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Tokens } from '../../application/auth-ports.js';

export const secureTokens: Tokens = {
  random: () => randomBytes(32).toString('base64url'),
  hash: (token) => createHash('sha256').update(token).digest('hex'),
};

export function equalToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type OAuthFlow = { state: string; nonce: string; verifier: string; expires: number };

// Authenticated encryption keeps PKCE verifier and nonce out of readable cookies.
export class OAuthCookie {
  private readonly key: Buffer;
  constructor(secret: string) { this.key = createHash('sha256').update(secret).digest(); }

  seal(flow: OAuthFlow): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('kanji-quest:oauth:v1'));
    const body = Buffer.concat([cipher.update(JSON.stringify(flow), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }

  open(value: string | undefined): OAuthFlow | null {
    if (!value || value.length > 2048) return null;
    try {
      const data = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
      decipher.setAAD(Buffer.from('kanji-quest:oauth:v1'));
      decipher.setAuthTag(data.subarray(12, 28));
      const flow = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')) as OAuthFlow;
      if (![flow.state, flow.nonce, flow.verifier].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v)) || !Number.isFinite(flow.expires) || flow.expires <= Date.now()) return null;
      return flow;
    } catch { return null; }
  }
}
