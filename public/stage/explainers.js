/**
 * Every number the stage explainer quotes. tests/stage-modes.test.ts checks each one against the
 * constant in the code it describes, so the slides cannot drift from what Ariadne actually does.
 */
export const EXPLAINER_FACTS = {
  repos: 10,
  githubTimeoutMs: 2500,
  websiteTimeoutMs: 1500,
  websiteMaxKb: 32,
  keywordCaps: { repo: 2, readme: 4, bio: 3, website: 5 },
  saturation: 2.5,
  maxShift: 25,
  stage2Model: 'Gemini 2.5 Flash',
  weights: { capability_similarity: 0.35, need_offer_fit: 0.3, complementarity: 0.15, novelty: 0.1, freshness: 0.1 },
  surfaceThreshold: 45,
  antiCloneCap: 38,
  minEvidencePerSide: 1,
  topK: 3,
  seeds: 25,
};

const F = EXPLAINER_FACTS;
const pct = (w) => `${Math.round(w * 100)}%`;

/**
 * One slide per stage view: a title, a one-line lead, and points with an optional formula badge.
 * @type {Array<{view:string,tab:string,title:string,lead:string,points:Array<{heading:string,body:string,formula?:string}>}>}
 */
export const EXPLAINERS = [
  {
    view: '1',
    tab: '1 · Pipeline',
    title: 'View 1 · The 4-stage analysis pipeline',
    lead: 'What happens between scanning the QR code and getting matched.',
    points: [
      {
        heading: 'GitHub + public website crawl',
        body: `Public data only, no GitHub login: the profile, your ${F.repos} most recently pushed public non-fork repos and one flagship README (${F.githubTimeoutMs / 1000}s budget), plus an optional public website fetched behind an SSRF guard (${F.websiteTimeoutMs / 1000}s, ${F.websiteMaxKb} KB, login walls skipped).`,
      },
      {
        heading: 'Evidence & sanitizer',
        body: 'Every claim is typed OBSERVED_FACT, SELF_REPORTED or AI_INFERENCE and must cite evidence receipts: real public URLs. Crawled text is stripped of HTML and prompt-injection phrases before any model sees it, and match explanations are scrubbed of emails, phone numbers and foreign links.',
      },
      {
        heading: '6-axis fingerprint',
        body: `Stage 1 is deterministic, with no model calls. Stage 2 lets ${F.stage2Model} refine it, but never by more than ±${F.maxShift} points per axis.`,
      },
      {
        heading: 'Anti-clone scorer → Golden Thread',
        body: `Each builder gets their top ${F.topK} complementary matches. When both people tap Interested, the pair lights up as a Golden Thread on stage.`,
      },
    ],
  },
  {
    view: '2',
    tab: '2 · Fingerprints',
    title: 'View 2 · The 6-axis builder fingerprint',
    lead: 'Six axes, each 0–100: Systems/Infra · Agent Orchestration · LLM/Eval · Frontend/UX · Product/GTM · Data/Pipelines.',
    points: [
      {
        heading: 'Star-weighted repos',
        body: 'Each repo counts through its language and keywords, weighted by stars so popular work counts more, but never more than double.',
        formula: 'w = 1 + min(1, log10(1 + stars) / 2)',
      },
      {
        heading: 'Anti-gaming keyword caps',
        body: `Keyword hits per axis are capped: ≤ ${F.keywordCaps.repo} per repo, ≤ ${F.keywordCaps.readme} from the README, ≤ ${F.keywordCaps.bio} from the bio, ≤ ${F.keywordCaps.website} from the website. Stuffing a bio with buzzwords doesn't help.`,
      },
      {
        heading: 'Saturation curve',
        body: 'Raw signal maps onto 0–100 with diminishing returns, so breadth beats repetition.',
        formula: `axis = round(100 · (1 − e^(−raw / ${F.saturation})))`,
      },
      {
        heading: 'Bounded AI refinement',
        body: `${F.stage2Model} reads the evidence and may adjust each axis, clamped to ±${F.maxShift} points of the deterministic baseline.`,
      },
    ],
  },
  {
    view: '3',
    tab: '3 · Web of Connections',
    title: 'View 3 · Web of Connections & Golden Threads',
    lead: 'A readable web, not a hairball.',
    points: [
      {
        heading: `Top-${F.topK} pruning`,
        body: `Every builder keeps at most ${F.topK} edges on stage, so a room of any size stays legible.`,
        formula: `k = ${F.topK}`,
      },
      {
        heading: 'Edge priority',
        body: 'Golden Thread (mutual) beats one-sided interest, which beats a suggested match; the highest score breaks ties.',
      },
      {
        heading: `+${F.seeds} seed builders`,
        body: `When the room is small, the presenter can add ${F.seeds} curated AI-builder personas to the pool, and live scanners match against them too.`,
      },
      {
        heading: 'Double opt-in privacy',
        body: 'Contact details stay locked until both people tap Interested. That mutual yes is what turns a line into a glowing Golden Arc.',
      },
    ],
  },
  {
    view: '4',
    tab: '4 · Matching theory',
    title: 'View 4 · Matching theory: why not Elo?',
    lead: 'Elo ranks who would win; Ariadne finds who completes whom.',
    points: [
      {
        heading: 'Why Elo fails here',
        body: 'Elo needs a history of head-to-head results and ranks people on one ladder. At a one-day hackathon nobody has history, and the best collaborator is rarely your clone.',
      },
      {
        heading: 'Bounded-complementarity score',
        body: 'Five components, each 0–1, from cited public evidence.',
        formula: `${pct(F.weights.capability_similarity)} capability similarity + ${pct(F.weights.need_offer_fit)} need ↔ offer fit + ${pct(F.weights.complementarity)} complementarity + ${pct(F.weights.novelty)} novelty + ${pct(F.weights.freshness)} freshness`,
      },
      {
        heading: 'What each part means',
        body: 'Need ↔ offer fit is bidirectional: the best of your needs against their offers, and theirs against yours. Complementarity rewards complementary architecture layers, more so with a shared domain. Novelty is how different your capability sets are. Freshness favours recently active projects.',
      },
      {
        heading: 'Hard anti-clone gate',
        body: `A pair with no need ↔ offer fit and no complementary layers has nothing to trade: its score is capped at ${F.antiCloneCap}, below the ${F.surfaceThreshold}-point surfacing threshold, so it is never shown. Every surfaced match also cites evidence from both people.`,
      },
    ],
  },
];

/**
 * The explainer slide for a stage view, falling back to View 1.
 * @param {string} view
 * @returns {(typeof EXPLAINERS)[number]}
 */
export function explainerFor(view) {
  return EXPLAINERS.find((e) => e.view === view) ?? EXPLAINERS[0];
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
 * Render the explainer card: four tabs and the active view's slide.
 * @param {HTMLElement} container
 * @param {string} view active tab
 */
export function renderExplainer(container, view) {
  const active = explainerFor(view);
  const tabs = el('nav', 'info-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const e of EXPLAINERS) {
    const tab = el('button', `info-tab${e.view === active.view ? ' active' : ''}`, e.tab);
    tab.setAttribute('type', 'button');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(e.view === active.view));
    tab.dataset.action = `info:tab:${e.view}`;
    tabs.append(tab);
  }
  const close = el('button', 'info-close', '×');
  close.setAttribute('type', 'button');
  close.setAttribute('aria-label', 'Close');
  close.dataset.action = 'info:close';
  const head = el('header', 'info-head');
  head.append(tabs, close);

  const slide = el('section', 'info-slide');
  slide.setAttribute('role', 'tabpanel');
  slide.append(el('h2', 'info-title', active.title), el('p', 'info-lead', active.lead));
  const list = el('ol', 'info-points');
  for (const point of active.points) {
    const li = el('li', '');
    li.append(el('strong', 'info-heading', point.heading), el('p', 'info-body', point.body));
    if (point.formula) li.append(el('code', 'info-formula', point.formula));
    list.append(li);
  }
  slide.append(list);
  container.replaceChildren(head, slide);
}
