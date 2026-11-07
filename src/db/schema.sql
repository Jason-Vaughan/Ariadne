-- Ariadne SQLite schema (DATA_AND_EVENTS_CONTRACT.md). Idempotent: safe to apply on every boot.
-- Booleans are INTEGER 0/1; JSON columns are TEXT checked with json_valid; timestamps are ISO-8601 TEXT.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS participants (
  id                     TEXT PRIMARY KEY,
  pseudonym              TEXT NOT NULL UNIQUE,
  github_username        TEXT NOT NULL UNIQUE CHECK (github_username = lower(github_username)),
  github_user_id         INTEGER UNIQUE,
  avatar_url             TEXT,
  website_url            TEXT CHECK (website_url IS NULL OR website_url LIKE 'https://%'),
  ownership_verified     INTEGER NOT NULL DEFAULT 0 CHECK (ownership_verified IN (0, 1)),
  consent_status         TEXT NOT NULL CHECK (consent_status IN ('granted', 'withdrawn')),
  consent_granted_at     TEXT NOT NULL,
  public_display_consent INTEGER NOT NULL DEFAULT 0 CHECK (public_display_consent IN (0, 1)),
  contact_card           TEXT,
  analysis_state         TEXT NOT NULL DEFAULT 'registered' CHECK (analysis_state IN
                           ('registered', 'fetching_github', 'analyzing_profile', 'ready', 'failed', 'withdrawn')),
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

-- 24-hour GitHub/website fetch cache. participant_id is nullable so judges can be pre-warmed before they register.
CREATE TABLE IF NOT EXISTS github_snapshots (
  github_username TEXT PRIMARY KEY CHECK (github_username = lower(github_username)),
  participant_id  TEXT REFERENCES participants(id) ON DELETE CASCADE,
  payload_json    TEXT NOT NULL CHECK (json_valid(payload_json)),
  fetched_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_github_snapshots_participant ON github_snapshots(participant_id);

CREATE TABLE IF NOT EXISTS evidence_receipts (
  id                TEXT PRIMARY KEY,
  participant_id    TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL CHECK (source_type IN
                      ('repo_metadata', 'readme_excerpt', 'commit_activity', 'open_issue',
                       'pull_request', 'user_profile', 'public_website')),
  source_url        TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  repo_full_name    TEXT,
  title_or_summary  TEXT NOT NULL CHECK (length(title_or_summary) BETWEEN 1 AND 280),
  source_updated_at TEXT NOT NULL,
  fetched_at        TEXT NOT NULL,
  CHECK (source_type = 'public_website' OR source_url LIKE 'https://github.com/%')
);
CREATE INDEX IF NOT EXISTS idx_evidence_receipts_participant ON evidence_receipts(participant_id);

CREATE TABLE IF NOT EXISTS capability_claims (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  category              TEXT NOT NULL CHECK (category IN
                          ('language', 'framework', 'domain', 'systems_architecture', 'tooling')),
  name                  TEXT NOT NULL,
  epistemic_type        TEXT NOT NULL CHECK (epistemic_type IN ('SELF_REPORTED', 'OBSERVED_FACT', 'AI_INFERENCE')),
  proficiency_signal    TEXT NOT NULL CHECK (proficiency_signal IN ('primary', 'active', 'exploratory')),
  confidence            REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  uncertainty_note      TEXT,
  evidence_receipt_ids  TEXT NOT NULL CHECK (json_valid(evidence_receipt_ids)
                          AND json_type(evidence_receipt_ids) = 'array'
                          AND json_array_length(evidence_receipt_ids) >= 1),
  dismissed_by_user     INTEGER NOT NULL DEFAULT 0 CHECK (dismissed_by_user IN (0, 1)),
  CHECK (uncertainty_note IS NOT NULL OR (confidence >= 0.75 AND epistemic_type <> 'AI_INFERENCE'))
);
CREATE INDEX IF NOT EXISTS idx_capability_claims_participant ON capability_claims(participant_id);

CREATE TABLE IF NOT EXISTS opportunity_needs (
  id                   TEXT PRIMARY KEY,
  participant_id       TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  project_repo         TEXT NOT NULL,
  opportunity_type     TEXT NOT NULL CHECK (opportunity_type IN
                         ('open_issue_help', 'complementary_skill_gap', 'architecture_scaling', 'shared_research_domain')),
  label                TEXT NOT NULL DEFAULT 'Potential Opportunity (AI Inference)' CHECK (label IN
                         ('Potential Opportunity (AI Inference)', 'Participant Confirmed Need')),
  summary              TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 240),
  desired_capabilities TEXT NOT NULL CHECK (json_valid(desired_capabilities) AND json_type(desired_capabilities) = 'array'),
  confidence           REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  uncertainty_note     TEXT NOT NULL,
  evidence_receipt_ids TEXT NOT NULL CHECK (json_valid(evidence_receipt_ids) AND json_type(evidence_receipt_ids) = 'array'),
  dismissed_by_user    INTEGER NOT NULL DEFAULT 0 CHECK (dismissed_by_user IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_opportunity_needs_participant ON opportunity_needs(participant_id);

CREATE TABLE IF NOT EXISTS matches (
  id                            TEXT PRIMARY KEY,
  participant_a_id              TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  participant_b_id              TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  composite_score               INTEGER NOT NULL CHECK (composite_score BETWEEN 0 AND 100),
  score_breakdown               TEXT NOT NULL CHECK (json_valid(score_breakdown) AND json_type(score_breakdown) = 'object'),
  complementary_summary         TEXT NOT NULL,
  relevant_projects             TEXT NOT NULL CHECK (json_valid(relevant_projects) AND json_type(relevant_projects) = 'array'),
  suggested_first_collaboration TEXT NOT NULL,
  confidence_limitations        TEXT NOT NULL,
  evidence_receipt_ids          TEXT NOT NULL CHECK (json_valid(evidence_receipt_ids)
                                  AND json_type(evidence_receipt_ids) = 'array'
                                  AND json_array_length(evidence_receipt_ids) >= 2),
  intro_state                   TEXT NOT NULL DEFAULT 'candidate' CHECK (intro_state IN
                                  ('candidate', 'proposed_by_a', 'proposed_by_b', 'mutual_accepted', 'completed', 'declined')),
  approval_a                    INTEGER NOT NULL DEFAULT 0 CHECK (approval_a IN (0, 1)),
  approval_b                    INTEGER NOT NULL DEFAULT 0 CHECK (approval_b IN (0, 1)),
  shared_intro_notes            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(shared_intro_notes)
                                  AND json_type(shared_intro_notes) = 'array'),
  created_at                    TEXT NOT NULL,
  updated_at                    TEXT NOT NULL,
  CHECK (participant_a_id < participant_b_id),
  -- Each intro state implies exactly which participants have explicitly approved.
  CHECK (CASE intro_state
           WHEN 'candidate'       THEN approval_a = 0 AND approval_b = 0
           WHEN 'proposed_by_a'   THEN approval_a = 1 AND approval_b = 0
           WHEN 'proposed_by_b'   THEN approval_a = 0 AND approval_b = 1
           WHEN 'mutual_accepted' THEN approval_a = 1 AND approval_b = 1
           WHEN 'completed'       THEN approval_a = 1 AND approval_b = 1
           ELSE NOT (approval_a = 1 AND approval_b = 1)
         END),
  UNIQUE (participant_a_id, participant_b_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_participant_b ON matches(participant_b_id);
CREATE INDEX IF NOT EXISTS idx_matches_intro_state ON matches(intro_state);

-- Append-only public event log; seq_id is the SSE Last-Event-ID / poll cursor.
-- idempotency_key lets a repeated decision insert nothing instead of a duplicate event.
CREATE TABLE IF NOT EXISTS domain_events (
  seq_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL CHECK (type IN
                    ('participant.registered', 'github.fetch.started', 'github.fetch.completed',
                     'profile.analysis.completed', 'opportunity.identified', 'match.candidate.generated',
                     'match.evaluated', 'introduction.proposed', 'introduction.accepted',
                     'introduction.declined', 'introduction.completed', 'analysis.failed')),
  payload_json    TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  idempotency_key TEXT UNIQUE,
  occurred_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS async_jobs (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  payload_json   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  attempts       INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  run_after      TEXT NOT NULL,
  last_error     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_async_jobs_ready ON async_jobs(status, run_after);
