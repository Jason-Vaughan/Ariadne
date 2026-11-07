import { randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { EvidenceReceiptSchema, GithubUsernameSchema, RepoFullNameSchema } from '../contracts/index.ts';
import type { EvidenceReceipt } from '../contracts/index.ts';
import { recordGithubRateLimit } from '../routes/health.ts';
import { extractPage, sanitizeText, truncate } from './sanitize.ts';

// ---------------------------------------------------------------------------
// Bounds (Car 02-B dispatch): a QR burst of 40–150 scans must never stall on GitHub or a slow website.
// ---------------------------------------------------------------------------

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_TIMEOUT_MS = 2500;
export const MAX_GITHUB_CALLS = 3;
export const MAX_REPOS = 10;
export const README_MAX_CHARS = 3500;
export const WEBSITE_TIMEOUT_MS = 1500;
export const WEBSITE_MAX_BYTES = 32 * 1024;
export const WEBSITE_TEXT_MAX_CHARS = 3500;
export const MAX_WEBSITE_REDIRECTS = 3;
/** A token below this many remaining requests is rested until its window resets. */
export const ROTATE_BELOW_REMAINING = 50;
const USER_AGENT = 'ariadne-hackathon-connector';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GithubFailureReason = 'github_user_not_found' | 'github_rate_limited' | 'github_unavailable';

/** A GitHub retrieval failure, carrying the `analysis.failed` reason code it maps to. */
export class GithubFetchError extends Error {
  readonly reason: GithubFailureReason;

  /**
   * @param reason - Contract reason code for `analysis.failed`.
   * @param message - Human-readable detail (never includes a token).
   */
  constructor(reason: GithubFailureReason, message: string) {
    super(message);
    this.name = 'GithubFetchError';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Multi-PAT token pool
// ---------------------------------------------------------------------------

interface TokenState {
  token: string;
  remaining: number | null;
  restedUntil: number;
}

/**
 * Collects GitHub tokens from the environment, de-duplicated, in a stable order.
 * Reads the comma-separated pools `ARIADNE_GITHUB_TOKENS`, `GITHUB_TOKEN_POOL` and `GITHUB_TOKENS`, then the single
 * tokens `ARIADNE_GITHUB_TOKEN` and `GITHUB_TOKEN`.
 * @param env - Environment to read.
 * @returns Non-empty, trimmed tokens.
 */
export function tokensFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.ARIADNE_GITHUB_TOKENS, env.GITHUB_TOKEN_POOL, env.GITHUB_TOKENS, env.ARIADNE_GITHUB_TOKEN, env.GITHUB_TOKEN];
  const tokens: string[] = [];
  for (const value of raw) {
    for (const token of (value ?? '').split(',')) {
      const trimmed = token.trim();
      if (trimmed && !tokens.includes(trimmed)) tokens.push(trimmed);
    }
  }
  return tokens;
}

/**
 * Chooses which GitHub token each request uses: the token with the most known quota left, rotating round-robin
 * among equals, resting any token that is rate-limited or nearly exhausted, and falling back to unauthenticated
 * public access when no token is usable.
 */
export class TokenPool {
  #states: TokenState[];
  #cursor = 0;
  #anonymousRestedUntil = 0;

  /**
   * @param tokens - GitHub personal access tokens; may be empty.
   */
  constructor(tokens: readonly string[]) {
    this.#states = [...new Set(tokens)].map((token) => ({ token, remaining: null, restedUntil: 0 }));
  }

  /**
   * Builds a pool from environment variables (see `tokensFromEnv`).
   * @param env - Environment to read.
   * @returns A new pool.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): TokenPool {
    return new TokenPool(tokensFromEnv(env));
  }

  /** Number of configured tokens. */
  get size(): number {
    return this.#states.length;
  }

  /**
   * Picks the token for the next request.
   * @param now - Current epoch milliseconds.
   * @returns A token, `null` for unauthenticated access, or `undefined` when every option is resting.
   */
  pick(now: number = Date.now()): string | null | undefined {
    const usable = this.#states.filter((s) => s.restedUntil <= now);
    if (usable.length > 0) {
      const best = Math.max(...usable.map((s) => s.remaining ?? Number.POSITIVE_INFINITY));
      const top = usable.filter((s) => (s.remaining ?? Number.POSITIVE_INFINITY) === best);
      const chosen = top[this.#cursor % top.length] as TokenState;
      this.#cursor += 1;
      return chosen.token;
    }
    return this.#anonymousRestedUntil <= now ? null : undefined;
  }

  /**
   * Records what GitHub said about a token's quota after a response.
   * @param token - The token used, or `null` for unauthenticated access.
   * @param status - HTTP status of the response.
   * @param headers - Response headers (`x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`).
   * @param now - Current epoch milliseconds.
   */
  observe(token: string | null, status: number, headers: Headers, now: number = Date.now()): void {
    const remainingHeader = headers.get('x-ratelimit-remaining');
    const remaining = remainingHeader === null || remainingHeader.trim() === '' ? null : Number(remainingHeader);
    const resetSeconds = Number(headers.get('x-ratelimit-reset'));
    const retryAfter = Number(headers.get('retry-after'));
    const limited =
      status === 429 || (status === 403 && (remaining === 0 || headers.has('retry-after'))) ||
      (remaining !== null && Number.isFinite(remaining) && remaining < ROTATE_BELOW_REMAINING);
    let restUntil = 0;
    if (limited) {
      if (Number.isFinite(retryAfter) && retryAfter > 0) restUntil = now + retryAfter * 1000;
      else if (Number.isFinite(resetSeconds) && resetSeconds * 1000 > now) restUntil = resetSeconds * 1000;
      else restUntil = now + 60_000;
    }
    if (token === null) {
      if (limited) this.#anonymousRestedUntil = restUntil;
      return;
    }
    const state = this.#states.find((s) => s.token === token);
    if (!state) return;
    if (remaining !== null && Number.isFinite(remaining)) state.remaining = remaining;
    if (limited) state.restedUntil = restUntil;
  }
}

let sharedPool: TokenPool | null = null;

/**
 * The process-wide token pool, built from the environment on first use so rotation state is shared across requests.
 * @returns The shared pool.
 */
export function defaultTokenPool(): TokenPool {
  sharedPool ??= TokenPool.fromEnv();
  return sharedPool;
}

// ---------------------------------------------------------------------------
// Bounded GitHub REST client
// ---------------------------------------------------------------------------

interface CallBudget {
  pool: TokenPool;
  fetchImpl: typeof fetch;
  deadline: number;
  calls: number;
  maxCalls: number;
}

/**
 * Issues one GitHub GET within the call budget and deadline, rotating to another token on a rate-limit response.
 * @param path - API path beginning with `/`.
 * @param budget - Shared budget for this participant's retrieval.
 * @param accept - Accept header (JSON by default; raw for README bodies).
 * @returns The successful response, or `null` for a 404.
 * @throws GithubFetchError when the budget, deadline or every token is exhausted, or GitHub fails.
 */
async function githubGet(path: string, budget: CallBudget, accept = 'application/vnd.github+json'): Promise<Response | null> {
  for (;;) {
    const token = budget.pool.pick();
    if (token === undefined) throw new GithubFetchError('github_rate_limited', 'every GitHub token and anonymous access are rate-limited');
    if (budget.calls >= budget.maxCalls) throw new GithubFetchError('github_rate_limited', `GitHub call budget of ${budget.maxCalls} spent`);
    const remainingMs = budget.deadline - Date.now();
    if (remainingMs <= 0) throw new GithubFetchError('github_unavailable', `GitHub did not answer within ${GITHUB_TIMEOUT_MS}ms`);
    budget.calls += 1;

    const headers: Record<string, string> = { Accept: accept, 'User-Agent': USER_AGENT, 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await budget.fetchImpl(`${GITHUB_API}${path}`, { headers, signal: AbortSignal.timeout(remainingMs), redirect: 'follow' });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new GithubFetchError('github_unavailable', timedOut ? `GitHub did not answer within ${GITHUB_TIMEOUT_MS}ms` : 'GitHub request failed');
    }

    budget.pool.observe(token, response.status, response.headers);
    recordGithubRateLimit({
      remaining: response.headers.get('x-ratelimit-remaining'),
      limit: response.headers.get('x-ratelimit-limit'),
      reset: response.headers.get('x-ratelimit-reset'),
    });

    if (response.ok) return response;
    if (response.status === 404) return null;
    const rateLimited =
      response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
    if (rateLimited) continue;
    throw new GithubFetchError('github_unavailable', `GitHub answered ${response.status} for ${path.split('?')[0]}`);
  }
}

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

export interface GithubProfile {
  name: string;
  bio: string;
  company: string;
  location: string;
  blog: string;
  html_url: string;
  public_repos: number;
  followers: number;
  created_at: string;
  updated_at: string;
}

export interface GithubRepoSummary {
  full_name: string;
  html_url: string;
  description: string;
  language: string | null;
  topics: string[];
  stars: number;
  pushed_at: string;
  updated_at: string;
}

export interface ReadmeExcerpt {
  repo_full_name: string;
  html_url: string;
  excerpt: string;
}

export interface WebsiteSummary {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  fetched_at: string;
}

export const FINGERPRINT_AXES = [
  'systems_infra',
  'agent_orchestration',
  'llm_eval',
  'frontend_ux',
  'product_gtm',
  'data_pipelines',
] as const;
export type FingerprintAxis = (typeof FINGERPRINT_AXES)[number];
/** 0–100 per axis. */
export type FingerprintVector = Record<FingerprintAxis, number>;
export const FINGERPRINT_AXIS_LABELS: Record<FingerprintAxis, string> = {
  systems_infra: 'Systems/Infra',
  agent_orchestration: 'Agent Orchestration',
  llm_eval: 'LLM/Eval',
  frontend_ux: 'Frontend/UX',
  product_gtm: 'Product/GTM',
  data_pipelines: 'Data/Pipelines',
};

export interface GithubSnapshot {
  version: 1;
  username: string;
  user_id: number | null;
  avatar_url: string | null;
  profile: GithubProfile;
  repos: GithubRepoSummary[];
  readme: ReadmeExcerpt | null;
  website: WebsiteSummary | null;
  public_website: boolean;
  /** Canonical form of the website URL this snapshot was built for (`null` = none requested). */
  website_requested_url: string | null;
  website_skip_reason: WebsiteSkipReason | null;
  fingerprint: FingerprintVector;
  fetched_at: string;
  api_calls: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Normalization of GitHub JSON (only public fields survive)
// ---------------------------------------------------------------------------

/**
 * Reads a string field from untrusted JSON.
 * @param value - Candidate value.
 * @returns The string, or `''` when absent or not a string.
 */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Reads a non-negative integer field from untrusted JSON.
 * @param value - Candidate value.
 * @returns The integer, or 0.
 */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * Accepts only https URLs on github.com, so evidence can never cite another host as GitHub's.
 * @param value - Candidate URL.
 * @returns The URL, or `null`.
 */
function githubUrl(value: unknown): string | null {
  try {
    const url = new URL(str(value));
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Normalizes an ISO timestamp from GitHub.
 * @param value - Candidate timestamp.
 * @param fallback - Value used when the input is missing or unparseable.
 * @returns An ISO-8601 UTC timestamp.
 */
function isoTime(value: unknown, fallback: string): string {
  const ms = Date.parse(str(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

/**
 * Normalizes the `/users/{username}` payload.
 * @param json - Untrusted response body.
 * @param username - Requested (normalized) login.
 * @param fetchedAt - Fallback timestamp.
 * @returns Public profile fields, sanitized.
 */
export function normalizeProfile(json: unknown, username: string, fetchedAt: string): { profile: GithubProfile; userId: number | null; avatarUrl: string | null } {
  const raw = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const avatar = str(raw.avatar_url);
  let avatarUrl: string | null = null;
  try {
    const url = new URL(avatar);
    if (url.protocol === 'https:' && url.hostname === 'avatars.githubusercontent.com') avatarUrl = url.href;
  } catch {
    avatarUrl = null;
  }
  const userId = typeof raw.id === 'number' && Number.isInteger(raw.id) && raw.id > 0 ? raw.id : null;
  return {
    userId,
    avatarUrl,
    profile: {
      name: sanitizeText(str(raw.name), 100),
      bio: sanitizeText(str(raw.bio), 280),
      company: sanitizeText(str(raw.company), 100),
      location: sanitizeText(str(raw.location), 100),
      blog: sanitizeText(str(raw.blog), 200),
      html_url: githubUrl(raw.html_url) ?? `https://github.com/${username}`,
      public_repos: count(raw.public_repos),
      followers: count(raw.followers),
      created_at: isoTime(raw.created_at, fetchedAt),
      updated_at: isoTime(raw.updated_at, fetchedAt),
    },
  };
}

/**
 * Keeps the participant's own public, non-fork repositories, most recently pushed first, capped at `MAX_REPOS`.
 * @param json - Untrusted `/users/{username}/repos` body.
 * @param fetchedAt - Fallback timestamp.
 * @returns Sanitized repository summaries.
 */
export function normalizeRepos(json: unknown, fetchedAt: string): GithubRepoSummary[] {
  if (!Array.isArray(json)) return [];
  const repos: GithubRepoSummary[] = [];
  for (const item of json as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue;
    if (item.private !== false || item.fork === true || (item.visibility !== undefined && item.visibility !== 'public')) continue;
    const fullName = str(item.full_name);
    const htmlUrl = githubUrl(item.html_url);
    if (!RepoFullNameSchema.safeParse(fullName).success || !htmlUrl) continue;
    const topics = Array.isArray(item.topics)
      ? (item.topics as unknown[]).filter((t): t is string => typeof t === 'string' && /^[a-z0-9][a-z0-9-]{0,49}$/.test(t)).slice(0, 20)
      : [];
    repos.push({
      full_name: fullName,
      html_url: htmlUrl,
      description: sanitizeText(str(item.description), 280),
      language: /^[A-Za-z0-9+#.\- ]{1,40}$/.test(str(item.language)) ? str(item.language) : null,
      topics,
      stars: count(item.stargazers_count),
      pushed_at: isoTime(item.pushed_at, fetchedAt),
      updated_at: isoTime(item.updated_at, fetchedAt),
    });
  }
  repos.sort((a, b) => b.pushed_at.localeCompare(a.pushed_at) || a.full_name.localeCompare(b.full_name));
  return repos.slice(0, MAX_REPOS);
}

/**
 * Picks the repository whose README best represents the builder: most stars, then most recently pushed.
 * @param repos - Normalized repositories.
 * @returns The chosen repository, or `undefined` when there are none.
 */
export function flagshipRepo(repos: readonly GithubRepoSummary[]): GithubRepoSummary | undefined {
  return [...repos].sort((a, b) => b.stars - a.stars || b.pushed_at.localeCompare(a.pushed_at))[0];
}

// ---------------------------------------------------------------------------
// Optional public website fetch (SSRF-guarded)
// ---------------------------------------------------------------------------

const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether an IP address is publicly routable (not loopback, private, link-local, CGNAT/tailnet, documentation,
 * multicast or otherwise reserved). IPv4-mapped IPv6 addresses are judged by their IPv4 part.
 * @param address - IPv4 or IPv6 literal.
 * @returns True only for public addresses.
 */
export function isPublicAddress(address: string): boolean {
  const literal = address.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  const family = isIP(literal);
  if (family === 4) return !BLOCKED.check(literal, 'ipv4');
  if (family !== 6) return false;
  const mapped = /^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(literal);
  if (mapped?.[1]) return isPublicAddress(mapped[1]);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(literal);
  if (hexMapped?.[1] && hexMapped[2]) {
    const high = parseInt(hexMapped[1], 16);
    const low = parseInt(hexMapped[2], 16);
    return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return !BLOCKED.check(literal, 'ipv6');
}

/** Raised when a website URL or its resolved address is not allowed. */
export class BlockedAddressError extends Error {
  /**
   * @param message - Which host or address was refused.
   */
  constructor(message: string) {
    super(message);
    this.name = 'BlockedAddressError';
  }
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS lookup used for website connections: resolves every address and refuses the host if any is non-public.
 * Because it runs inside the actual connection, a DNS answer cannot change between the check and the connect.
 * @param hostname - Host to resolve.
 * @param options - Node lookup options (`all` is honoured).
 * @param callback - Node lookup callback.
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error, '');
    const list = addresses as LookupAddress[];
    const refused = list.find((entry) => !isPublicAddress(entry.address));
    if (list.length === 0 || refused) {
      return callback(Object.assign(new BlockedAddressError(`${hostname} resolves to a non-public address`), { code: 'EBLOCKED' }), '');
    }
    const wanted = options.family === 4 || options.family === 6 ? list.filter((entry) => entry.family === options.family) : list;
    if (wanted.length === 0) return callback(Object.assign(new Error(`${hostname} has no IPv${options.family} address`), { code: 'ENOTFOUND' }), '');
    if (options.all) return callback(null, wanted);
    const first = wanted[0] as LookupAddress;
    callback(null, first.address, first.family);
  });
}

/**
 * Checks a website URL before any connection: https only, default port, no credentials, no local hostnames,
 * and IP literals must be public.
 * @param raw - URL supplied by the participant or a redirect.
 * @returns The parsed URL.
 * @throws BlockedAddressError when the URL is not allowed.
 */
export function assertPublicWebsiteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedAddressError('not a valid URL');
  }
  if (url.protocol !== 'https:') throw new BlockedAddressError('only https websites are fetched');
  if (url.username || url.password) throw new BlockedAddressError('URLs with credentials are refused');
  if (url.port && url.port !== '443') throw new BlockedAddressError('only the default https port is allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') && !host.includes(':')) throw new BlockedAddressError(`${host} is not a public hostname`);
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|ts\.net)$/.test(host)) {
    throw new BlockedAddressError(`${host} is a local or private hostname`);
  }
  if (isIP(host.replace(/^\[|\]$/g, '')) !== 0 && !isPublicAddress(host)) throw new BlockedAddressError(`${host} is not a public address`);
  return url;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  cancel(): void;
}

/** One HTTPS GET without redirect following; the website fetcher handles redirects itself. */
export type WebsiteTransport = (url: URL, signal: AbortSignal) => Promise<TransportResponse>;

/**
 * Default transport: `node:https` with `safeLookup`, so every connection is re-checked at DNS time.
 * @param url - Target URL (already validated).
 * @param signal - Abort signal bounding the whole fetch.
 * @returns The response head and a streaming body.
 */
export const httpsTransport: WebsiteTransport = (url, signal) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        lookup: safeLookup as never,
        signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8' },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, cancel: () => res.destroy() }),
    );
    req.on('error', reject);
    req.end();
  });

export type WebsiteSkipReason =
  | 'invalid_url'
  | 'blocked_address'
  | 'login_required'
  | 'http_error'
  | 'not_html'
  | 'too_many_redirects'
  | 'timeout'
  | 'network_error';

export type WebsiteResult =
  | { ok: true; website: WebsiteSummary }
  | { ok: false; reason: WebsiteSkipReason };

const LOGIN_PATH = /(?:^|[/._-])(?:log[-_]?in|sign[-_]?in|auth|sso|oauth2?|sessions?|wp-login)(?:$|[/._?=-])/i;

/**
 * Reads a response body up to a byte cap, cancelling the stream once the cap is reached.
 * @param response - Transport response.
 * @param maxBytes - Maximum bytes to keep.
 * @returns The (possibly truncated) body as UTF-8 text.
 */
async function readCapped(response: TransportResponse, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    chunks.push(buffer.subarray(0, Math.max(0, maxBytes - size)));
    size += buffer.length;
    if (size >= maxBytes) {
      response.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches a participant's optional public website and extracts citable text. Never throws: any refusal, login wall,
 * timeout or error yields `{ ok: false, reason }` so the GitHub crawl continues without it.
 * @param rawUrl - The participant's `website_url`.
 * @param options - Transport, timeout, byte cap and clock overrides (for tests).
 * @returns The extracted page, or why it was skipped.
 */
export async function fetchPublicWebsite(
  rawUrl: string,
  options: { transport?: WebsiteTransport; timeoutMs?: number; maxBytes?: number; now?: () => Date } = {},
): Promise<WebsiteResult> {
  const transport = options.transport ?? httpsTransport;
  const signal = AbortSignal.timeout(options.timeoutMs ?? WEBSITE_TIMEOUT_MS);
  let url: URL;
  try {
    url = assertPublicWebsiteUrl(rawUrl);
  } catch {
    return { ok: false, reason: rawUrl.startsWith('https://') ? 'blocked_address' : 'invalid_url' };
  }
  try {
    for (let hop = 0; hop <= MAX_WEBSITE_REDIRECTS; hop++) {
      if (LOGIN_PATH.test(url.pathname)) return { ok: false, reason: 'login_required' };
      const response = await transport(url, signal);
      if (response.status >= 300 && response.status < 400) {
        response.cancel();
        const location = response.headers.location;
        if (typeof location !== 'string' || !location) return { ok: false, reason: 'http_error' };
        try {
          url = assertPublicWebsiteUrl(new URL(location, url).href);
        } catch {
          return { ok: false, reason: 'blocked_address' };
        }
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        response.cancel();
        return { ok: false, reason: 'login_required' };
      }
      if (response.status !== 200) {
        response.cancel();
        return { ok: false, reason: 'http_error' };
      }
      const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
      if (!/^(text\/html|application\/xhtml\+xml|text\/plain)\b/.test(contentType)) {
        response.cancel();
        return { ok: false, reason: 'not_html' };
      }
      const html = await readCapped(response, options.maxBytes ?? WEBSITE_MAX_BYTES);
      if (/<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(html)) return { ok: false, reason: 'login_required' };
      const page = contentType.startsWith('text/plain')
        ? { title: '', description: '', headings: [], text: sanitizeText(html, WEBSITE_TEXT_MAX_CHARS) }
        : extractPage(html, WEBSITE_TEXT_MAX_CHARS);
      if (!page.title && !page.description && !page.text) return { ok: false, reason: 'not_html' };
      return {
        ok: true,
        website: { url: url.href, ...page, fetched_at: (options.now?.() ?? new Date()).toISOString() },
      };
    }
    return { ok: false, reason: 'too_many_redirects' };
  } catch (error) {
    if (signal.aborted) return { ok: false, reason: 'timeout' };
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (error instanceof BlockedAddressError || code === 'EBLOCKED') return { ok: false, reason: 'blocked_address' };
    return { ok: false, reason: 'network_error' };
  }
}

// ---------------------------------------------------------------------------
// Deterministic 6-axis Builder Fingerprint (Stage 1, no model calls)
// ---------------------------------------------------------------------------

const LANGUAGE_AXES: Record<string, Partial<FingerprintVector>> = {
  go: { systems_infra: 1 },
  rust: { systems_infra: 1 },
  c: { systems_infra: 1 },
  'c++': { systems_infra: 1 },
  zig: { systems_infra: 1 },
  shell: { systems_infra: 0.7, data_pipelines: 0.3 },
  hcl: { systems_infra: 1 },
  dockerfile: { systems_infra: 1 },
  nix: { systems_infra: 1 },
  java: { systems_infra: 0.8, data_pipelines: 0.2 },
  elixir: { systems_infra: 1 },
  erlang: { systems_infra: 1 },
  scala: { systems_infra: 0.5, data_pipelines: 0.5 },
  'c#': { systems_infra: 0.6, frontend_ux: 0.4 },
  kotlin: { frontend_ux: 0.6, systems_infra: 0.4 },
  swift: { frontend_ux: 1 },
  dart: { frontend_ux: 1 },
  typescript: { frontend_ux: 0.6, agent_orchestration: 0.2, systems_infra: 0.2 },
  javascript: { frontend_ux: 0.8, systems_infra: 0.2 },
  vue: { frontend_ux: 1 },
  svelte: { frontend_ux: 1 },
  html: { frontend_ux: 1 },
  css: { frontend_ux: 1 },
  scss: { frontend_ux: 1 },
  python: { data_pipelines: 0.4, llm_eval: 0.4, agent_orchestration: 0.2 },
  'jupyter notebook': { llm_eval: 0.5, data_pipelines: 0.5 },
  r: { data_pipelines: 1 },
  julia: { data_pipelines: 0.6, llm_eval: 0.4 },
  sql: { data_pipelines: 1 },
  plpgsql: { data_pipelines: 1 },
  ruby: { product_gtm: 0.4, frontend_ux: 0.3, systems_infra: 0.3 },
  php: { frontend_ux: 0.5, product_gtm: 0.5 },
  mdx: { product_gtm: 0.6, frontend_ux: 0.4 },
};

const AXIS_KEYWORDS: Record<FingerprintAxis, readonly string[]> = {
  systems_infra: [
    'kubernetes', 'k8s', 'docker', 'terraform', 'infrastructure', 'infra', 'devops', 'distributed', 'database',
    'compiler', 'kernel', 'networking', 'backend', 'server', 'grpc', 'cloud', 'aws', 'gcp', 'azure', 'serverless',
    'observability', 'performance', 'ci', 'cli', 'systems', 'embedded', 'wasm', 'webassembly', 'sre',
  ],
  agent_orchestration: [
    'agent', 'agents', 'agentic', 'multi-agent', 'orchestration', 'orchestrator', 'mcp', 'langchain', 'langgraph',
    'autogen', 'crewai', 'tool-use', 'workflow', 'workflows', 'autonomous', 'copilot', 'assistant', 'swarm', 'planner',
  ],
  llm_eval: [
    'llm', 'llms', 'gpt', 'openai', 'anthropic', 'claude', 'gemini', 'eval', 'evals', 'evaluation', 'benchmark',
    'prompt', 'prompts', 'rag', 'embedding', 'embeddings', 'fine-tuning', 'finetuning', 'transformer', 'transformers',
    'machine-learning', 'ml', 'nlp', 'pytorch', 'tensorflow', 'huggingface', 'inference', 'ai',
  ],
  frontend_ux: [
    'react', 'nextjs', 'next', 'vue', 'svelte', 'frontend', 'ui', 'ux', 'design', 'design-system', 'css', 'tailwind',
    'figma', 'mobile', 'ios', 'android', 'web-app', 'webapp', 'accessibility', 'a11y', 'animation', 'components',
  ],
  product_gtm: [
    'product', 'startup', 'saas', 'growth', 'marketing', 'community', 'founder', 'launch', 'customers', 'pricing',
    'gtm', 'go-to-market', 'newsletter', 'seo', 'b2b', 'ecommerce', 'monetization', 'onboarding', 'roadmap',
  ],
  data_pipelines: [
    'data', 'etl', 'elt', 'pipeline', 'pipelines', 'spark', 'kafka', 'airflow', 'dbt', 'sql', 'warehouse',
    'pandas', 'scraping', 'scraper', 'crawler', 'dataset', 'datasets', 'streaming', 'analytics', 'bigquery', 'duckdb',
  ],
};

const KEYWORD_PATTERNS: Record<FingerprintAxis, RegExp> = Object.fromEntries(
  FINGERPRINT_AXES.map((axis) => [
    axis,
    new RegExp(`(?<![a-z0-9])(?:${AXIS_KEYWORDS[axis].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-z0-9])`, 'g'),
  ]),
) as Record<FingerprintAxis, RegExp>;

/**
 * Counts distinct axis keywords in a text, capped so one keyword-stuffed source cannot dominate.
 * @param text - Lowercased text.
 * @param axis - Axis whose keywords to count.
 * @param cap - Maximum distinct keywords credited.
 * @returns Number of distinct keywords found, at most `cap`.
 */
function keywordHits(text: string, axis: FingerprintAxis, cap: number): number {
  const found = new Set(text.match(KEYWORD_PATTERNS[axis]) ?? []);
  return Math.min(cap, found.size);
}

/**
 * Computes the deterministic Stage 1 Builder Fingerprint from repository languages, topics and descriptions,
 * the flagship README, the profile bio and (when available) website text. Pure and fast (well under 50ms).
 * @param input - Normalized snapshot parts.
 * @returns A 0–100 score per axis; all zeros when there is no signal.
 */
export function computeFingerprint(input: {
  profile: Pick<GithubProfile, 'bio'>;
  repos: readonly GithubRepoSummary[];
  readme: ReadmeExcerpt | null;
  website: WebsiteSummary | null;
}): FingerprintVector {
  const raw: FingerprintVector = { systems_infra: 0, agent_orchestration: 0, llm_eval: 0, frontend_ux: 0, product_gtm: 0, data_pipelines: 0 };
  for (const repo of input.repos) {
    const weight = 1 + Math.min(1, Math.log10(1 + repo.stars) / 2);
    const langAxes = repo.language ? LANGUAGE_AXES[repo.language.toLowerCase()] : undefined;
    for (const axis of FINGERPRINT_AXES) raw[axis] += (langAxes?.[axis] ?? 0) * weight;
    const text = `${repo.full_name.split('/')[1] ?? ''} ${repo.topics.join(' ')} ${repo.description}`.toLowerCase().replace(/[_.]/g, '-');
    for (const axis of FINGERPRINT_AXES) raw[axis] += 0.5 * keywordHits(text, axis, 2) * weight;
  }
  const readme = (input.readme?.excerpt ?? '').toLowerCase();
  const bio = input.profile.bio.toLowerCase();
  const site = input.website
    ? `${input.website.title} ${input.website.description} ${input.website.headings.join(' ')} ${input.website.text}`.toLowerCase()
    : '';
  for (const axis of FINGERPRINT_AXES) {
    raw[axis] += 0.25 * keywordHits(readme, axis, 4) + 0.5 * keywordHits(bio, axis, 3) + 0.3 * keywordHits(site, axis, 5);
  }
  const vector = { ...raw };
  for (const axis of FINGERPRINT_AXES) vector[axis] = Math.round(100 * (1 - Math.exp(-raw[axis] / 2.5)));
  return vector;
}

// ---------------------------------------------------------------------------
// Orchestration: one participant's bounded retrieval
// ---------------------------------------------------------------------------

export interface FetchGithubOptions {
  pool?: TokenPool;
  fetchImpl?: typeof fetch;
  websiteUrl?: string | null;
  fetchWebsite?: (url: string) => Promise<WebsiteResult>;
  timeoutMs?: number;
  maxCalls?: number;
  now?: () => Date;
}

/**
 * Retrieves a participant's public GitHub footprint within the call budget (profile, repositories, flagship README)
 * and, in parallel, their optional public website, then computes the Builder Fingerprint.
 * Only public endpoints are called; a website failure never fails the GitHub crawl.
 * @param rawUsername - GitHub login as entered (normalized to lowercase).
 * @param options - Pool, fetch, website and budget overrides.
 * @returns The normalized snapshot, ready to cache.
 * @throws GithubFetchError for an unknown user, exhausted rate limits, or GitHub being unavailable.
 */
export async function fetchGithubSnapshot(rawUsername: string, options: FetchGithubOptions = {}): Promise<GithubSnapshot> {
  const username = rawUsername.trim().replace(/^@/, '').toLowerCase();
  if (!GithubUsernameSchema.safeParse(username).success) throw new GithubFetchError('github_user_not_found', 'not a valid GitHub username');
  const now = options.now ?? (() => new Date());
  const started = Date.now();
  const fetchedAt = now().toISOString();
  const budget: CallBudget = {
    pool: options.pool ?? defaultTokenPool(),
    fetchImpl: options.fetchImpl ?? fetch,
    deadline: started + (options.timeoutMs ?? GITHUB_TIMEOUT_MS),
    calls: 0,
    maxCalls: options.maxCalls ?? MAX_GITHUB_CALLS,
  };

  const websitePromise: Promise<WebsiteResult | null> = options.websiteUrl
    ? (options.fetchWebsite ?? ((url: string) => fetchPublicWebsite(url, { now })))(options.websiteUrl).catch(
        (): WebsiteResult => ({ ok: false, reason: 'network_error' }),
      )
    : Promise.resolve(null);

  const [userResponse, reposResponse] = await Promise.all([
    githubGet(`/users/${username}`, budget),
    githubGet(`/users/${username}/repos?type=owner&sort=pushed&per_page=30`, budget),
  ]);
  if (!userResponse) throw new GithubFetchError('github_user_not_found', `GitHub user ${username} not found`);
  const userJson: unknown = await userResponse.json().catch(() => null);
  if (!userJson || (userJson as Record<string, unknown>).type === 'Organization') {
    throw new GithubFetchError('github_user_not_found', `${username} is not a GitHub user account`);
  }
  const { profile, userId, avatarUrl } = normalizeProfile(userJson, username, fetchedAt);
  const repos = normalizeRepos(reposResponse ? await reposResponse.json().catch(() => []) : [], fetchedAt);

  let readme: ReadmeExcerpt | null = null;
  const flagship = flagshipRepo(repos);
  if (flagship && budget.calls < budget.maxCalls && Date.now() < budget.deadline) {
    try {
      const response = await githubGet(`/repos/${flagship.full_name}/readme`, budget, 'application/vnd.github.raw+json');
      const excerpt = response ? sanitizeText(await response.text(), README_MAX_CHARS, { keepNewlines: true }) : '';
      if (excerpt) readme = { repo_full_name: flagship.full_name, html_url: `${flagship.html_url}#readme`, excerpt };
    } catch {
      readme = null; // A README is enrichment; the profile and repositories already succeeded.
    }
  }

  const base: GithubSnapshot = {
    version: 1,
    username,
    user_id: userId,
    avatar_url: avatarUrl,
    profile,
    repos,
    readme,
    website: null,
    website_requested_url: null,
    public_website: false,
    website_skip_reason: null,
    fingerprint: computeFingerprint({ profile, repos, readme, website: null }),
    fetched_at: fetchedAt,
    api_calls: budget.calls,
    duration_ms: 0,
  };
  const snapshot = applyWebsite(base, options.websiteUrl ?? null, await websitePromise);
  snapshot.duration_ms = Date.now() - started;
  return snapshot;
}

/**
 * Normalizes a website URL for comparison, so `https://A.example` and `https://a.example/` count as the same request.
 * @param url - Requested website URL, or `null`.
 * @returns The canonical form, or `null`.
 */
export function canonicalWebsiteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/**
 * Returns a copy of a snapshot carrying the outcome of a website request (or none), with the fingerprint recomputed.
 * @param snapshot - Snapshot whose GitHub parts are kept as-is.
 * @param requestedUrl - The website the participant asked for, or `null` for none.
 * @param result - The fetch outcome, or `null` when no website was requested.
 * @returns The updated snapshot.
 */
export function applyWebsite(snapshot: GithubSnapshot, requestedUrl: string | null, result: WebsiteResult | null): GithubSnapshot {
  const website = requestedUrl && result?.ok ? result.website : null;
  return {
    ...snapshot,
    website,
    website_requested_url: canonicalWebsiteUrl(requestedUrl),
    public_website: website !== null,
    website_skip_reason: requestedUrl && result && !result.ok ? result.reason : null,
    fingerprint: computeFingerprint({ profile: snapshot.profile, repos: snapshot.repos, readme: snapshot.readme, website }),
  };
}

/**
 * Brings a (cached) snapshot in line with the website a participant now requests, fetching only the website — never
 * GitHub. With no website requested, any previously attached site is removed.
 * @param snapshot - Existing snapshot.
 * @param requestedUrl - Website now requested, or `null` for none.
 * @param options - Website fetcher and clock overrides.
 * @returns The updated snapshot.
 */
export async function refreshWebsite(
  snapshot: GithubSnapshot,
  requestedUrl: string | null,
  options: Pick<FetchGithubOptions, 'fetchWebsite' | 'now'> = {},
): Promise<GithubSnapshot> {
  if (!requestedUrl) return applyWebsite(snapshot, null, null);
  const fetchWebsite = options.fetchWebsite ?? ((url: string) => fetchPublicWebsite(url, { now: options.now }));
  const result = await fetchWebsite(requestedUrl).catch((): WebsiteResult => ({ ok: false, reason: 'network_error' }));
  return applyWebsite(snapshot, requestedUrl, result);
}

// ---------------------------------------------------------------------------
// EvidenceReceipt normalization
// ---------------------------------------------------------------------------

/**
 * Builds a one-line, 1–280 character evidence summary.
 * @param parts - Candidate fragments; empty ones are skipped.
 * @returns The joined, bounded summary.
 */
function summary(...parts: string[]): string {
  return truncate(parts.filter(Boolean).join(' — '), 280) || 'Public GitHub activity';
}

/**
 * Converts a snapshot into contract-valid `EvidenceReceipt` records: the profile, each repository, the flagship
 * README excerpt and (when fetched) the public website. Every GitHub receipt cites a github.com permalink.
 * @param snapshot - A fetched or cached snapshot.
 * @param participantId - Owning participant's UUID.
 * @param newId - Id generator (defaults to random UUIDs).
 * @returns Receipts validated against `EvidenceReceiptSchema`.
 */
export function toEvidenceReceipts(snapshot: GithubSnapshot, participantId: string, newId: () => string = randomUUID): EvidenceReceipt[] {
  const fetched_at = snapshot.fetched_at;
  const drafts = [
    {
      source_type: 'user_profile' as const,
      source_url: snapshot.profile.html_url,
      repo_full_name: null,
      title_or_summary: summary(`@${snapshot.username}`, snapshot.profile.name, snapshot.profile.bio),
      source_updated_at: snapshot.profile.updated_at,
    },
    ...snapshot.repos.map((repo) => ({
      source_type: 'repo_metadata' as const,
      source_url: repo.html_url,
      repo_full_name: repo.full_name,
      title_or_summary: summary(repo.full_name, repo.description || repo.language || 'public repository', repo.topics.slice(0, 5).join(', ')),
      source_updated_at: repo.pushed_at,
    })),
    ...(snapshot.readme
      ? [
          {
            source_type: 'readme_excerpt' as const,
            source_url: snapshot.readme.html_url,
            repo_full_name: snapshot.readme.repo_full_name,
            title_or_summary: summary(snapshot.readme.excerpt.replace(/\s+/g, ' ')),
            source_updated_at: snapshot.repos.find((r) => r.full_name === snapshot.readme?.repo_full_name)?.pushed_at ?? fetched_at,
          },
        ]
      : []),
    ...(snapshot.website
      ? [
          {
            source_type: 'public_website' as const,
            source_url: snapshot.website.url,
            repo_full_name: null,
            title_or_summary: summary(snapshot.website.title, snapshot.website.description || snapshot.website.text),
            source_updated_at: snapshot.website.fetched_at,
          },
        ]
      : []),
  ];
  return drafts.map((draft) => EvidenceReceiptSchema.parse({ id: newId(), participant_id: participantId, ...draft, fetched_at }));
}
