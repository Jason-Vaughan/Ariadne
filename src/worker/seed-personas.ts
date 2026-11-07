import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { writeSnapshot } from '../github/cache.ts';
import { computeFingerprint } from '../github/connector.ts';
import type { GithubRepoSummary, GithubSnapshot } from '../github/connector.ts';
import { analyzeStage1, persistAnalysis } from '../intelligence/capability-agent.ts';
import { discoverStage1, persistOpportunities } from '../intelligence/opportunity-agent.ts';
import { SEED_COUNT, seedProfiles } from '../routes/stage-snapshot.ts';
import type { SeedProfile } from '../routes/stage-snapshot.ts';

export const DEFAULT_SEED_FILE = fileURLToPath(new URL('../../data/golden-seed-24.json', import.meta.url));
const DAY_MS = 86_400_000;

/** One fictional seed builder, as stored in `data/golden-seed-24.json`. */
export interface SeedPersona {
  /** 1-based seed number; matches `ariadne-seed-NN` and the reserved participant id. */
  n: number;
  bio: string;
  repos: Array<{ name: string; language: string | null; topics: string[]; description: string; stars: number; pushed_days_ago: number }>;
  readme: string;
}

export interface HydrateResult {
  hydrated: number;
  claims: number;
  needs: number;
  elapsed_ms: number;
}

/**
 * Loads and validates the seed personas: exactly one per reserved seed number 1..SEED_COUNT.
 * @param path - Seed file.
 * @returns Personas ordered by seed number.
 * @throws If the file is missing, malformed, or does not cover every seed exactly once.
 */
export function loadSeedPersonas(path: string = DEFAULT_SEED_FILE): SeedPersona[] {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { personas?: unknown };
  if (!Array.isArray(doc.personas)) throw new Error(`Seed file ${path} has no personas array`);
  const personas = doc.personas as SeedPersona[];
  const numbers = personas.map((p) => p.n).sort((x, y) => x - y);
  const expected = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);
  if (numbers.length !== SEED_COUNT || numbers.some((n, i) => n !== expected[i])) {
    throw new Error(`Seed file ${path} must define seeds 1..${SEED_COUNT} exactly once`);
  }
  for (const p of personas) {
    if (typeof p.bio !== 'string' || typeof p.readme !== 'string' || !Array.isArray(p.repos) || p.repos.length === 0) {
      throw new Error(`Seed ${p.n} needs a bio, a readme and at least one repo`);
    }
  }
  return [...personas].sort((x, y) => x.n - y.n);
}

/**
 * Builds the synthetic GitHub snapshot for a seed, so it runs through the same A-004/A-005 pipeline as a
 * live participant. Repo ages are relative to `now`, so seeds stay fresh whenever they are hydrated.
 * @param persona - The seed persona.
 * @param seed - The reserved seed identity.
 * @param now - Hydration time.
 * @returns The snapshot, with its deterministic fingerprint.
 */
export function seedSnapshot(persona: SeedPersona, seed: SeedProfile, now: Date): GithubSnapshot {
  const at = now.toISOString();
  const repos: GithubRepoSummary[] = persona.repos.map((r) => {
    const pushed = new Date(now.getTime() - r.pushed_days_ago * DAY_MS).toISOString();
    return {
      full_name: `${seed.github_username}/${r.name}`,
      html_url: `https://github.com/${seed.github_username}/${r.name}`,
      description: r.description,
      language: r.language,
      topics: r.topics,
      stars: r.stars,
      pushed_at: pushed,
      updated_at: pushed,
    };
  });
  const flagship = [...repos].sort((x, y) => y.stars - x.stars)[0]!;
  const profile = {
    name: seed.display_alias,
    bio: persona.bio,
    company: '',
    location: '',
    blog: '',
    html_url: `https://github.com/${seed.github_username}`,
    public_repos: repos.length,
    followers: 0,
    created_at: new Date(now.getTime() - 900 * DAY_MS).toISOString(),
    updated_at: at,
  };
  const readme = { repo_full_name: flagship.full_name, html_url: `${flagship.html_url}#readme`, excerpt: persona.readme };
  return {
    version: 1,
    username: seed.github_username,
    user_id: null,
    avatar_url: null,
    profile,
    repos,
    readme,
    website: null,
    public_website: false,
    website_requested_url: null,
    website_skip_reason: null,
    fingerprint: computeFingerprint({ profile, repos, readme, website: null }),
    fetched_at: at,
    api_calls: 0,
    duration_ms: 0,
  };
}

/**
 * Deterministic UUID factory for one seed's records, so re-hydrating a seed rewrites the same ids.
 * @param seedNumber - Seed number.
 * @returns A function returning the next id.
 */
function seedIdFactory(seedNumber: number): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    const hex = createHash('sha256').update(`ariadne-seed:${seedNumber}:${counter}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
}

/**
 * Gives every seed row already in the pool (inserted by `setSeedMode`) a full, scorable profile: a
 * snapshot with fingerprint, evidence receipts, capability claims and opportunity needs. Seeds go through
 * the same deterministic Stage 1 agents as live participants. No events are published, so enabling seed
 * mode does not flood the stage activity feed.
 * @param db - Open database.
 * @param options - Hydration time and an optional persona list (defaults to the seed file).
 * @returns How many seeds were hydrated and how many claims and needs they got.
 */
export function hydrateSeedPersonas(db: DatabaseSync, options: { now?: Date; personas?: readonly SeedPersona[] } = {}): HydrateResult {
  const started = performance.now();
  const now = options.now ?? new Date();
  const personas = new Map((options.personas ?? loadSeedPersonas()).map((p) => [p.n, p]));
  const present = new Set((db.prepare("SELECT id FROM participants WHERE consent_status = 'granted'").all() as Array<{ id: string }>).map((r) => r.id));
  let hydrated = 0;
  let claims = 0;
  let needs = 0;
  seedProfiles().forEach((seed, index) => {
    const persona = personas.get(index + 1);
    if (!persona || !present.has(seed.id)) return;
    const snapshot = seedSnapshot(persona, seed, now);
    writeSnapshot(db, snapshot, { participantId: seed.id, now });
    const newId = seedIdFactory(index + 1);
    const analysis = analyzeStage1(snapshot, seed.id, { newId });
    const stored = persistAnalysis(db, analysis, { publish: false, now });
    const opportunities = discoverStage1({ snapshot, capabilities: analysis, goal: null }, { now, newId });
    const storedNeeds = persistOpportunities(db, opportunities, analysis.receipts, { publish: false, now });
    hydrated += 1;
    claims += stored.claims;
    needs += storedNeeds.needs;
  });
  return { hydrated, claims, needs, elapsed_ms: Math.round((performance.now() - started) * 10) / 10 };
}
