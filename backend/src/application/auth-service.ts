import type { SessionRepository, UserRepository } from './ports.js';
import type { GoogleProvider, Tokens } from './auth-ports.js';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly google: GoogleProvider,
    private readonly tokens: Tokens,
    private readonly sessionDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(code: string, verifier: string, nonce: string, previousToken?: string) {
    const identity = await this.google.exchange(code, verifier, nonce);
    const user = await this.users.upsertGoogle(identity);
    const token = this.tokens.random();
    const csrfToken = this.tokens.random();
    const expiresAt = new Date(this.now().getTime() + this.sessionDays * 86_400_000);
    await this.sessions.create({ tokenHash: this.tokens.hash(token), userId: user.id, csrfToken, expiresAt });
    if (previousToken) await this.sessions.delete(this.tokens.hash(previousToken));
    return { token, user, csrfToken, expiresAt };
  }

  async session(token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const found = await this.sessions.find(this.tokens.hash(token));
    if (!found || found.expiresAt <= this.now()) return null;
    return found;
  }

  async logout(token: string) { await this.sessions.delete(this.tokens.hash(token)); }
}
