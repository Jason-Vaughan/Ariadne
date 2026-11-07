const SVG_NS = 'http://www.w3.org/2000/svg';

/** The six fingerprint axes, in radar order, with their stage labels. */
export const FINGERPRINT_AXES = [
  ['systems_infra', 'Systems/Infra'],
  ['agent_orchestration', 'Agents'],
  ['llm_eval', 'LLM/Eval'],
  ['frontend_ux', 'Frontend/UX'],
  ['product_gtm', 'Product/GTM'],
  ['data_pipelines', 'Data'],
];

/** Cards shown in the gallery (two rows of six fit the stage); the room's newest builders come first. */
export const GALLERY_LIMIT = 12;

/**
 * Corner of a hexagonal radar for axis `i` at a given fraction of the radius.
 * @param {number} i axis index 0–5
 * @param {number} fraction 0–1
 * @param {number} radius
 * @returns {{x:number,y:number}}
 */
export function radarPoint(i, fraction, radius) {
  const angle = -Math.PI / 2 + (i * Math.PI * 2) / FINGERPRINT_AXES.length;
  return { x: Math.cos(angle) * radius * fraction, y: Math.sin(angle) * radius * fraction };
}

/**
 * SVG polygon points for a fingerprint vector (values 0–100), centred on the origin.
 * @param {Record<string,number>} vector
 * @param {number} radius
 * @returns {string}
 */
export function radarPolygon(vector, radius) {
  return FINGERPRINT_AXES.map(([axis], i) => {
    const p = radarPoint(i, Math.max(0, Math.min(100, vector[axis] ?? 0)) / 100, radius);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
}

/**
 * The axis a builder leans on most, for the card's headline.
 * @param {Record<string,number>} vector
 * @returns {string}
 */
export function strongestAxis(vector) {
  let best = FINGERPRINT_AXES[0];
  for (const entry of FINGERPRINT_AXES) if ((vector[entry[0]] ?? 0) > (vector[best[0]] ?? 0)) best = entry;
  return best[1];
}

/**
 * Gallery order: live builders before seeds, analysed before pending, newest first within each.
 * @template {{is_seed:boolean,fingerprint:object|null}} T
 * @param {T[]} cards in arrival order
 * @returns {T[]}
 */
export function galleryOrder(cards) {
  const rank = (c) => (c.is_seed ? 2 : 0) + (c.fingerprint ? 0 : 1);
  return cards
    .map((card, i) => ({ card, i }))
    .sort((x, y) => rank(x.card) - rank(y.card) || y.i - x.i)
    .map((x) => x.card)
    .slice(0, GALLERY_LIMIT);
}

/**
 * Create an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string,string|number>} attrs
 * @returns {SVGElement}
 */
function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * A round GitHub avatar, or the green dot when there is none or it fails to load. The server sends
 * an avatar only for builders shown on stage, so pseudonymous builders always get the dot.
 * @param {string|null|undefined} url
 * @param {string} [className] extra class, e.g. a size modifier
 * @returns {HTMLElement}
 */
export function avatarBadge(url, className = '') {
  const badge = document.createElement('span');
  badge.className = `avatar-badge ${className}`.trim();
  const dot = document.createElement('span');
  dot.className = 'avatar-dot';
  if (!url) {
    badge.append(dot);
    return badge;
  }
  const img = document.createElement('img');
  img.className = 'avatar-img';
  img.src = url;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(dot));
  badge.append(img);
  return badge;
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
 * Hexagonal radar chart for one fingerprint.
 * @param {Record<string,number>|null} vector
 * @returns {SVGSVGElement}
 */
function radar(vector) {
  const r = 62;
  const svg = svgEl('svg', { viewBox: '-100 -88 200 176', class: 'radar', role: 'img' });
  for (const level of [0.33, 0.66, 1]) {
    const ring = FINGERPRINT_AXES.map((_, i) => radarPoint(i, level, r)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    svg.append(svgEl('polygon', { points: ring, class: 'radar-ring' }));
  }
  FINGERPRINT_AXES.forEach(([, label], i) => {
    const p = radarPoint(i, 1.28, r);
    const text = svgEl('text', { x: p.x.toFixed(1), y: (p.y + 4).toFixed(1), 'text-anchor': 'middle', class: 'radar-label' });
    text.textContent = label;
    svg.append(text);
  });
  if (vector) svg.append(svgEl('polygon', { points: radarPolygon(vector, r), class: 'radar-shape' }));
  svg.setAttribute('aria-label', vector ? `Fingerprint, strongest in ${strongestAxis(vector)}` : 'Fingerprint pending');
  return svg;
}

/**
 * Render View 2: a grid of 6-axis fingerprint cards with evidence badges. Titles and links appear
 * only when the server sent them, which it does only for builders shown on stage.
 * @param {HTMLElement} container
 * @param {Array<{alias:string,label:string,is_seed:boolean,avatar_url?:string|null,fingerprint:Record<string,number>|null,evidence_count:number,claim_count:number,evidence:Array<{source_type:string,title:string|null}>}>} cards
 */
export function renderFingerprintGallery(container, cards) {
  if (!cards.length) {
    container.replaceChildren(el('div', 'gallery-empty', 'Fingerprints appear as builders scan in.'));
    return;
  }
  const items = galleryOrder(cards).map((card) => {
    const item = el('article', `fp-card${card.is_seed ? ' fp-seed' : ''}`);
    const head = el('header', 'fp-head');
    head.append(avatarBadge(card.avatar_url), el('strong', 'fp-label', card.is_seed ? `🌱 ${card.label}` : card.label));
    head.append(el('span', 'fp-badge', card.is_seed ? 'Seeded AI Dev' : 'Live Scanner'));
    item.append(head, radar(card.fingerprint));
    item.append(el('p', 'fp-lead', card.fingerprint ? `Strongest: ${strongestAxis(card.fingerprint)}` : 'Fingerprint pending…'));
    const pills = el('div', 'fp-pills');
    pills.append(el('span', 'pill', `${card.evidence_count} evidence`), el('span', 'pill', `${card.claim_count} claims`));
    for (const ev of card.evidence) if (ev.title) pills.append(el('span', 'pill pill-cite', ev.title));
    item.append(pills);
    return item;
  });
  container.replaceChildren(...items);
}
