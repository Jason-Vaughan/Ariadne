import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const SESSION_COOKIE = 'ariadne_session';
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

let processSecret: string | null = null;

/**
 * Secret used to sign session cookies: `ARIADNE_SESSION_SECRET` when it is at least 32 characters,
 * otherwise a random per-process secret (sessions then end when the server restarts).
 * @param env - Environment to read; defaults to `process.env`.
 * @returns The signing secret.
 */
export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ARIADNE_SESSION_SECRET?.trim();
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  processSecret ??= randomBytes(32).toString('base64url');
  return processSecret;
}

/**
 * HMAC-SHA256 signature over a session body.
 * @param body - `<participantId>.<issuedAtSeconds>`.
 * @param secret - Signing secret.
 * @returns Base64url signature.
 */
function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * Builds a signed session token for a participant.
 * @param participantId - Participant the session belongs to.
 * @param secret - Signing secret.
 * @param now - Issue time; defaults to the current time.
 * @returns `<participantId>.<issuedAtSeconds>.<signature>`.
 */
export function createSessionToken(participantId: string, secret: string, now: Date = new Date()): string {
  const body = `${participantId}.${Math.floor(now.getTime() / 1000)}`;
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verifies a session token's signature and age.
 * @param token - Token from the session cookie.
 * @param secret - Signing secret.
 * @param now - Verification time; defaults to the current time.
 * @returns The participant id, or `null` for a malformed, forged or expired token.
 */
export function verifySessionToken(token: string, secret: string, now: Date = new Date()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [participantId, issuedAt, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${participantId}.${issuedAt}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const issuedSeconds = Number(issuedAt);
  if (!Number.isInteger(issuedSeconds)) return null;
  const age = Math.floor(now.getTime() / 1000) - issuedSeconds;
  if (age < 0 || age > SESSION_TTL_SECONDS) return null;
  return participantId;
}

/**
 * Parses a `Cookie` header into name/value pairs.
 * @param header - Raw `Cookie` header, if any.
 * @returns Cookie values keyed by name.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      continue;
    }
  }
  return cookies;
}

/**
 * Reads the participant id from a request's session cookie.
 * @param req - Incoming request.
 * @param secret - Signing secret; defaults to `getSessionSecret()`.
 * @returns The participant id, or `null` when there is no valid session.
 */
export function readSession(req: IncomingMessage, secret: string = getSessionSecret()): string | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return token ? verifySessionToken(token, secret) : null;
}

/**
 * Whether the request reached Ariadne over HTTPS through the public tunnel.
 * Ariadne binds loopback only, so this header can only come from the local tunnel.
 * @param req - Incoming request.
 * @returns True when cookies should carry `Secure`.
 */
export function isSecureRequest(req: IncomingMessage): boolean {
  return req.headers['x-forwarded-proto'] === 'https';
}

/**
 * `Set-Cookie` value that starts a session.
 * @param token - Signed session token.
 * @param secure - Add the `Secure` attribute.
 * @returns The header value.
 */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

/**
 * `Set-Cookie` value that ends a session.
 * @param secure - Add the `Secure` attribute.
 * @returns The header value.
 */
export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
