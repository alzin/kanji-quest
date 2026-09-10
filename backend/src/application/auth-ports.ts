import type { GoogleIdentity } from '../domain/models.js';

export interface GoogleProvider {
  authorizationUrl(flow: { state: string; nonce: string; verifier: string }): string;
  exchange(code: string, verifier: string, nonce: string): Promise<GoogleIdentity>;
}

export interface Tokens {
  random(): string;
  hash(token: string): string;
}
