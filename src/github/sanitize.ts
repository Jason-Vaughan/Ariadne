/**
 * Text hygiene for everything Ariadne reads from GitHub or a participant's website. That text later
 * reaches LLM prompts (A-004/A-005/A-007) and screens, so it is reduced to plain, bounded prose with
 * markup, control characters and instruction-shaped injections removed.
 */

// Zero-width, bidi-override and other invisible formatting characters that can hide instructions.
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;
// C0/C1 control characters except tab and newline.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
};

/** Phrases that address a model rather than describe a builder. Matched case-insensitively. */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|the)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|context|messages?)\b/gi,
  /\b(?:you are now|act as|pretend to be|from now on,? you)\b[^.\n]{0,80}/gi,
  /\b(?:system|developer)\s+(?:prompt|message|instructions?)\b/gi,
  /<\|[^|>]{0,40}\|>/g,
  /\[\/?(?:INST|SYS)\]/gi,
  /<<\/?SYS>>/gi,
];

// A chat role marker opening a line or a sentence ("…bio. system: obey"); "operating system: Linux" is left alone.
const ROLE_MARKER = /(^|[.!?]\s+|\n\s*)(?:system|assistant|user|developer)\s*:/gim;

export const REDACTED = '[redacted]';

/**
 * Decodes the HTML entities that commonly appear in page text (named subset plus numeric forms).
 * @param text - Text possibly containing entities.
 * @returns Text with entities decoded; unknown or invalid entities are left as written.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Removes every HTML tag and comment, including the contents of non-prose elements.
 * @param html - Markup to strip.
 * @returns Text with tags replaced by spaces and entities decoded.
 */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(script|style|noscript|template|svg|iframe|object)\b[^>]*>[\s\S]*$/gi, ' ')
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      .replace(/<[!?][^>]*>/g, ' '),
  );
}

/**
 * Replaces instruction-shaped phrases and model control tokens with `[redacted]`.
 * @param text - Text to scan.
 * @returns The text with every injection pattern replaced.
 */
export function redactInjections(text: string): string {
  let out = text;
  for (const pattern of INJECTION_PATTERNS) out = out.replace(pattern, REDACTED);
  return out.replace(ROLE_MARKER, `$1${REDACTED}`);
}

/**
 * Truncates to a maximum length on a word boundary where one is near, appending an ellipsis.
 * @param text - Text to bound.
 * @param max - Maximum length of the result, ellipsis included.
 * @returns The text, at most `max` characters long.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, Math.max(0, max));
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Reduces untrusted external text to bounded plain prose: no markup, control or invisible characters,
 * instruction-shaped injections replaced with `[redacted]`, whitespace collapsed.
 * @param input - Untrusted text (may contain HTML or markdown).
 * @param max - Maximum output length.
 * @param options - `keepNewlines` preserves paragraph breaks (collapsed to single newlines).
 * @returns Sanitized text, possibly empty.
 */
export function sanitizeText(input: string | null | undefined, max: number, options: { keepNewlines?: boolean } = {}): string {
  if (!input) return '';
  // Redact before stripping (model control tokens are angle-bracketed) and again after (tags can split a
  // phrase). Angle brackets go after entity decoding, so an encoded `&lt;script&gt;` cannot return as markup.
  let text = redactInjections(input.normalize('NFKC').replace(INVISIBLE, ''));
  text = redactInjections(stripHtml(text).replace(INVISIBLE, '')).replace(/[<>]/g, ' ').replace(CONTROL, ' ');
  // Markdown images/links keep their visible text only; code fences and HTML-ish leftovers go.
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`{1,3}/g, '');
  text = redactInjections(text);
  text = options.keepNewlines
    ? text.replace(/[ \t]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim()
    : text.replace(/\s+/g, ' ').trim();
  return truncate(text, max);
}

export interface ExtractedPage {
  title: string;
  description: string;
  headings: string[];
  text: string;
}

/**
 * Extracts the parts of a web page worth citing: `<title>`, meta description, h1–h3 headings and body text.
 * @param html - Raw page HTML (already size-bounded by the caller).
 * @param maxText - Maximum length of the body text.
 * @returns Sanitized page parts; empty strings when a part is absent.
 */
export function extractPage(html: string, maxText = 3500): ExtractedPage {
  const title = sanitizeText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 200);
  const metaTag =
    /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i.exec(html)?.[0] ??
    /<meta\b[^>]*\bproperty\s*=\s*["']og:description["'][^>]*>/i.exec(html)?.[0] ??
    '';
  const description = sanitizeText(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(metaTag)?.slice(1).find(Boolean), 280);
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/gi)) {
    const heading = sanitizeText(match[1], 120);
    if (heading && !headings.includes(heading)) headings.push(heading);
    if (headings.length === 12) break;
  }
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(html)?.[1] ?? html.replace(/<head\b[\s\S]*?<\/head\s*>/i, ' ');
  return { title, description, headings, text: sanitizeText(body, maxText) };
}
