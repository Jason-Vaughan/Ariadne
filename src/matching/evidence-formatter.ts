import { EvidenceReceiptSchema } from '../contracts/index.ts';
import type { EvidenceReceipt } from '../contracts/index.ts';

/** One clickable evidence pill on a match card. */
export interface EvidencePill {
  receipt_id: string;
  /** Which participant the receipt belongs to. */
  side: 'a' | 'b';
  label: string;
  url: string;
  repo: string | null;
  source_type: EvidenceReceipt['source_type'];
  source_updated_at: string;
}

const SOURCE_LABELS: Readonly<Record<EvidenceReceipt['source_type'], string>> = {
  repo_metadata: 'Repository',
  readme_excerpt: 'README',
  commit_activity: 'Recent commits',
  open_issue: 'Open issue',
  pull_request: 'Pull request',
  user_profile: 'GitHub profile',
  public_website: 'Website',
};

const URL_PATTERN = /https?:\/\/[^\s)<>"'\]]+/gi;
const GITHUB_PATH_PATTERN = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9._\/-]*/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const HANDLE_PATTERN = /(^|[^A-Za-z0-9._%+-])(@[A-Za-z0-9-]{1,39})\b/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const HOST_PATTERN = /((?:[A-Za-z0-9-]+\.)+([A-Za-z]{2,}))(\/[^\s)<>"']*)?/g;
const REPO_TOKEN_PATTERN = /(^|[^A-Za-z0-9._\/-])([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})(?=$|[^A-Za-z0-9._\/-])/g;
// Endings of code and file names (`Node.js`, `index.ts`) that are not also real top-level domains;
// a pathless token with one of these is not a link. Ambiguous ones (md, rs, py, sh, io, net…) count as links.
const CODE_SUFFIXES: ReadonlySet<string> = new Set(['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'kt', 'swift', 'json', 'yml', 'yaml', 'toml', 'lock', 'html', 'css', 'scss', 'sql', 'wasm']);
const STOCK_SLASH_PHRASES: ReadonlySet<string> = new Set(['and/or', 'either/or', 'n/a']);
const MIN_PHONE_DIGITS = 9;

/**
 * Turns the cited receipts of a pair into evidence pills: only receipts in `citedIds` that
 * belong to one of the two participants and pass `EvidenceReceiptSchema`, deduplicated by URL within each side,
 * ordered side A first, then by most recent activity.
 * @param citedIds - Receipt ids the pair's score cites.
 * @param participantA - Participant A's id and receipts.
 * @param participantB - Participant B's id and receipts.
 * @returns The pills.
 */
export function formatEvidencePills(
  citedIds: readonly string[],
  participantA: { id: string; evidence: readonly EvidenceReceipt[] },
  participantB: { id: string; evidence: readonly EvidenceReceipt[] },
): EvidencePill[] {
  const cited = new Set(citedIds);
  const pills: EvidencePill[] = [];
  for (const [side, owner] of [['a', participantA], ['b', participantB]] as const) {
    // Deduplicate per side: two people may legitimately cite the same shared repo.
    const seenUrls = new Set<string>();
    const receipts = owner.evidence
      .filter((r) => cited.has(r.id) && r.participant_id === owner.id && EvidenceReceiptSchema.safeParse(r).success)
      .sort((x, y) => Date.parse(y.source_updated_at) - Date.parse(x.source_updated_at) || (x.id < y.id ? -1 : 1));
    for (const r of receipts) {
      if (seenUrls.has(r.source_url)) continue;
      seenUrls.add(r.source_url);
      pills.push({
        receipt_id: r.id,
        side,
        label: r.repo_full_name ? `${SOURCE_LABELS[r.source_type]}: ${r.repo_full_name}` : SOURCE_LABELS[r.source_type],
        url: r.source_url,
        repo: r.repo_full_name,
        source_type: r.source_type,
        source_updated_at: r.source_updated_at,
      });
    }
  }
  return pills;
}

/**
 * Whether pills can back a surfaced match: at least two distinct URLs, at least one per side.
 * @param pills - The pair's pills.
 * @returns True when the evidence gate holds.
 */
export function hasCrossEvidence(pills: readonly EvidencePill[]): boolean {
  return pills.length >= 2 && pills.some((p) => p.side === 'a') && pills.some((p) => p.side === 'b');
}

export type PrivateSpanKind = 'private' | 'link' | 'repo';

/** A stretch of text that must not reach a match card or pass the Stage 2 gate. */
export interface PrivateSpan {
  start: number;
  end: number;
  kind: PrivateSpanKind;
}

/** What a pair may legitimately mention, and what identifies its two participants. */
export interface PrivacyContext {
  /** The pair's evidence URLs. */
  allowedUrls: readonly string[];
  /** The pair's repo names (`owner/repo`). */
  allowedRepos: readonly string[];
  /** Public display aliases. */
  aliases: readonly string[];
  contactCards: readonly string[];
  /** GitHub logins; only allowed inside the pair's own repo names and URLs. */
  logins: readonly string[];
  /** Normalized capability names the pair holds or needs (`Rust/WebRTC`, `Node.js` are not links). */
  capabilities: ReadonlySet<string>;
}

/**
 * Normalizes a capability-like token for comparison: lowercase, whitespace and underscores as `-`.
 * @param value - Token.
 * @returns Normalized token.
 */
function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * Every case-insensitive occurrence of each needle.
 * @param lower - Lowercased haystack.
 * @param needles - Strings to find.
 * @returns `[start, end)` intervals.
 */
function occurrences(lower: string, needles: readonly string[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (const needle of needles) {
    const n = needle.toLowerCase();
    if (!n) continue;
    for (let i = lower.indexOf(n); i !== -1; i = lower.indexOf(n, i + 1)) found.push([i, i + n.length]);
  }
  return found;
}

/**
 * The single privacy detector shared by the Stage 1 scrub and the Stage 2 gate. It finds:
 * - contact cards, emails, @handles, phone numbers, and GitHub logins outside the pair's own repos/URLs (`private`);
 * - URLs, `github.com/...` paths and schemeless hosts that are not the pair's evidence (`link`);
 * - bare `owner/repo` names that are not the pair's (`repo`).
 * The pair's own URLs, repo names and aliases are protected; capability names and pathless code/file
 * names (`Node.js`) are not links.
 * @param text - Text to inspect.
 * @param ctx - The pair's privacy context.
 * @returns Non-overlapping spans in text order.
 */
export function findPrivateSpans(text: string, ctx: PrivacyContext): PrivateSpan[] {
  const lower = text.toLowerCase();
  const allowedUrls = new Set(ctx.allowedUrls.map((u) => u.toLowerCase()));
  const allowedRepos = new Set(ctx.allowedRepos.map((r) => r.toLowerCase()));
  const allowedPaths = new Set([...allowedRepos, ...ctx.allowedUrls.map((u) => u.toLowerCase().replace(/^https?:\/\/(?:www\.)?github\.com\//, '').replace(/\/$/, ''))]);
  const protectedIv = occurrences(lower, [...ctx.allowedUrls, ...ctx.allowedRepos, ...ctx.aliases]);
  const spans: PrivateSpan[] = [];
  const within = (start: number, end: number, ivs: ReadonlyArray<readonly [number, number]>): boolean => ivs.some(([s, e]) => start >= s && end <= e);
  const covered = (start: number, end: number): boolean => within(start, end, protectedIv) || within(start, end, spans.map((sp) => [sp.start, sp.end] as const));
  const trimEnd = (value: string): string => value.replace(/[.,;:!?]+$/, '');

  for (const [start, end] of occurrences(lower, ctx.contactCards)) spans.push({ start, end, kind: 'private' });
  for (const m of text.matchAll(URL_PATTERN)) {
    const url = trimEnd(m[0]);
    if (!allowedUrls.has(url.toLowerCase()) && !covered(m.index!, m.index! + url.length)) spans.push({ start: m.index!, end: m.index! + url.length, kind: 'link' });
  }
  for (const m of text.matchAll(GITHUB_PATH_PATTERN)) {
    const token = trimEnd(m[0]);
    const path = token.toLowerCase().replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//, '').replace(/\/$/, '');
    if (allowedPaths.has(path)) protectedIv.push([m.index!, m.index! + token.length]);
    else if (!covered(m.index!, m.index! + token.length)) spans.push({ start: m.index!, end: m.index! + token.length, kind: 'link' });
  }
  for (const m of text.matchAll(EMAIL_PATTERN)) {
    if (!covered(m.index!, m.index! + m[0].length)) spans.push({ start: m.index!, end: m.index! + m[0].length, kind: 'private' });
  }
  for (const m of text.matchAll(HANDLE_PATTERN)) {
    const start = m.index! + m[1]!.length;
    if (!covered(start, start + m[2]!.length)) spans.push({ start, end: start + m[2]!.length, kind: 'private' });
  }
  for (const m of text.matchAll(PHONE_PATTERN)) {
    if ((m[0].match(/\d/g) ?? []).length >= MIN_PHONE_DIGITS && !covered(m.index!, m.index! + m[0].length)) {
      spans.push({ start: m.index!, end: m.index! + m[0].length, kind: 'private' });
    }
  }
  for (const m of text.matchAll(HOST_PATTERN)) {
    const token = trimEnd(m[0]);
    const end = m.index! + token.length;
    const suffix = m[2]!.toLowerCase();
    const hasPath = token.length > m[1]!.length;
    if (covered(m.index!, end) || (!hasPath && CODE_SUFFIXES.has(suffix)) || ctx.capabilities.has(normalizeToken(token))) continue;
    spans.push({ start: m.index!, end, kind: 'link' });
  }
  for (const m of text.matchAll(REPO_TOKEN_PATTERN)) {
    const token = trimEnd(m[2]!);
    const start = m.index! + m[1]!.length;
    const t = token.toLowerCase();
    const isCapabilityPair = t.split('/').every((part) => ctx.capabilities.has(normalizeToken(part)));
    // Fractions such as a 76/100 score are not repos.
    if (/^[\d/]+$/.test(t) || covered(start, start + token.length) || allowedRepos.has(t) || STOCK_SLASH_PHRASES.has(t) || isCapabilityPair) continue;
    spans.push({ start, end: start + token.length, kind: 'repo' });
  }
  for (const login of ctx.logins) {
    // Logins are [a-z0-9-] by contract (GithubUsernameSchema), so they need no escaping.
    const pattern = new RegExp(`(^|[^a-z0-9-])(${login.toLowerCase()})(?=$|[^a-z0-9-])`, 'g');
    for (const m of lower.matchAll(pattern)) {
      const start = m.index! + m[1]!.length;
      if (!covered(start, start + login.length)) spans.push({ start, end: start + login.length, kind: 'private' });
    }
  }
  spans.sort((x, y) => x.start - y.start || y.end - x.end);
  const merged: PrivateSpan[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/**
 * Replaces every private span: private details become `[redacted]`, foreign links and repos `[link removed]`.
 * @param text - Text to clean.
 * @param ctx - The pair's privacy context.
 * @returns The cleaned text.
 */
export function scrubPrivateDetails(text: string, ctx: PrivacyContext): string {
  let out = text;
  for (const span of findPrivateSpans(text, ctx).reverse()) {
    out = `${out.slice(0, span.start)}${span.kind === 'private' ? '[redacted]' : '[link removed]'}${out.slice(span.end)}`;
  }
  return out;
}
