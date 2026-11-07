const SVG_NS = 'http://www.w3.org/2000/svg';

/** CSS class for each edge state on the Web of Connections. */
export const EDGE_CLASSES = {
  suggested: 'edge edge-suggested',
  one_sided: 'edge edge-one-sided',
  golden: 'edge edge-golden',
};

/**
 * CSS class for an edge state.
 * @param {'suggested'|'one_sided'|'golden'} state
 * @returns {string}
 */
export function edgeClass(state) {
  return EDGE_CLASSES[state] ?? 'edge';
}

/**
 * Stable 32-bit FNV-1a hash, used so a node lands in the same starting spot on every screen.
 * @param {string} text
 * @returns {number}
 */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Force-directed layout: nodes repel, edges pull, a weak pull keeps the web centred.
 * Deterministic for the same input. Nodes already placed keep their position as a starting
 * point, so a refresh nudges the web instead of reshuffling it.
 * @param {Array<{alias:string}>} nodes
 * @param {Array<{a:string,b:string}>} edges
 * @param {{width:number,height:number,padding?:number,iterations?:number,previous?:Map<string,{x:number,y:number}>}} options
 * @returns {Map<string,{x:number,y:number}>}
 */
export function layoutGraph(nodes, edges, { width, height: canvasHeight, padding = 60, iterations = 250, previous = new Map() }) {
  // Forces settle into a round cluster, so lay out in a square and stretch it to the canvas by a
  // fixed factor; a constant factor keeps positions stable from one refresh to the next.
  const aspect = width / canvasHeight;
  const height = canvasHeight;
  const squareWidth = canvasHeight;
  const padX = padding / aspect;
  const pos = new Map();
  const cx = squareWidth / 2;
  const cy = height / 2;
  const radius = height / 2 - padding;
  for (const node of nodes) {
    const prior = previous.get(node.alias);
    if (prior) {
      pos.set(node.alias, { x: prior.x / aspect, y: prior.y });
    } else {
      const h = hashString(node.alias);
      const angle = ((h % 3600) / 3600) * Math.PI * 2;
      const r = radius * (0.35 + ((h >>> 12) % 1000) / 1600);
      pos.set(node.alias, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
  }
  if (nodes.length < 2) return toCanvas(pos, aspect);

  const area = (squareWidth - padX * 2) * (height - padding * 2);
  const k = Math.sqrt(area / nodes.length) * 0.45;
  const gravity = 0.01 * k;
  const links = edges.filter((e) => pos.has(e.a) && pos.has(e.b));
  let temperature = height / 10;
  const cooling = temperature / (iterations + 1);
  const aliases = nodes.map((n) => n.alias);

  for (let step = 0; step < iterations; step++) {
    const disp = new Map(aliases.map((a) => [a, { x: 0, y: 0 }]));
    for (let i = 0; i < aliases.length; i++) {
      for (let j = i + 1; j < aliases.length; j++) {
        const p = pos.get(aliases[i]);
        const q = pos.get(aliases[j]);
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = ((i - j) % 3) + 0.5;
          dy = ((j - i) % 2) + 0.5;
          dist = Math.hypot(dx, dy);
        }
        const force = (k * k) / dist;
        const di = disp.get(aliases[i]);
        const dj = disp.get(aliases[j]);
        di.x += (dx / dist) * force;
        di.y += (dy / dist) * force;
        dj.x -= (dx / dist) * force;
        dj.y -= (dy / dist) * force;
      }
    }
    for (const e of links) {
      const p = pos.get(e.a);
      const q = pos.get(e.b);
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const force = (dist * dist) / k;
      const da = disp.get(e.a);
      const db = disp.get(e.b);
      da.x -= (dx / dist) * force;
      da.y -= (dy / dist) * force;
      db.x += (dx / dist) * force;
      db.y += (dy / dist) * force;
    }
    for (const alias of aliases) {
      const p = pos.get(alias);
      const d = disp.get(alias);
      d.x += (cx - p.x) * gravity;
      d.y += (cy - p.y) * gravity;
      const len = Math.max(Math.hypot(d.x, d.y), 0.01);
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
      p.x = Math.min(squareWidth - padX, Math.max(padX, p.x));
      p.y = Math.min(height - padding, Math.max(padding, p.y));
    }
    temperature = Math.max(temperature - cooling, 0.5);
  }
  return toCanvas(pos, aspect);
}

/**
 * Map square layout coordinates onto the canvas by stretching x.
 * @param {Map<string,{x:number,y:number}>} pos
 * @param {number} aspect canvas width / height
 * @returns {Map<string,{x:number,y:number}>}
 */
function toCanvas(pos, aspect) {
  for (const p of pos.values()) p.x *= aspect;
  return pos;
}

/**
 * Golden edges in the new snapshot that were not golden before.
 * @template {{match_id:string,state:string}} T
 * @param {Set<string>} previousGoldenIds match ids already golden
 * @param {T[]} edges
 * @returns {T[]}
 */
export function findNewGoldenEdges(previousGoldenIds, edges) {
  return edges.filter((e) => e.state === 'golden' && !previousGoldenIds.has(e.match_id));
}

/**
 * Celebration banner text for a new mutual match, using each node's stage-safe label.
 * @param {{a:string,b:string}} edge
 * @param {Map<string,{label:string}>} nodesByAlias
 * @returns {string}
 */
export function goldenBannerText(edge, nodesByAlias) {
  const label = (alias) => nodesByAlias.get(alias)?.label ?? alias;
  return `⚡ NEW GOLDEN THREAD: ${label(edge.a)} ↔ ${label(edge.b)}`;
}

/**
 * SVG path for an edge: straight for suggestions and interest, a raised arc for golden threads.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} q
 * @param {boolean} arc
 * @returns {string}
 */
export function edgePath(p, q, arc) {
  if (!arc) return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const bend = 0.22;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
}

/**
 * Create an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string,string|number>} attrs
 * @returns {SVGElement}
 */
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * Draw the Web of Connections into an `<svg>`.
 * @param {SVGSVGElement} svg
 * @param {{nodes:Array<{alias:string,label:string,is_seed:boolean,analysis_state:string}>,edges:Array<{match_id:string,a:string,b:string,state:string,score:number}>}} snapshot
 * @param {Map<string,{x:number,y:number}>} positions
 * @param {Set<string>} [rippleIds] golden match ids to draw with a ripple
 */
export function renderGraph(svg, snapshot, positions, rippleIds = new Set()) {
  svg.replaceChildren();
  const edgeLayer = svgEl('g', { class: 'edges' });
  const nodeLayer = svgEl('g', { class: 'nodes' });
  for (const edge of snapshot.edges) {
    const p = positions.get(edge.a);
    const q = positions.get(edge.b);
    if (!p || !q) continue;
    const path = svgEl('path', { d: edgePath(p, q, edge.state === 'golden'), class: edgeClass(edge.state) });
    const title = svgEl('title', {});
    title.textContent = `${edge.state.replace('_', '-')} · score ${edge.score}`;
    path.append(title);
    edgeLayer.append(path);
    if (rippleIds.has(edge.match_id)) {
      for (const point of [p, q]) {
        edgeLayer.append(svgEl('circle', { cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 14, class: 'ripple' }));
      }
    }
  }
  for (const node of snapshot.nodes) {
    const p = positions.get(node.alias);
    if (!p) continue;
    const g = svgEl('g', {
      class: `node${node.is_seed ? ' node-seed' : ' node-live'}${node.analysis_state === 'ready' ? ' node-ready' : ''}`,
      transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`,
    });
    g.append(svgEl('circle', { r: node.is_seed ? 9 : 13 }));
    const text = svgEl('text', { y: node.is_seed ? 24 : 30, 'text-anchor': 'middle' });
    text.textContent = node.is_seed ? `🌱 ${node.label}` : node.label;
    g.append(text);
    nodeLayer.append(g);
  }
  svg.append(edgeLayer, nodeLayer);
}
