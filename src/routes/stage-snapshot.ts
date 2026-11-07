import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { sendJson } from '../server.ts';
import type { RouteDefinition } from '../server.ts';

// ---------------------------------------------------------------------------
// Seed pool
// ---------------------------------------------------------------------------

export const SEED_COUNT = 25;
/** Seed rows use reserved UUIDs under this prefix, so "is a seed" needs no extra column. */
export const SEED_ID_PREFIX = '5eed0000-0000-4000-8000-';
/** Rendered match edges per node on the Web of Connections. */
export const TOP_K = 3;

export interface SeedProfile {
  id: string;
  display_alias: string;
  github_username: string;
}

/**
 * The 25 reserved seed participants: fixed ids, `Seed-NNNN` aliases and `ariadne-seed-NN` handles.
 * Seeds never carry contact cards, stage-display consent or evidence.
 * @returns Seed profiles in insertion order.
 */
export function seedProfiles(): SeedProfile[] {
  return Array.from({ length: SEED_COUNT }, (_, i) => {
    const n = String(i + 1);
    return {
      id: `${SEED_ID_PREFIX}${n.padStart(12, '0')}`,
      display_alias: `Seed-${n.padStart(4, '0')}`,
      github_username: `ariadne-seed-${n.padStart(2, '0')}`,
    };
  });
}

/**
 * Whether a participant id belongs to the reserved seed range.
 * @param id - Participant id.
 * @returns True for seed participants.
 */
export function isSeedId(id: string): boolean {
  return id.startsWith(SEED_ID_PREFIX);
}

export interface SeedToggleResult {
  seed_mode: boolean;
  seed_count: number;
  elapsed_ms: number;
}

/**
 * Put the seed pool into, or take it out of, the live matching pool. Taking it out deletes the
 * seed rows, and their matches go with them (ON DELETE CASCADE).
 * @param db - Open database.
 * @param enabled - Desired seed mode.
 * @param now - Timestamp written to inserted rows.
 * @returns The resulting seed mode, seed row count and how long the change took.
 */
export function setSeedMode(db: DatabaseSync, enabled: boolean, now: Date = new Date()): SeedToggleResult {
  const started = performance.now();
  const at = now.toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (enabled) {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO participants
           (id, display_alias, github_username, consent_status, consent_granted_at, stage_display_consent,
            analysis_state, created_at, updated_at)
         VALUES (?, ?, ?, 'granted', ?, 0, 'ready', ?, ?)`,
      );
      for (const seed of seedProfiles()) insert.run(seed.id, seed.display_alias, seed.github_username, at, at, at);
    } else {
      db.prepare('DELETE FROM participants WHERE id LIKE ?').run(`${SEED_ID_PREFIX}%`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const seedCount = countSeeds(db);
  return { seed_mode: seedCount > 0, seed_count: seedCount, elapsed_ms: Math.round((performance.now() - started) * 10) / 10 };
}

/**
 * Count seed participants currently in the pool.
 * @param db - Open database.
 * @returns Number of seed rows.
 */
function countSeeds(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM participants WHERE id LIKE ?').get(`${SEED_ID_PREFIX}%`) as { n: number };
  return Number(row.n);
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export type EdgeState = 'suggested' | 'one_sided' | 'golden';

export interface StageNode {
  alias: string;
  label: string;
  is_seed: boolean;
  analysis_state: string;
  /** Present only when the participant consented to stage display and privacy mode is off. */
  display: { github_username: string; avatar_url: string | null } | null;
}

export interface StageEdge {
  match_id: string;
  a: string;
  b: string;
  score: number;
  state: EdgeState;
}

export interface StageSnapshot {
  generated_at: string;
  privacy_mode: boolean;
  seed_mode: boolean;
  presenter: boolean;
  join_url: string | null;
  latest_seq_id: number;
  kpis: {
    live_builders: number;
    seed_builders: number;
    profiles_ready: number;
    matches: number;
    one_sided: number;
    golden_threads: number;
  };
  nodes: StageNode[];
  edges: StageEdge[];
}

/**
 * Map a match's introduction state to how the stage draws it; declined matches are not drawn.
 * @param introState - `matches.intro_state`.
 * @returns The edge state, or null when the edge is hidden.
 */
export function edgeStateFor(introState: string): EdgeState | null {
  switch (introState) {
    case 'candidate':
      return 'suggested';
    case 'proposed_by_a':
    case 'proposed_by_b':
      return 'one_sided';
    case 'mutual_accepted':
    case 'completed':
      return 'golden';
    default:
      return null;
  }
}

const EDGE_PRIORITY: Record<EdgeState, number> = { golden: 0, one_sided: 1, suggested: 2 };

/**
 * Keep at most `k` edges per node. Golden threads are kept first, then one-sided interest,
 * then the highest scores, so the strongest story survives the cap.
 * @param edges - Candidate edges.
 * @param k - Maximum edges touching any one node.
 * @returns The kept edges, in priority order.
 */
export function capTopEdges(edges: StageEdge[], k: number = TOP_K): StageEdge[] {
  const ordered = [...edges].sort(
    (x, y) => EDGE_PRIORITY[x.state] - EDGE_PRIORITY[y.state] || y.score - x.score || x.match_id.localeCompare(y.match_id),
  );
  const degree = new Map<string, number>();
  const kept: StageEdge[] = [];
  for (const edge of ordered) {
    const da = degree.get(edge.a) ?? 0;
    const db = degree.get(edge.b) ?? 0;
    if (da >= k || db >= k) continue;
    degree.set(edge.a, da + 1);
    degree.set(edge.b, db + 1);
    kept.push(edge);
  }
  return kept;
}

interface ParticipantRow {
  id: string;
  display_alias: string;
  github_username: string;
  avatar_url: string | null;
  stage_display_consent: number;
  analysis_state: string;
}

interface MatchRow {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  composite_score: number;
  intro_state: string;
}

export interface SnapshotOptions {
  privacyMode?: boolean;
  presenter?: boolean;
  joinUrl?: string | null;
  now?: Date;
}

/**
 * Build the public-safe stage state. Participants are identified by display alias; a GitHub
 * handle and avatar appear only with stage-display consent and privacy mode off. Contact cards,
 * participant ids and withdrawn participants never appear.
 * @param db - Open database.
 * @param options - Privacy mode, presenter flag, join URL and clock.
 * @returns The stage snapshot.
 */
export function buildStageSnapshot(db: DatabaseSync, options: SnapshotOptions = {}): StageSnapshot {
  const privacyMode = options.privacyMode ?? false;
  const participants = db
    .prepare(
      `SELECT id, display_alias, github_username, avatar_url, stage_display_consent, analysis_state
         FROM participants WHERE consent_status = 'granted' ORDER BY created_at, display_alias`,
    )
    .all() as unknown as ParticipantRow[];
  const aliasById = new Map<string, string>();
  const nodes: StageNode[] = participants.map((p) => {
    aliasById.set(p.id, p.display_alias);
    const display =
      p.stage_display_consent === 1 && !privacyMode ? { github_username: p.github_username, avatar_url: p.avatar_url } : null;
    return {
      alias: p.display_alias,
      label: display ? `@${display.github_username}` : p.display_alias,
      is_seed: isSeedId(p.id),
      analysis_state: p.analysis_state,
      display,
    };
  });

  const matchRows = db
    .prepare('SELECT id, participant_a_id, participant_b_id, composite_score, intro_state FROM matches')
    .all() as unknown as MatchRow[];
  const allEdges: StageEdge[] = [];
  for (const m of matchRows) {
    const state = edgeStateFor(m.intro_state);
    const a = aliasById.get(m.participant_a_id);
    const b = aliasById.get(m.participant_b_id);
    if (!state || !a || !b) continue;
    allEdges.push({ match_id: m.id, a, b, score: Number(m.composite_score), state });
  }

  const seq = db.prepare('SELECT COALESCE(MAX(seq_id), 0) AS seq FROM domain_events').get() as { seq: number };
  const live = participants.filter((p) => !isSeedId(p.id));
  return {
    generated_at: (options.now ?? new Date()).toISOString(),
    privacy_mode: privacyMode,
    seed_mode: live.length < participants.length,
    presenter: options.presenter ?? false,
    join_url: options.joinUrl ?? null,
    latest_seq_id: Number(seq.seq),
    kpis: {
      live_builders: live.length,
      seed_builders: participants.length - live.length,
      profiles_ready: live.filter((p) => p.analysis_state === 'ready').length,
      matches: allEdges.length,
      one_sided: allEdges.filter((e) => e.state === 'one_sided').length,
      golden_threads: allEdges.filter((e) => e.state === 'golden').length,
    },
    nodes,
    edges: capTopEdges(allEdges),
  };
}

// ---------------------------------------------------------------------------
// Presenter guard and join URL
// ---------------------------------------------------------------------------

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// cloudflared and ngrok add at least one of these to every request they forward.
const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];

/**
 * Whether a request came straight from this machine rather than through the public tunnel,
 * which also arrives on loopback but always carries forwarding headers.
 * @param req - Incoming request.
 * @returns True for a direct local request.
 */
export function isPresenterRequest(req: IncomingMessage): boolean {
  if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '')) return false;
  return PROXY_HEADERS.every((h) => req.headers[h] === undefined);
}

/**
 * The URL attendees open from the stage QR code: `ARIADNE_PUBLIC_URL` + `/join`.
 * @param env - Environment to read.
 * @returns The https join URL, or null when the public URL is unset or not https.
 */
export function resolveJoinUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.ARIADNE_PUBLIC_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL('/join', base);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Read a small JSON request body.
 * @param req - Incoming request.
 * @param limit - Maximum body size in bytes.
 * @returns The parsed body, or `{}` when empty.
 * @throws If the body is too large or not valid JSON.
 */
async function readJsonBody(req: IncomingMessage, limit = 1024): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new SyntaxError('body too large');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

// ---------------------------------------------------------------------------
// QR code (byte mode, error correction level M, versions 1–10)
// ---------------------------------------------------------------------------

// Per version 1..10 at level M: total codewords, error-correction blocks, EC codewords per block.
const QR_TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const QR_BLOCKS_M = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const QR_EC_PER_BLOCK_M = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const QR_ALIGNMENT = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const QR_MAX_VERSION = 10;

/**
 * Multiply in GF(2^8) with the QR reducing polynomial 0x11D.
 * @param x - Field element.
 * @param y - Field element.
 * @returns The product.
 */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/**
 * Reed–Solomon generator polynomial of a given degree, leading coefficient omitted.
 * @param degree - Number of error-correction codewords.
 * @returns Coefficients, highest power first.
 */
function reedSolomonDivisor(degree: number): number[] {
  const result: number[] = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j] ?? 0, root);
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/**
 * Reed–Solomon remainder (the error-correction codewords) of a data block.
 * @param data - Data codewords.
 * @param divisor - Generator from `reedSolomonDivisor`.
 * @returns Error-correction codewords.
 */
function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

/**
 * Bit `i` of `x`.
 * @param x - Integer.
 * @param i - Bit index, 0 = least significant.
 * @returns True when set.
 */
function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/**
 * Whether QR mask `mask` inverts the module at column `x`, row `y`.
 * @param mask - Mask pattern 0–7.
 * @param x - Column.
 * @param y - Row.
 * @returns True when the module is inverted.
 */
function maskInverts(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/**
 * Encode text as a QR code symbol (byte mode, level M, smallest version that fits, best mask).
 * @param text - Text to encode, as UTF-8.
 * @param forcedMask - Mask pattern 0–7 to use instead of choosing by penalty score.
 * @returns Square matrix, `true` = dark module, indexed `[row][column]`.
 * @throws If the text does not fit in version 10.
 */
export function encodeQr(text: string, forcedMask?: number): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  for (; version <= QR_MAX_VERSION; version++) {
    const capacityBits = dataCodewords(version) * 8;
    if (4 + (version < 10 ? 8 : 16) + bytes.length * 8 <= capacityBits) break;
  }
  if (version > QR_MAX_VERSION) throw new RangeError(`QR text too long (${bytes.length} bytes)`);

  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const capacityBits = dataCodewords(version) * 8;
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad);

  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean): void => {
    (modules[y] as boolean[])[x] = dark;
    (isFunction[y] as boolean[])[x] = true;
  };

  const drawFormatBits = (mask: number): void => {
    const formatData = (0b00 << 3) | mask; // level M
    let rem = formatData;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const format = ((formatData << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(format, i));
    set(8, 7, bit(format, 6));
    set(8, 8, bit(format, 7));
    set(7, 8, bit(format, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(format, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(format, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(format, i));
    set(8, size - 8, true);
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const align = QR_ALIGNMENT[version - 1] ?? [];
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      const ax = align[i] as number;
      const ay = align[j] as number;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormatBits(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(versionBits, i));
      set(b, a, bit(versionBits, i));
    }
  }

  const codewords = interleaveWithEcc(data, version);
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!(isFunction[y] as boolean[])[x] && index < codewords.length * 8) {
          (modules[y] as boolean[])[x] = bit(codewords[index >>> 3] as number, 7 - (index & 7));
          index++;
        }
      }
    }
  }

  const applyMask = (mask: number): void => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!(isFunction[y] as boolean[])[x] && maskInverts(mask, x, y)) {
          (modules[y] as boolean[])[x] = !(modules[y] as boolean[])[x];
        }
      }
    }
  };

  let mask = forcedMask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate++) {
      applyMask(candidate);
      drawFormatBits(candidate);
      const penalty = qrPenalty(modules);
      if (penalty < best) {
        best = penalty;
        mask = candidate;
      }
      applyMask(candidate);
    }
  }
  applyMask(mask);
  drawFormatBits(mask);
  return modules;
}

/**
 * Data codewords available in a version at level M.
 * @param version - QR version 1–10.
 * @returns Data codeword count.
 */
function dataCodewords(version: number): number {
  return (QR_TOTAL_CODEWORDS[version - 1] as number) - (QR_BLOCKS_M[version - 1] as number) * (QR_EC_PER_BLOCK_M[version - 1] as number);
}

/**
 * Split data into blocks, append each block's error correction, and interleave the result.
 * @param data - Data codewords.
 * @param version - QR version 1–10.
 * @returns Final codeword sequence.
 */
function interleaveWithEcc(data: number[], version: number): number[] {
  const numBlocks = QR_BLOCKS_M[version - 1] as number;
  const eccLen = QR_EC_PER_BLOCK_M[version - 1] as number;
  const raw = QR_TOTAL_CODEWORDS[version - 1] as number;
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = reedSolomonDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const block = data.slice(k, k + len);
    k += len;
    const ecc = reedSolomonRemainder(block, divisor);
    if (i < numShort) block.push(0);
    blocks.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < (blocks[0] as number[]).length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i] as number);
    });
  }
  return result;
}

/**
 * ISO/IEC 18004 mask penalty score (lower is better).
 * @param modules - Symbol matrix with a mask and format bits applied.
 * @returns Penalty points.
 */
export function qrPenalty(modules: boolean[][]): number {
  const size = modules.length;
  const at = (x: number, y: number): boolean => (modules[y] as boolean[])[x] as boolean;
  let result = 0;

  const addHistory = (length: number, history: number[]): void => {
    if (history[0] === 0) length += size;
    history.pop();
    history.unshift(length);
  };
  const countPatterns = (h: number[]): number => {
    const n = h[1] as number;
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && (h[0] as number) >= n * 4 && (h[6] as number) >= n ? 1 : 0) + (core && (h[6] as number) >= n * 4 && (h[0] as number) >= n ? 1 : 0);
  };
  const scanLine = (get: (i: number) => boolean): void => {
    let runColor = false;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < size; i++) {
      if (get(i) === runColor) {
        run++;
        if (run === 5) result += 3;
        else if (run > 5) result++;
      } else {
        addHistory(run, history);
        if (!runColor) result += countPatterns(history) * 40;
        runColor = get(i);
        run = 1;
      }
    }
    if (runColor) {
      addHistory(run, history);
      run = 0;
    }
    run += size;
    addHistory(run, history);
    result += countPatterns(history) * 40;
  };
  for (let y = 0; y < size; y++) scanLine((x) => at(x, y));
  for (let x = 0; x < size; x++) scanLine((y) => at(x, y));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) result += 3;
    }
  }
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return result;
}

/**
 * Render a QR matrix as a crisp SVG with a 4-module quiet zone.
 * @param modules - Matrix from `encodeQr`.
 * @returns SVG markup.
 */
export function qrToSvg(modules: boolean[][]): string {
  const size = modules.length + 8;
  let path = '';
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/stage/snapshot — public-safe stage state; `?privacy=1` forces pseudonyms for everyone.
 * @param req - Request.
 * @param res - Response.
 * @param ctx - Route context.
 */
function getSnapshot(req: IncomingMessage, res: ServerResponse, ctx: { db: DatabaseSync; url: URL }): void {
  const privacyMode = ctx.url.searchParams.get('privacy') === '1';
  sendJson(res, 200, buildStageSnapshot(ctx.db, { privacyMode, presenter: isPresenterRequest(req), joinUrl: resolveJoinUrl() }));
}

/**
 * POST /api/stage/seed-toggle — presenter-only. Body `{ "enabled": boolean }`; omitted flips the mode.
 * @param req - Request.
 * @param res - Response.
 * @param ctx - Route context.
 */
async function postSeedToggle(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { db: DatabaseSync; log: { info(message: string, fields?: Record<string, unknown>): void } },
): Promise<void> {
  if (!isPresenterRequest(req)) {
    sendJson(res, 403, { error: 'presenter_only', message: 'Stage controls work only from the host machine, not through the public tunnel.' });
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(res, 400, { error: 'invalid_body', message: 'Body must be a JSON object' });
    return;
  }
  const requested = (body as { enabled?: unknown }).enabled;
  if (requested !== undefined && typeof requested !== 'boolean') {
    sendJson(res, 400, { error: 'invalid_body', message: '"enabled" must be a boolean' });
    return;
  }
  const enabled = requested ?? countSeeds(ctx.db) === 0;
  const result = setSeedMode(ctx.db, enabled);
  ctx.log.info('stage seed mode changed', { ...result });
  sendJson(res, 200, result);
}

/**
 * GET /api/stage/join-qr.svg — QR code for the public join URL.
 * @param _req - Request.
 * @param res - Response.
 */
function getJoinQr(_req: IncomingMessage, res: ServerResponse): void {
  const joinUrl = resolveJoinUrl();
  if (!joinUrl) {
    sendJson(res, 404, { error: 'join_url_not_configured', message: 'Set ARIADNE_PUBLIC_URL to the https tunnel URL.' });
    return;
  }
  const svg = qrToSvg(encodeQr(joinUrl));
  res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-length': Buffer.byteLength(svg), 'cache-control': 'no-store' });
  res.end(svg);
}

export const routes: RouteDefinition[] = [
  { method: 'GET', path: '/api/stage/snapshot', handler: getSnapshot },
  { method: 'POST', path: '/api/stage/seed-toggle', handler: postSeedToggle },
  { method: 'GET', path: '/api/stage/join-qr.svg', handler: getJoinQr },
];
