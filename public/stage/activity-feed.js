/** The four narratable pipeline columns of View 1, with the event types each one shows. */
export const PIPELINE_STAGES = [
  {
    key: 'crawl',
    title: '1 · GitHub + Website Crawl',
    subtitle: 'Public profile, repos and an optional public website',
    events: ['participant.registered', 'github.fetch.started', 'analysis.failed'],
  },
  {
    key: 'evidence',
    title: '2 · Evidence & Sanitizer',
    subtitle: 'Every claim must cite a public source',
    events: ['github.fetch.completed'],
  },
  {
    key: 'fingerprint',
    title: '3 · 6-Axis Fingerprint',
    subtitle: 'Capabilities, needs and opportunities',
    events: ['profile.analysis.completed', 'opportunity.identified'],
  },
  {
    key: 'match',
    title: '4 · Match Scorer & Golden Thread',
    subtitle: 'Top-3 matches, mutual opt-in, warm intros',
    events: [
      'match.candidate.generated',
      'match.evaluated',
      'introduction.proposed',
      'introduction.accepted',
      'introduction.declined',
      'introduction.completed',
    ],
  },
];

/** @typedef {{seq_id:number,text:string,golden:boolean}} EventLine */

/** Events shown per column; older ones scroll off. */
export const EVENTS_PER_STAGE = 6;

const FAILURE_TEXT = {
  github_user_not_found: 'GitHub user not found',
  github_rate_limited: 'GitHub rate limit, retrying',
  github_unavailable: 'GitHub unavailable, retrying',
  website_unreachable: 'website unreachable, GitHub only',
  analysis_timeout: 'analysis timed out',
  analysis_error: 'analysis error',
  consent_withdrawn: 'withdrew consent',
};

const OPPORTUNITY_TEXT = {
  open_issue_help: 'open issues to help with',
  complementary_skill_gap: 'a complementary skill gap',
  architecture_scaling: 'an architecture scaling need',
  shared_research_domain: 'a shared research domain',
};

/**
 * Which pipeline column an event type belongs to.
 * @param {string} type
 * @returns {string|null} stage key, or null for types the pipeline does not show
 */
export function stageForEvent(type) {
  return PIPELINE_STAGES.find((s) => s.events.includes(type))?.key ?? null;
}

/**
 * Stage label for an event participant: `@handle` when the server left the identity in, else the alias.
 * @param {string} alias
 * @param {{github_username:string}|undefined} display
 * @returns {string}
 */
export function eventLabel(alias, display) {
  return display ? `@${display.github_username}` : alias;
}

/**
 * One narratable line for an event.
 * @param {{type:string,payload:Record<string,any>}} event
 * @returns {string}
 */
export function describeEvent(event) {
  const p = event.payload;
  const who = eventLabel(p.display_alias, p.display);
  const pair = `${eventLabel(p.display_alias_a, p.display_a)} ↔ ${eventLabel(p.display_alias_b, p.display_b)}`;
  switch (event.type) {
    case 'participant.registered':
      return `${who} scanned in`;
    case 'github.fetch.started':
      return `Crawling ${who}'s public GitHub`;
    case 'github.fetch.completed':
      return `${who}: ${p.repo_count} repos → ${p.evidence_count} evidence receipts`;
    case 'profile.analysis.completed':
      return `${who}: fingerprint ready, ${p.capability_count} capabilities`;
    case 'opportunity.identified':
      return `${who}: spotted ${OPPORTUNITY_TEXT[p.opportunity_type] ?? 'an opportunity'}`;
    case 'match.candidate.generated':
      return `Candidate match ${pair}`;
    case 'match.evaluated':
      return `Scored ${pair}: ${p.composite_score}`;
    case 'introduction.proposed':
      return `Interest sent ${pair}`;
    case 'introduction.accepted':
      return `Interest returned ${pair}`;
    case 'introduction.declined':
      return `${p.declined_total} intro${p.declined_total === 1 ? '' : 's'} passed on, privately`;
    case 'introduction.completed':
      return `⚡ Golden thread ${pair}`;
    case 'analysis.failed':
      return `${who}: ${FAILURE_TEXT[p.reason_code] ?? 'analysis failed'}`;
    default:
      return event.type;
  }
}

/**
 * Newest-first event lines per pipeline column.
 * @param {Array<{seq_id:number,type:string,payload:object}>} events oldest first
 * @param {number} [perStage]
 * @returns {{crawl:EventLine[],evidence:EventLine[],fingerprint:EventLine[],match:EventLine[]}}
 */
export function groupEvents(events, perStage = EVENTS_PER_STAGE) {
  const grouped = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, []]));
  for (const event of [...events].reverse()) {
    const key = stageForEvent(event.type);
    if (!key || grouped[key].length >= perStage) continue;
    grouped[key].push({ seq_id: event.seq_id, text: describeEvent(event), golden: event.type === 'introduction.completed' });
  }
  return grouped;
}

/**
 * Counter tiles for each pipeline column.
 * @param {{crawl:object,evidence:object,fingerprint:object,match:object}} pipeline
 * @returns {Record<string, Array<{label:string,value:number}>>}
 */
export function pipelineTiles(pipeline) {
  return {
    crawl: [
      { label: 'queued', value: pipeline.crawl.registered },
      { label: 'crawling', value: pipeline.crawl.fetching },
      { label: 'failed', value: pipeline.crawl.failed },
    ],
    evidence: [
      { label: 'receipts', value: pipeline.evidence.receipts },
      { label: 'repos', value: pipeline.evidence.repos },
      { label: 'websites', value: pipeline.evidence.websites },
    ],
    fingerprint: [
      { label: 'analysing', value: pipeline.fingerprint.analyzing },
      { label: 'ready', value: pipeline.fingerprint.ready },
      { label: 'claims', value: pipeline.fingerprint.claims },
    ],
    match: [
      { label: 'matches', value: pipeline.match.matches },
      { label: 'interest', value: pipeline.match.one_sided },
      { label: 'golden', value: pipeline.match.golden },
    ],
  };
}

/**
 * Create an element with a class and optional text.
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Render View 1 into its container. Lines already on screen keep their element, so only new
 * events animate in.
 * @param {HTMLElement} container
 * @param {{pipeline:object,recent_events:Array<object>}} snapshot
 */
export function renderPipeline(container, snapshot) {
  const tiles = pipelineTiles(snapshot.pipeline);
  const grouped = groupEvents(snapshot.recent_events);
  const seen = new Set([...container.querySelectorAll('li[data-seq]')].map((li) => li.dataset.seq));
  const columns = PIPELINE_STAGES.map((stage, i) => {
    const column = el('section', `pipe-col pipe-${stage.key}`);
    column.append(el('h2', 'pipe-title', stage.title), el('p', 'pipe-sub', stage.subtitle));
    const counters = el('div', 'pipe-counters');
    for (const tile of tiles[stage.key]) {
      const box = el('div', 'pipe-tile');
      box.append(el('strong', '', String(tile.value)), el('span', '', tile.label));
      counters.append(box);
    }
    const list = el('ol', 'pipe-events');
    for (const line of grouped[stage.key]) {
      const li = el('li', `${line.golden ? 'golden' : ''}${seen.has(String(line.seq_id)) ? '' : ' fresh'}`.trim(), line.text);
      li.dataset.seq = String(line.seq_id);
      list.append(li);
    }
    if (!grouped[stage.key].length) list.append(el('li', 'idle', 'Waiting…'));
    column.append(counters, list);
    if (i < PIPELINE_STAGES.length - 1) column.append(el('div', 'pipe-arrow', '→'));
    return column;
  });
  container.replaceChildren(...columns);
}
