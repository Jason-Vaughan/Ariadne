import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  CAPABILITY_CATEGORIES,
  CapabilityClaimSchema,
  PROFICIENCY_SIGNALS,
  UNCERTAINTY_NOTE_THRESHOLD,
} from '../contracts/index.ts';
import type { CapabilityClaim, EvidenceReceipt } from '../contracts/index.ts';
import { publishEvent } from '../events/bus.ts';
import type { PublishResult } from '../events/bus.ts';
import { computeFingerprint, FINGERPRINT_AXES, toEvidenceReceipts } from '../github/connector.ts';
import type { FingerprintVector, GithubSnapshot } from '../github/connector.ts';
import { sanitizeText } from '../github/sanitize.ts';
import { buildCapabilityPrompt, CAPABILITY_PROMPT_VERSION, CAPABILITY_SYSTEM_PROMPT } from './prompts.ts';
import type { PromptLongText } from './prompts.ts';

export const STAGE2_TIMEOUT_MS = 4000;
export const DEFAULT_LLM_MODEL = 'gemini-2.5-flash';
/** Stage 1 keeps its strongest claims; Stage 2 gets its own slots so model inferences are never crowded out. */
export const MAX_STAGE1_CLAIMS = 16;
/** Website-only (SELF_REPORTED) claims get their own slots so a busy GitHub profile cannot erase them. */
export const MAX_SELF_REPORTED_CLAIMS = 4;
export const MAX_STAGE2_CLAIMS = 8;
/** How far Stage 2 may move any fingerprint axis from the deterministic baseline. */
export const MAX_FINGERPRINT_SHIFT = 25;

type Category = CapabilityClaim['category'];
type Proficiency = CapabilityClaim['proficiency_signal'];

export interface CapabilityAnalysis {
  participant_id: string;
  receipts: EvidenceReceipt[];
  claims: CapabilityClaim[];
  fingerprint: FingerprintVector;
  /** Up to 3 short "what they bring" phrases for /me and /stage. */
  superpowers: string[];
  stage: 1 | 2;
  llm: { used: boolean; model: string | null; prompt_version: string | null; fallback_reason: Stage2FallbackReason | null; rejected_claims: number };
  duration_ms: number;
}

export type Stage2FallbackReason = 'no_client' | 'timeout' | 'llm_error' | 'invalid_response' | 'no_valid_claims';

// ---------------------------------------------------------------------------
// Stage 1: deterministic OBSERVED_FACT extraction
// ---------------------------------------------------------------------------

/** Known technology tokens (as they appear in topics/descriptions) → canonical claim name and category. */
const KNOWN_TECH: Record<string, { name: string; category: Category }> = {
  react: { name: 'React', category: 'framework' },
  nextjs: { name: 'Next.js', category: 'framework' },
  'next-js': { name: 'Next.js', category: 'framework' },
  vue: { name: 'Vue', category: 'framework' },
  svelte: { name: 'Svelte', category: 'framework' },
  angular: { name: 'Angular', category: 'framework' },
  tailwind: { name: 'Tailwind CSS', category: 'framework' },
  tailwindcss: { name: 'Tailwind CSS', category: 'framework' },
  django: { name: 'Django', category: 'framework' },
  fastapi: { name: 'FastAPI', category: 'framework' },
  flask: { name: 'Flask', category: 'framework' },
  express: { name: 'Express', category: 'framework' },
  fastify: { name: 'Fastify', category: 'framework' },
  rails: { name: 'Ruby on Rails', category: 'framework' },
  spring: { name: 'Spring', category: 'framework' },
  pytorch: { name: 'PyTorch', category: 'framework' },
  tensorflow: { name: 'TensorFlow', category: 'framework' },
  langchain: { name: 'LangChain', category: 'framework' },
  langgraph: { name: 'LangGraph', category: 'framework' },
  'react-native': { name: 'React Native', category: 'framework' },
  flutter: { name: 'Flutter', category: 'framework' },
  docker: { name: 'Docker', category: 'tooling' },
  kubernetes: { name: 'Kubernetes', category: 'tooling' },
  k8s: { name: 'Kubernetes', category: 'tooling' },
  terraform: { name: 'Terraform', category: 'tooling' },
  'github-actions': { name: 'GitHub Actions', category: 'tooling' },
  aws: { name: 'AWS', category: 'tooling' },
  gcp: { name: 'Google Cloud', category: 'tooling' },
  azure: { name: 'Azure', category: 'tooling' },
  postgres: { name: 'PostgreSQL', category: 'tooling' },
  postgresql: { name: 'PostgreSQL', category: 'tooling' },
  sqlite: { name: 'SQLite', category: 'tooling' },
  redis: { name: 'Redis', category: 'tooling' },
  kafka: { name: 'Kafka', category: 'tooling' },
  airflow: { name: 'Airflow', category: 'tooling' },
  dbt: { name: 'dbt', category: 'tooling' },
  llm: { name: 'Large language models', category: 'domain' },
  llms: { name: 'Large language models', category: 'domain' },
  agents: { name: 'AI agents', category: 'domain' },
  'ai-agents': { name: 'AI agents', category: 'domain' },
  'multi-agent': { name: 'Multi-agent systems', category: 'domain' },
  mcp: { name: 'Model Context Protocol', category: 'domain' },
  rag: { name: 'Retrieval-augmented generation', category: 'domain' },
  evals: { name: 'LLM evaluation', category: 'domain' },
  'machine-learning': { name: 'Machine learning', category: 'domain' },
  'computer-vision': { name: 'Computer vision', category: 'domain' },
  nlp: { name: 'Natural language processing', category: 'domain' },
  blockchain: { name: 'Blockchain', category: 'domain' },
  'data-engineering': { name: 'Data engineering', category: 'domain' },
  devops: { name: 'DevOps', category: 'domain' },
  'distributed-systems': { name: 'Distributed systems', category: 'systems_architecture' },
  microservices: { name: 'Microservices', category: 'systems_architecture' },
  serverless: { name: 'Serverless architecture', category: 'systems_architecture' },
  'event-driven': { name: 'Event-driven architecture', category: 'systems_architecture' },
  compiler: { name: 'Compilers', category: 'systems_architecture' },
  compilers: { name: 'Compilers', category: 'systems_architecture' },
};

const TECH_PATTERN = new RegExp(
  `(?<![a-z0-9-])(${Object.keys(KNOWN_TECH)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?![a-z0-9-])`,
  'g',
);

/**
 * Finds the canonical technologies mentioned in a text.
 * @param text - Text to scan (topics, description, README, website).
 * @returns Canonical tech entries, de-duplicated by name.
 */
function techIn(text: string): { name: string; category: Category }[] {
  const found = new Map<string, { name: string; category: Category }>();
  for (const match of text.toLowerCase().replace(/[_.]/g, '-').matchAll(TECH_PATTERN)) {
    const tech = KNOWN_TECH[match[1] ?? ''];
    if (tech) found.set(tech.name, tech);
  }
  return [...found.values()];
}

/**
 * Maps how many repositories show a capability to the contract's proficiency signal.
 * @param repoCount - Repositories evidencing the capability.
 * @param share - Fraction of the participant's repositories that evidence it.
 * @returns The proficiency signal.
 */
function proficiencyFor(repoCount: number, share: number): Proficiency {
  if (repoCount >= 3 || share >= 0.4) return 'primary';
  if (repoCount >= 2) return 'active';
  return 'exploratory';
}

/**
 * Stage 1: extracts OBSERVED_FACT claims (primary languages, frameworks, tools, domains and architectures named in
 * repository metadata or the flagship README) and SELF_REPORTED claims stated only on the participant's own website,
 * plus the deterministic fingerprint. No network or model calls; every claim cites receipts from this snapshot.
 * @param snapshot - A3 GitHub snapshot (fetched or cached).
 * @param participantId - Owning participant's UUID.
 * @param options - Id generator override (tests).
 * @returns A Stage 1 analysis.
 */
export function analyzeStage1(snapshot: GithubSnapshot, participantId: string, options: { newId?: () => string } = {}): CapabilityAnalysis {
  const started = performance.now();
  const newId = options.newId ?? randomUUID;
  const receipts = toEvidenceReceipts(snapshot, participantId, newId);
  const repoReceipt = new Map(receipts.filter((r) => r.source_type === 'repo_metadata').map((r) => [r.repo_full_name, r.id]));
  const readmeReceipt = receipts.find((r) => r.source_type === 'readme_excerpt');
  const websiteReceipt = receipts.find((r) => r.source_type === 'public_website');
  const repoCount = Math.max(1, snapshot.repos.length);

  const evidence = new Map<string, { category: Category; name: string; repos: Set<string>; ids: Set<string>; inTopics: boolean }>();
  const note = (category: Category, name: string, receiptId: string, repo: string | null, inTopics: boolean): void => {
    const key = `${category}:${name.toLowerCase()}`;
    const entry = evidence.get(key) ?? { category, name, repos: new Set<string>(), ids: new Set<string>(), inTopics: false };
    entry.ids.add(receiptId);
    if (repo) entry.repos.add(repo);
    entry.inTopics ||= inTopics;
    evidence.set(key, entry);
  };

  for (const repo of snapshot.repos) {
    const receiptId = repoReceipt.get(repo.full_name);
    if (!receiptId) continue;
    if (repo.language) note('language', repo.language, receiptId, repo.full_name, true);
    for (const tech of techIn(repo.topics.join(' '))) note(tech.category, tech.name, receiptId, repo.full_name, true);
    for (const tech of techIn(`${repo.full_name.split('/')[1] ?? ''} ${repo.description}`)) note(tech.category, tech.name, receiptId, repo.full_name, false);
  }
  if (readmeReceipt && snapshot.readme) {
    for (const tech of techIn(snapshot.readme.excerpt)) note(tech.category, tech.name, readmeReceipt.id, snapshot.readme.repo_full_name, false);
  }

  const claims: CapabilityClaim[] = [];
  for (const entry of evidence.values()) {
    const repos = entry.repos.size;
    const proficiency = proficiencyFor(repos, repos / repoCount);
    const confidence = entry.category === 'language' || entry.inTopics ? (proficiency === 'exploratory' ? 0.8 : 0.9) : 0.75;
    claims.push(
      CapabilityClaimSchema.parse({
        id: newId(),
        participant_id: participantId,
        category: entry.category,
        name: entry.name,
        epistemic_type: 'OBSERVED_FACT',
        proficiency_signal: proficiency,
        confidence,
        uncertainty_note: null,
        evidence_receipt_ids: [...entry.ids].slice(0, 5),
        dismissed_by_user: false,
      }),
    );
  }

  if (websiteReceipt && snapshot.website) {
    const site = `${snapshot.website.title} ${snapshot.website.description} ${snapshot.website.headings.join(' ')} ${snapshot.website.text}`;
    const known = new Set(claims.map((c) => `${c.category}:${c.name.toLowerCase()}`));
    for (const tech of techIn(site)) {
      if (known.has(`${tech.category}:${tech.name.toLowerCase()}`)) continue;
      claims.push(
        CapabilityClaimSchema.parse({
          id: newId(),
          participant_id: participantId,
          category: tech.category,
          name: tech.name,
          epistemic_type: 'SELF_REPORTED',
          proficiency_signal: 'exploratory',
          confidence: 0.6,
          uncertainty_note: "Stated on the participant's own website; not yet seen in their public repositories.",
          evidence_receipt_ids: [websiteReceipt.id],
          dismissed_by_user: false,
        }),
      );
    }
  }

  const ranked = [
    ...rankClaims(claims.filter((c) => c.epistemic_type !== 'SELF_REPORTED')).slice(0, MAX_STAGE1_CLAIMS),
    ...rankClaims(claims.filter((c) => c.epistemic_type === 'SELF_REPORTED')).slice(0, MAX_SELF_REPORTED_CLAIMS),
  ];
  const fingerprint = computeFingerprint(snapshot);
  return {
    participant_id: participantId,
    receipts,
    claims: ranked,
    fingerprint,
    superpowers: superpowersFrom(ranked),
    stage: 1,
    llm: { used: false, model: null, prompt_version: null, fallback_reason: null, rejected_claims: 0 },
    duration_ms: Math.round(performance.now() - started),
  };
}

const PROFICIENCY_RANK: Record<Proficiency, number> = { primary: 3, active: 2, exploratory: 1 };
const EPISTEMIC_RANK: Record<CapabilityClaim['epistemic_type'], number> = { OBSERVED_FACT: 3, AI_INFERENCE: 2, SELF_REPORTED: 1 };

/**
 * Orders claims for display: observed facts first, then stronger proficiency, more evidence and higher confidence.
 * @param claims - Claims to order.
 * @returns A new, sorted array.
 */
function rankClaims(claims: readonly CapabilityClaim[]): CapabilityClaim[] {
  return [...claims].sort(
    (a, b) =>
      EPISTEMIC_RANK[b.epistemic_type] - EPISTEMIC_RANK[a.epistemic_type] ||
      PROFICIENCY_RANK[b.proficiency_signal] - PROFICIENCY_RANK[a.proficiency_signal] ||
      b.evidence_receipt_ids.length - a.evidence_receipt_ids.length ||
      b.confidence - a.confidence ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Derives up to three "what they bring" phrases from the strongest non-language claims (languages as fallback).
 * @param claims - Ranked claims.
 * @returns Short phrases such as `"Kubernetes (3 repos)"`.
 */
function superpowersFrom(claims: readonly CapabilityClaim[]): string[] {
  const preferred = claims.filter((c) => c.category !== 'language' && c.epistemic_type !== 'SELF_REPORTED');
  const pool = preferred.length > 0 ? preferred : claims.filter((c) => c.epistemic_type !== 'SELF_REPORTED');
  return pool.slice(0, 3).map((c) => (c.evidence_receipt_ids.length > 1 ? `${c.name} (${c.evidence_receipt_ids.length} sources)` : c.name));
}

// ---------------------------------------------------------------------------
// Stage 2: LLM enrichment with closed-world citation checks
// ---------------------------------------------------------------------------

export interface LlmRequest {
  system: string;
  prompt: string;
  signal: AbortSignal;
}

/** Minimal model interface: returns the model's raw text (expected to be JSON). Injected in tests. */
export interface LlmClient {
  model: string;
  complete(request: LlmRequest): Promise<string>;
}

/**
 * Gemini client over the REST `generateContent` endpoint (no SDK dependency), asking for a JSON response.
 * The API key travels in the `x-goog-api-key` header, never in the URL.
 * @param options - API key, model and fetch override.
 * @returns An `LlmClient`.
 */
export function geminiClient(options: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): LlmClient {
  const model = options.model ?? DEFAULT_LLM_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    model,
    async complete({ system, prompt, signal }) {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 2048 },
        }),
      });
      if (!response.ok) throw new Error(`Gemini answered ${response.status}`);
      const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    },
  };
}

/**
 * Builds the default LLM client from `ARIADNE_LLM_API_KEY` (or `GEMINI_API_KEY`), with `ARIADNE_LLM_MODEL` overriding
 * the model.
 * @param env - Environment to read.
 * @returns A Gemini client, or `null` when no key is configured (Stage 1 only).
 */
export function llmClientFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  const apiKey = (env.ARIADNE_LLM_API_KEY ?? env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return geminiClient({ apiKey, model: env.ARIADNE_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL });
}

const Stage2ClaimSchema = z.object({
  category: z.enum(CAPABILITY_CATEGORIES),
  name: z.string().min(1).max(200),
  epistemic_type: z.enum(['OBSERVED_FACT', 'AI_INFERENCE']),
  proficiency_signal: z.enum(PROFICIENCY_SIGNALS),
  confidence: z.number().min(0).max(1),
  uncertainty_note: z.string().max(1000).nullable().optional(),
  evidence_receipt_ids: z.array(z.string()).min(1).max(20),
});

const Stage2ResponseSchema = z.object({
  claims: z.array(Stage2ClaimSchema).max(30),
  fingerprint: z.object(Object.fromEntries(FINGERPRINT_AXES.map((axis) => [axis, z.number().min(0).max(100)])) as Record<
    (typeof FINGERPRINT_AXES)[number],
    z.ZodNumber
  >),
  superpowers: z.array(z.string()).max(10).optional(),
});

/**
 * Parses the model's text as JSON, tolerating a fenced code block around it.
 * @param text - Raw model output.
 * @returns The parsed value, or `undefined` when it is not JSON.
 */
function parseModelJson(text: string): unknown {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * Keeps each fingerprint axis within `MAX_FINGERPRINT_SHIFT` of the deterministic baseline, so a manipulated or
 * confused model can refine but not rewrite the fingerprint.
 * @param baseline - Stage 1 fingerprint.
 * @param proposed - Model fingerprint.
 * @returns The bounded, averaged fingerprint.
 */
export function refineFingerprint(baseline: FingerprintVector, proposed: FingerprintVector): FingerprintVector {
  const refined = { ...baseline };
  for (const axis of FINGERPRINT_AXES) {
    const blended = Math.round((baseline[axis] + proposed[axis]) / 2);
    refined[axis] = Math.max(0, Math.min(100, Math.max(baseline[axis] - MAX_FINGERPRINT_SHIFT, Math.min(baseline[axis] + MAX_FINGERPRINT_SHIFT, blended))));
  }
  return refined;
}

/**
 * Collects the longer evidence texts (README excerpt, website text) to show the model, keyed to their receipts.
 * @param snapshot - Snapshot the receipts came from.
 * @param receipts - Stage 1 receipts.
 * @returns Texts with the receipt id they belong to.
 */
function longTextsFor(snapshot: GithubSnapshot, receipts: readonly EvidenceReceipt[]): PromptLongText[] {
  const texts: PromptLongText[] = [];
  const readme = receipts.find((r) => r.source_type === 'readme_excerpt');
  if (readme && snapshot.readme) texts.push({ receipt_id: readme.id, label: `README ${snapshot.readme.repo_full_name}`, text: snapshot.readme.excerpt.slice(0, 2500) });
  const site = receipts.find((r) => r.source_type === 'public_website');
  if (site && snapshot.website) {
    const w = snapshot.website;
    texts.push({ receipt_id: site.id, label: 'Personal website', text: [w.title, w.description, ...w.headings, w.text].filter(Boolean).join('\n').slice(0, 1500) });
  }
  return texts;
}

/**
 * Stage 2: asks the model to enrich Stage 1 and accepts only what it can verify. Every claim must cite receipt ids
 * from this snapshot (unknown ids are stripped; a claim left with none is dropped). An OBSERVED_FACT whose name does
 * not appear in its cited evidence is relabelled AI_INFERENCE. AI_INFERENCE claims carry an uncertainty note and a
 * confidence below 0.85. On no client, timeout, error, or an unusable answer, Stage 1 is returned unchanged with the
 * reason.
 * @param stage1 - Result of `analyzeStage1`.
 * @param snapshot - The snapshot Stage 1 analysed.
 * @param options - LLM client (default: from env), timeout and id generator.
 * @returns The Stage 2 analysis, or Stage 1 with `llm.fallback_reason`.
 */
export async function enrichStage2(
  stage1: CapabilityAnalysis,
  snapshot: GithubSnapshot,
  options: { client?: LlmClient | null; timeoutMs?: number; newId?: () => string } = {},
): Promise<CapabilityAnalysis> {
  const started = performance.now();
  const client = options.client === undefined ? llmClientFromEnv() : options.client;
  const fallback = (reason: Stage2FallbackReason, rejected = 0): CapabilityAnalysis => ({
    ...stage1,
    llm: { used: false, model: client?.model ?? null, prompt_version: client ? CAPABILITY_PROMPT_VERSION : null, fallback_reason: reason, rejected_claims: rejected },
  });
  if (!client) return fallback('no_client');

  const newId = options.newId ?? randomUUID;
  const prompt = buildCapabilityPrompt({
    receipts: stage1.receipts,
    longTexts: longTextsFor(snapshot, stage1.receipts),
    baseline: stage1.fingerprint,
    stage1Claims: stage1.claims,
  });
  const signal = AbortSignal.timeout(options.timeoutMs ?? STAGE2_TIMEOUT_MS);
  let raw: string;
  try {
    raw = await new Promise<string>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      client.complete({ system: CAPABILITY_SYSTEM_PROMPT, prompt, signal }).then(resolve, reject);
    });
  } catch {
    return fallback(signal.aborted ? 'timeout' : 'llm_error');
  }

  const parsed = Stage2ResponseSchema.safeParse(parseModelJson(raw));
  if (!parsed.success) return fallback('invalid_response');

  const receiptById = new Map(stage1.receipts.map((r) => [r.id, r]));
  const known = new Set(stage1.claims.map((c) => `${c.category}:${c.name.toLowerCase()}`));
  const added: CapabilityClaim[] = [];
  let rejected = 0;
  for (const proposal of parsed.data.claims) {
    const ids = [...new Set(proposal.evidence_receipt_ids)].filter((id) => receiptById.has(id)).slice(0, 5);
    const name = sanitizeText(proposal.name, 80);
    if (ids.length === 0 || !name) {
      rejected += 1;
      continue;
    }
    const key = `${proposal.category}:${name.toLowerCase()}`;
    if (known.has(key)) continue;
    const citedText = ids.map((id) => receiptById.get(id)?.title_or_summary ?? '').join(' ').toLowerCase();
    const observed = proposal.epistemic_type === 'OBSERVED_FACT' && citedText.includes(name.toLowerCase());
    const confidence = observed ? proposal.confidence : Math.min(proposal.confidence, 0.84);
    const givenNote = sanitizeText(proposal.uncertainty_note ?? '', 280);
    const needsNote = !observed || confidence < UNCERTAINTY_NOTE_THRESHOLD;
    const uncertainty_note = needsNote
      ? givenNote || (observed ? 'Low-confidence reading of the cited evidence.' : 'Inferred by the model from the cited evidence; not stated directly.')
      : givenNote || null;
    const claim = CapabilityClaimSchema.safeParse({
      id: newId(),
      participant_id: stage1.participant_id,
      category: proposal.category,
      name,
      epistemic_type: observed ? 'OBSERVED_FACT' : 'AI_INFERENCE',
      proficiency_signal: proposal.proficiency_signal,
      confidence,
      uncertainty_note,
      evidence_receipt_ids: ids,
      dismissed_by_user: false,
    });
    if (!claim.success) {
      rejected += 1;
      continue;
    }
    known.add(key);
    added.push(claim.data);
    if (added.length === MAX_STAGE2_CLAIMS) break;
  }
  if (added.length === 0 && parsed.data.claims.length > 0 && rejected === parsed.data.claims.length) return fallback('no_valid_claims', rejected);

  const claims = rankClaims([...stage1.claims, ...added]);
  const modelSuperpowers = (parsed.data.superpowers ?? [])
    .map((s) => sanitizeText(s, 60))
    .filter((s) => s && !/https?:|@|www\./i.test(s))
    .slice(0, 3);
  return {
    ...stage1,
    claims,
    fingerprint: refineFingerprint(stage1.fingerprint, parsed.data.fingerprint as FingerprintVector),
    superpowers: modelSuperpowers.length > 0 ? modelSuperpowers : superpowersFrom(claims),
    stage: 2,
    llm: { used: true, model: client.model, prompt_version: CAPABILITY_PROMPT_VERSION, fallback_reason: null, rejected_claims: rejected },
    duration_ms: stage1.duration_ms + Math.round(performance.now() - started),
  };
}

/**
 * Runs both stages: the deterministic Stage 1 immediately, then Stage 2 enrichment with fallback to Stage 1.
 * @param snapshot - GitHub snapshot to analyse.
 * @param participantId - Owning participant's UUID.
 * @param options - LLM client, timeout and id generator.
 * @returns The best available analysis.
 */
export async function analyzeProfile(
  snapshot: GithubSnapshot,
  participantId: string,
  options: { client?: LlmClient | null; timeoutMs?: number; newId?: () => string } = {},
): Promise<CapabilityAnalysis> {
  return enrichStage2(analyzeStage1(snapshot, participantId, { newId: options.newId }), snapshot, options);
}

// ---------------------------------------------------------------------------
// Persistence and event emission
// ---------------------------------------------------------------------------

export interface PersistResult {
  receipts: number;
  claims: number;
  event: PublishResult | null;
}

/**
 * Stores an analysis and (optionally) announces it. In one transaction it replaces the participant's evidence
 * receipts and non-dismissed claims; claims the participant dismissed are kept, and a new claim with the same category
 * and name as a dismissed one is not re-added. Then it publishes `profile.analysis.completed` by display alias,
 * adding the public username/avatar only when the participant gave stage display consent.
 * @param db - Open database with the A-001 schema (the participant row must exist).
 * @param analysis - Result of `analyzeStage1` / `enrichStage2` / `analyzeProfile`.
 * @param options - `publish` (default true) and event time.
 * @returns Counts written and the published event, if any.
 * @throws If the participant does not exist (nothing is written).
 */
export function persistAnalysis(db: DatabaseSync, analysis: CapabilityAnalysis, options: { publish?: boolean; now?: Date } = {}): PersistResult {
  const participant = db
    .prepare('SELECT display_alias, github_username, avatar_url, stage_display_consent FROM participants WHERE id = ?')
    .get(analysis.participant_id) as
    | { display_alias: string; github_username: string; avatar_url: string | null; stage_display_consent: number }
    | undefined;
  if (!participant) throw new Error(`Participant ${analysis.participant_id} does not exist`);

  let claimsWritten = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const dismissed = new Set(
      (db.prepare('SELECT category, name FROM capability_claims WHERE participant_id = ? AND dismissed_by_user = 1').all(analysis.participant_id) as { category: string; name: string }[]).map(
        (row) => `${row.category}:${row.name.toLowerCase()}`,
      ),
    );
    db.prepare('DELETE FROM capability_claims WHERE participant_id = ? AND dismissed_by_user = 0').run(analysis.participant_id);
    db.prepare('DELETE FROM evidence_receipts WHERE participant_id = ?').run(analysis.participant_id);
    const insertReceipt = db.prepare(
      `INSERT INTO evidence_receipts (id, participant_id, source_type, source_url, repo_full_name, title_or_summary, source_updated_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of analysis.receipts) {
      insertReceipt.run(r.id, r.participant_id, r.source_type, r.source_url, r.repo_full_name, r.title_or_summary, r.source_updated_at, r.fetched_at);
    }
    const insertClaim = db.prepare(
      `INSERT INTO capability_claims (id, participant_id, category, name, epistemic_type, proficiency_signal, confidence, uncertainty_note, evidence_receipt_ids, dismissed_by_user)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const c of analysis.claims) {
      if (dismissed.has(`${c.category}:${c.name.toLowerCase()}`)) continue;
      insertClaim.run(c.id, c.participant_id, c.category, c.name, c.epistemic_type, c.proficiency_signal, c.confidence, c.uncertainty_note, JSON.stringify(c.evidence_receipt_ids));
      claimsWritten += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  let event: PublishResult | null = null;
  if (options.publish ?? true) {
    const display =
      participant.stage_display_consent === 1
        ? { display: { stage_display_consent: true as const, github_username: participant.github_username, avatar_url: participant.avatar_url } }
        : {};
    event = publishEvent(
      db,
      'profile.analysis.completed',
      { display_alias: participant.display_alias, ...display, capability_count: claimsWritten },
      { occurredAt: options.now },
    );
  }
  return { receipts: analysis.receipts.length, claims: claimsWritten, event };
}
