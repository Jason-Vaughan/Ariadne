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
const GITHUB_PATH_PATTERN = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39}(?:\/[A-Za-z0-9._-]{1,100})?)/gi;
const REPO_TOKEN_PATTERN = /(^|[^A-Za-z0-9._\/-])([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})(?=$|[^A-Za-z0-9._\/-])/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Any dotted host-like token, wherever it sits (after `.`, `/`, `_`, letters…); emails are removed first.
const HOST_PATTERN = /((?:[A-Za-z0-9-]+\.)+([A-Za-z]{2,}))(\/[^\s)<>"']*)?/g;
// Endings of code and file names (`Node.js`, `main.py`); a pathless token with one of these is not a link.
// Real TLDs that are also common code endings (sh, net…) are deliberately absent: they fail safe as links.
const CODE_SUFFIXES: ReadonlySet<string> = new Set(['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'rb', 'kt', 'swift', 'md', 'json', 'yml', 'yaml', 'toml', 'lock', 'html', 'css', 'scss', 'sql', 'wasm']);

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

/**
 * Lists every http(s) URL in a text, without trailing punctuation.
 * @param text - Free text.
 * @returns The URLs, in order of appearance.
 */
export function extractUrls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''));
}

/**
 * Whether a text contains an email address.
 * @param text - Free text.
 * @returns True when an email-shaped string is present.
 */
export function containsEmail(text: string): boolean {
  return EMAIL_PATTERN.test(text);
}

/**
 * Lists every github.com path mentioned in a text, with or without a scheme (`owner` or `owner/repo`).
 * @param text - Free text.
 * @returns Lowercased paths without trailing punctuation.
 */
export function extractGithubPaths(text: string): string[] {
  return [...text.matchAll(GITHUB_PATH_PATTERN)].map((m) => m[1]!.replace(/[.,;:!?]+$/, '').toLowerCase());
}

/**
 * Lists every bare `owner/repo`-shaped token (`a/b`, any case). Callers decide which are allowed,
 * e.g. the pair's own repos or capability pairs such as `Rust/WebRTC`.
 * @param text - Free text with URLs already removed.
 * @returns Lowercased tokens.
 */
export function extractRepoTokens(text: string): string[] {
  return [...text.matchAll(REPO_TOKEN_PATTERN)].map((m) => m[2]!.replace(/[.,;:!?]+$/, '').toLowerCase());
}

/**
 * Lists link-shaped tokens written without a scheme: every dotted host, with or without a path
 * (`gitlab.com/a/b`, `evil.ru`, `Rust/gitlab.com/x`), except pathless code or file names such as
 * `Node.js` or `main.py`. Emails are excluded (callers check them separately).
 * @param text - Free text with full URLs already removed.
 * @returns Lowercased tokens (`host` or `host/path`) without trailing punctuation.
 */
export function extractSchemelessLinks(text: string): string[] {
  const links: string[] = [];
  const withoutEmails = text.replace(new RegExp(EMAIL_PATTERN.source, 'gi'), ' ');
  for (const m of withoutEmails.matchAll(HOST_PATTERN)) {
    const host = m[1]!.toLowerCase();
    const suffix = m[2]!.toLowerCase();
    const path = (m[3] ?? '').replace(/[.,;:!?]+$/, '');
    if (!path && CODE_SUFFIXES.has(suffix)) continue;
    links.push(`${host}${path.toLowerCase()}`);
  }
  return links;
}
