/** The five score components with their weights (MATCH_SCORING_SPEC.md) and stage labels. */
export const SCORE_COMPONENTS = [
  ['capability_similarity', 'Capability similarity', 0.35],
  ['need_offer_fit', 'Need ↔ offer fit', 0.3],
  ['complementarity', 'Complementarity', 0.15],
  ['novelty', 'Novelty', 0.1],
  ['freshness', 'Freshness', 0.1],
];

/** Seconds each pair stays on screen while the spotlight auto-advances. */
export const SPOTLIGHT_ADVANCE_MS = 8000;

const STATE_TEXT = { golden: '⚡ Golden thread', one_sided: 'One-sided interest', suggested: 'Suggested match' };

/**
 * Next index when stepping through `total` entries, wrapping at both ends.
 * @param {number} index
 * @param {number} total
 * @param {number} delta +1 next, -1 previous
 * @returns {number}
 */
export function stepIndex(index, total, delta) {
  if (total <= 0) return 0;
  return (((index + delta) % total) + total) % total;
}

/**
 * Keep the spotlight on the same match across refreshes when it is still listed.
 * @param {Array<{match_id:string}>} entries
 * @param {string|null} currentId
 * @param {number} fallbackIndex
 * @returns {number}
 */
export function resolveIndex(entries, currentId, fallbackIndex) {
  const found = entries.findIndex((e) => e.match_id === currentId);
  if (found >= 0) return found;
  return entries.length ? Math.min(fallbackIndex, entries.length - 1) : 0;
}

/**
 * Bar rows for the score breakdown: the component value and its weighted points.
 * @param {Record<string,number>|null} breakdown
 * @param {Record<string,number>|null} contributions
 * @returns {Array<{key:string,label:string,weight:number,value:number,points:number}>}
 */
export function breakdownRows(breakdown, contributions) {
  if (!breakdown || !contributions) return [];
  return SCORE_COMPONENTS.map(([key, label, weight]) => ({
    key,
    label,
    weight,
    value: breakdown[key] ?? 0,
    points: contributions[key] ?? 0,
  }));
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
 * One builder's side of the spotlight: label and cited evidence. Without stage consent the server
 * sends only evidence source types, so the card shows counts instead of titles.
 * @param {{label:string,is_seed:boolean,evidence:Array<{source_type:string,title:string|null}>}} side
 * @returns {HTMLElement}
 */
function renderSide(side) {
  const card = el('section', `spot-side${side.is_seed ? ' spot-seed' : ''}`);
  card.append(el('h2', 'spot-name', side.is_seed ? `🌱 ${side.label}` : side.label));
  card.append(el('p', 'spot-kind', side.is_seed ? 'Seeded AI Dev' : 'Live Scanner'));
  const list = el('ul', 'spot-evidence');
  const titled = side.evidence.filter((e) => e.title);
  for (const ev of titled) {
    const li = el('li', '');
    li.append(el('span', 'ev-type', ev.source_type.replace(/_/g, ' ')), el('span', 'ev-title', ev.title));
    list.append(li);
  }
  if (!titled.length) {
    list.append(el('li', 'ev-hidden', side.evidence.length
      ? `${side.evidence.length} cited source${side.evidence.length === 1 ? '' : 's'} (details private)`
      : 'No cited evidence yet'));
  }
  card.append(list);
  return card;
}

/**
 * Render View 4 for one entry: the two builders side by side, the score and its five components,
 * and the collaboration thesis when both builders are shown on stage.
 * @param {HTMLElement} container
 * @param {object|undefined} entry
 * @param {number} index
 * @param {number} total
 */
export function renderSpotlight(container, entry, index, total) {
  if (!entry) {
    container.replaceChildren(el('div', 'spot-empty', 'Match spotlights appear once the scorer pairs builders.'));
    return;
  }
  const middle = el('section', `spot-score state-${entry.state}`);
  middle.append(el('div', 'spot-state', STATE_TEXT[entry.state] ?? entry.state));
  middle.append(el('div', 'spot-total', String(entry.score)));
  const bars = el('ol', 'spot-bars');
  for (const row of breakdownRows(entry.breakdown, entry.contributions)) {
    const li = el('li', '');
    const label = el('span', 'bar-label', `${row.label} · ${Math.round(row.weight * 100)}%`);
    const track = el('span', 'bar-track');
    const fill = el('span', 'bar-fill');
    fill.style.width = `${Math.round(row.value * 100)}%`;
    track.append(fill);
    li.append(label, track, el('span', 'bar-points', `+${row.points.toFixed(1)}`));
    bars.append(li);
  }
  if (!bars.children.length) bars.append(el('li', 'ev-hidden', 'Score breakdown unavailable'));
  middle.append(bars);

  const thesis = el('section', 'spot-thesis');
  thesis.append(el('h3', '', 'Why they match'));
  if (entry.thesis) {
    thesis.append(el('p', 'thesis-text', entry.thesis.summary));
    thesis.append(el('p', 'thesis-first', `First collaboration: ${entry.thesis.first_collaboration}`));
  } else {
    thesis.append(el('p', 'thesis-private', 'Shown only when both builders have opted in to stage display.'));
  }

  const nav = el('div', 'spot-nav');
  nav.append(el('span', 'spot-count', `${index + 1} / ${total}`));
  const row = el('div', 'spot-row');
  row.append(renderSide(entry.a), middle, renderSide(entry.b));
  container.replaceChildren(row, thesis, nav);
}
