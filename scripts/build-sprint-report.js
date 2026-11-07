#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = 'Jason-Vaughan/Ariadne';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The v2.0.0 contract names the block `tc-canonical-metrics`; issue A-015 calls it
// `tc-sprint-metrics-json`. Reports may be generated against either text.
const METRICS_BLOCK_IDS = ['tc-canonical-metrics', 'tc-sprint-metrics-json'];

const STATE_LABELS = {
  closed: 'Done',
  open: 'Not started',
  dropped: 'Deferred',
  unfiled: 'Not filed',
};

const WATERMARK_SRC = '/tangleclaw-logo.png';
const WATERMARK_FALLBACK = 'https://raw.githubusercontent.com/Jason-Vaughan/project-assets/main/tangleclaw-logo.png';

/**
 * Escape a value for safe interpolation into HTML text or a quoted attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a roadmap car number as its planning code (15 -> "A-015").
 * Roadmap cars are keyed by planning code, not GitHub issue number: the two diverge
 * because deferred issues were filed out of order.
 * @param {number} n
 * @returns {string}
 */
export function issueCode(n) {
  return `A-${String(n).padStart(3, '0')}`;
}

/**
 * Pull the planning code ("A-015") out of a GitHub issue title.
 * @param {string} title
 * @returns {string | null}
 */
export function parseIssueCode(title) {
  const match = /\bA-(\d{3})\b/.exec(title ?? '');
  return match ? `A-${match[1]}` : null;
}

/**
 * Index GitHub issues (as returned by `gh issue list --json number,title,state,stateReason,labels`)
 * by planning code, normalising state to closed | dropped | open.
 * @param {Array<{number:number,title:string,state:string,stateReason?:string,labels?:Array<{name:string}>}>} ghIssues
 * @returns {Map<string, {number:number,code:string,title:string,state:string,url:string,labels:string[]}>}
 */
export function normalizeIssues(ghIssues) {
  const byCode = new Map();
  for (const issue of ghIssues) {
    const code = parseIssueCode(issue.title);
    if (!code) continue;
    let state = 'open';
    if (issue.state === 'CLOSED') state = issue.stateReason === 'NOT_PLANNED' ? 'dropped' : 'closed';
    byCode.set(code, {
      number: issue.number,
      code,
      title: issue.title.replace(/^\[[a-z]+\]\s*/i, ''),
      rawTitle: issue.title,
      state,
      url: `https://github.com/${REPO}/issues/${issue.number}`,
      labels: (issue.labels ?? []).map((l) => l.name),
    });
  }
  return byCode;
}

/**
 * Decide whether an issue may appear on the public roadmap under the roadmap's projection rules.
 * Title prefixes are matched against the original GitHub title, before the `[type]` tag is stripped.
 * @param {{code:string,title:string,rawTitle?:string,labels:string[]}} issue
 * @param {{launch_approved?:boolean,withheld_issues?:Array<number|string>,exclude_labels?:string[],exclude_title_prefixes?:string[]}} projection
 * @returns {boolean}
 */
export function isPublicIssue(issue, projection = {}) {
  if (projection.launch_approved === false) return false;
  const withheld = (projection.withheld_issues ?? []).map(String);
  if (withheld.includes(issue.code) || withheld.includes(String(Number(issue.code.slice(2))))) return false;
  if ((projection.exclude_labels ?? []).some((l) => issue.labels.includes(l))) return false;
  const title = (issue.rawTitle ?? issue.title).toLowerCase();
  return !(projection.exclude_title_prefixes ?? []).some((p) => title.startsWith(p.toLowerCase()));
}

/**
 * Read the machine-readable metrics block embedded in a v2.0.0 sprint report.
 * @param {string} html
 * @returns {object | null} the parsed metrics, or null when the block is missing or not valid JSON
 */
export function extractMetrics(html) {
  for (const id of METRICS_BLOCK_IDS) {
    const re = new RegExp(`<script[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</script>`, 'i');
    const match = re.exec(html);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * List the report slugs the hub shows: one per roadmap release, plus the cumulative retrospective.
 * Each slot names the release tag that must exist before its report counts as published.
 * @param {{releases:Array<{version:string,name:string}>}} roadmap
 * @returns {Array<{slug:string,title:string,retrospective:boolean,tag:string}>}
 */
export function reportSlots(roadmap) {
  const versions = roadmap.releases.map((r) => `v${r.version}`);
  const slots = roadmap.releases.map((r) => ({ slug: `v${r.version}`, title: r.name, retrospective: false, tag: `v${r.version}` }));
  if (versions.length > 1) {
    const last = versions[versions.length - 1];
    slots.push({
      slug: `${versions[0]}-${last}-retrospective`,
      title: `${versions[0]} – ${last} Hackathon Train Retrospective`,
      retrospective: true,
      tag: last,
    });
  }
  return slots;
}

/**
 * Find which report slots have a published report, and read each one's metrics.
 * A report file on disk is not enough: pre-event drafts sit in the same directory. A report
 * counts as published only when its metrics name the slot's release tag and that tag exists.
 * @param {{releases:Array<{version:string,name:string}>}} roadmap
 * @param {string} reportsDir directory holding `<slug>/index.html` reports
 * @param {Set<string>} releasedTags release tags that exist on the repository
 * @returns {Array<{slug:string,title:string,retrospective:boolean,tag:string,href:string,published:boolean,metrics:object|null}>}
 */
export function loadReports(roadmap, reportsDir, releasedTags) {
  return reportSlots(roadmap).map((slot) => {
    const file = path.join(reportsDir, slot.slug, 'index.html');
    const metrics = fs.existsSync(file) ? extractMetrics(fs.readFileSync(file, 'utf8')) : null;
    const published = metrics !== null && metrics.release_tag === slot.tag && releasedTags.has(slot.tag);
    if (fs.existsSync(file) && !published) {
      console.info(`[build-sprint-report] ${slot.slug}: report on disk is not backed by release tag ${slot.tag}; shown as pending`);
    }
    return { ...slot, href: `/reports/${slot.slug}/`, published, metrics: published ? metrics : null };
  });
}

/**
 * List the release tags that exist on the origin remote.
 * @param {string} cwd repository checkout to query
 * @returns {Set<string>}
 */
export function fetchReleasedTags(cwd = REPO_ROOT) {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin'], { cwd, encoding: 'utf8' });
  return new Set(
    out
      .split('\n')
      .map((line) => line.split('refs/tags/')[1])
      .filter(Boolean),
  );
}

/**
 * Resolve every car of a roadmap workstream to its issue record.
 * @param {number[]} cars planning-code numbers
 * @param {Map<string, object>} issues
 * @returns {Array<{code:string,number?:number,title?:string,state:string,url?:string,labels:string[]}>}
 */
function resolveCars(cars, issues) {
  return cars.map((n) => issues.get(issueCode(n)) ?? { code: issueCode(n), state: 'unfiled', labels: [] });
}

/**
 * Whether an issue no longer needs work (finished or deliberately deferred).
 * @param {{state:string}} issue
 * @returns {boolean}
 */
function isSettled(issue) {
  return issue.state === 'closed' || issue.state === 'dropped';
}

/**
 * Compute the roadmap's headline numbers from the roadmap and live issue states.
 * @param {{releases:Array<{version:string,trains:Array<{owner?:string,cars:number[]}>}>}} roadmap
 * @param {Map<string, object>} issues
 * @returns {{activeRelease:string|null,issuesClosed:number,issuesActive:number,streamsDone:number,streamsTotal:number,lanes:number}}
 */
export function summarizeRoadmap(roadmap, issues) {
  let issuesClosed = 0;
  let issuesActive = 0;
  let streamsDone = 0;
  let streamsTotal = 0;
  let activeRelease = null;
  const lanes = new Set();
  for (const release of roadmap.releases) {
    let releaseSettled = true;
    for (const train of release.trains) {
      const resolved = resolveCars(train.cars, issues);
      streamsTotal += 1;
      if (resolved.every(isSettled)) streamsDone += 1;
      else releaseSettled = false;
      if (train.owner) lanes.add(train.owner);
      for (const issue of resolved) {
        if (issue.state === 'dropped') continue;
        issuesActive += 1;
        if (issue.state === 'closed') issuesClosed += 1;
      }
    }
    if (!releaseSettled && activeRelease === null) activeRelease = release.version;
  }
  return { activeRelease, issuesClosed, issuesActive, streamsDone, streamsTotal, lanes: lanes.size };
}

/**
 * Shared page chrome: palette tokens for light and dark, layout, and the fixed TangleClaw watermark.
 * @returns {string}
 */
function baseStyles() {
  return `
:root{--bg:#f6f8fa;--panel:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--accent:#0969da;--ok:#1a7f37;--ok-bg:#dafbe1;--wait:#9a6700;--wait-bg:#fff8c5;--off:#59636e;--off-bg:#eaeef2}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--panel:#161b22;--fg:#e6edf3;--muted:#8b949e;--line:#30363d;--accent:#58a6ff;--ok:#56d364;--ok-bg:#112d1c;--wait:#e3b341;--wait-bg:#332b13;--off:#8b949e;--off-bg:#21262d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{position:relative;z-index:1;max-width:1180px;margin:auto;padding:2rem 16px 4rem}
a{color:var(--accent)}
h1{margin:.2rem 0 .4rem;font-size:1.7rem}
.lede{color:var(--muted);max-width:78ch;margin:0}
.links{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;margin:1rem 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.75rem;margin:1.2rem 0}
.kpi,.card{background:var(--panel);border:1px solid var(--line);border-radius:.7rem;padding:.9rem 1rem}
.kpi span{display:block;color:var(--muted);font-size:.85rem}
.kpi strong{font-size:1.45rem}
.pill{display:inline-block;border-radius:999px;padding:.05rem .55rem;font-size:.78rem;font-weight:700;white-space:nowrap}
.state-closed,.pill-published{color:var(--ok);background:var(--ok-bg)}
.state-open,.pill-pending{color:var(--wait);background:var(--wait-bg)}
.state-dropped,.state-unfiled,.state-withheld{color:var(--off);background:var(--off-bg)}
.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:.5rem;margin-top:.6rem}
table{width:100%;border-collapse:collapse;background:var(--panel)}
th,td{text-align:left;padding:.5rem .65rem;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
td:first-child{white-space:nowrap}
.muted{color:var(--muted)}
footer{color:var(--muted);font-size:.85rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line)}
.tc-bg-watermark{position:fixed;inset:0;z-index:0;pointer-events:none;display:flex;align-items:center;justify-content:center;overflow:hidden}
.tc-bg-watermark img{width:min(82vw,860px);height:min(82vw,860px);object-fit:contain;opacity:.08;user-select:none;-webkit-user-drag:none}
@media(prefers-color-scheme:dark){.tc-bg-watermark img{opacity:.10}}`;
}

/**
 * Wrap page content in the shared document shell with the fixed static TangleClaw watermark.
 * @param {{title:string,description:string,styles:string,body:string}} page
 * @returns {string}
 */
function renderDocument({ title, description, styles, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<style>${baseStyles()}${styles}</style>
</head>
<body>
<div class="tc-bg-watermark" aria-hidden="true"><img src="${WATERMARK_SRC}" onerror="this.onerror=null;this.src='${WATERMARK_FALLBACK}'" alt=""></div>
<main>
${body}
</main>
</body>
</html>
`;
}

/**
 * Render one issue as a table row, hiding withheld issues' titles.
 * @param {{code:string,number?:number,title?:string,state:string,url?:string,labels:string[]}} issue
 * @param {object} projection
 * @returns {string}
 */
function renderIssueRow(issue, projection) {
  if (issue.state !== 'unfiled' && !isPublicIssue(issue, projection)) {
    return `<tr><td>${escapeHtml(issue.code)}</td><td class="muted">Withheld from public view</td><td><span class="pill state-withheld">Withheld</span></td></tr>`;
  }
  const label = issue.url
    ? `<a href="${escapeHtml(issue.url)}">#${escapeHtml(issue.number)}</a> ${escapeHtml(issue.title)}`
    : '<span class="muted">Not yet filed on GitHub</span>';
  return `<tr><td>${escapeHtml(issue.code)}</td><td>${label}</td><td><span class="pill state-${issue.state}">${STATE_LABELS[issue.state]}</span></td></tr>`;
}

/**
 * Render one release as an expandable section listing its workstreams and issues.
 * @param {{version:string,name:string,public_status?:string,trains:Array<{name:string,owner?:string,cars:number[]}>}} release
 * @param {Map<string, object>} issues
 * @param {object} projection
 * @param {boolean} isActive
 * @param {boolean} hasReport whether this release's sprint report is published
 * @returns {string}
 */
function renderRelease(release, issues, projection, isActive, hasReport) {
  const all = release.trains.flatMap((t) => resolveCars(t.cars, issues));
  const settled = all.filter(isSettled).length;
  const released = all.length > 0 && settled === all.length;
  const status = released ? 'Released' : isActive ? 'Active' : 'Upcoming';
  const streams = release.trains
    .map((train) => {
      const rows = resolveCars(train.cars, issues).map((i) => renderIssueRow(i, projection)).join('');
      return `<h3>${escapeHtml(train.name)}${train.owner ? ` <span class="muted">· ${escapeHtml(train.owner)}</span>` : ''}</h3>
<div class="table-scroll"><table><thead><tr><th>Code</th><th>Issue</th><th>State</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('\n');
  return `<details class="card release"${isActive ? ' open' : ''}>
<summary><span class="version">v${escapeHtml(release.version)}</span> ${escapeHtml(release.name)} <span class="pill ${released ? 'state-closed' : 'state-open'}">${status} · ${settled}/${all.length}</span></summary>
${release.public_status ? `<p class="muted">${escapeHtml(release.public_status)}</p>` : ''}
${hasReport ? `<p><a href="/reports/v${escapeHtml(release.version)}/">v${escapeHtml(release.version)} sprint report</a></p>` : ''}
${streams}
</details>`;
}

/**
 * Render the deferred post-hackathon backlog section.
 * @param {Array<{name:string,note?:string,cars:number[]}>} backlog
 * @param {Map<string, object>} issues
 * @param {object} projection
 * @returns {string}
 */
function renderBacklog(backlog, issues, projection) {
  if (!backlog || backlog.length === 0) return '';
  const groups = backlog
    .map((group) => {
      const rows = resolveCars(group.cars, issues).map((i) => renderIssueRow(i, projection)).join('');
      return `<h3>${escapeHtml(group.name)}</h3>${group.note ? `<p class="muted">${escapeHtml(group.note)}</p>` : ''}
<div class="table-scroll"><table><thead><tr><th>Code</th><th>Issue</th><th>State</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('\n');
  return `<details class="card release"><summary>Post-hackathon deferred work</summary>${groups}</details>`;
}

/**
 * Build the interactive roadmap board page (`/roadmap/`).
 * @param {{releases:Array<object>,backlog?:Array<object>,public_projection?:object}} roadmap
 * @param {Map<string, object>} issues
 * @param {{generatedAt:string,publishedReports?:string[]}} options publishedReports: release slugs with a report, in release order
 * @returns {string}
 */
export function renderRoadmapPage(roadmap, issues, { generatedAt, publishedReports = [] }) {
  const projection = roadmap.public_projection ?? {};
  const summary = summarizeRoadmap(roadmap, issues);
  const releases = roadmap.releases
    .map((r) =>
      renderRelease(r, issues, projection, r.version === summary.activeRelease, publishedReports.includes(`v${r.version}`)),
    )
    .join('\n');
  const latestReport = publishedReports.at(-1) ?? null;
  const latest = latestReport ? `<a href="/reports/${escapeHtml(latestReport)}/">Latest: ${escapeHtml(latestReport)} sprint report</a>` : '';
  const body = `<header>
<p class="muted">Orchestrated by TangleClaw</p>
<h1>ARIADNE — Autonomous Hackathon Roadmap Board</h1>
<p class="lede">Every release train, its parallel workstreams, and the live state of each issue on GitHub.</p>
<nav class="links"><a href="/stage">← Live 16:9 Stage Visualizer</a><a href="/reports/">Sprint Reports Hub</a>${latest}<a href="/provenance">Provenance Ledger</a></nav>
</header>
<section class="kpis" aria-label="Summary">
<div class="kpi"><span>Active release train</span><strong>${summary.activeRelease ? `v${escapeHtml(summary.activeRelease)}` : 'All released'}</strong></div>
<div class="kpi"><span>MVP issues completed</span><strong>${summary.issuesClosed} / ${summary.issuesActive}</strong></div>
<div class="kpi"><span>Workstreams completed</span><strong>${summary.streamsDone} / ${summary.streamsTotal}</strong></div>
<div class="kpi"><span>Builder lanes</span><strong>${summary.lanes}</strong></div>
</section>
${releases}
${renderBacklog(roadmap.backlog, issues, projection)}
<footer>Generated ${escapeHtml(generatedAt)} by scripts/build-sprint-report.js from roadmap-board/roadmap2-data.json and GitHub issues of ${REPO}.</footer>`;
  return renderDocument({
    title: 'Ariadne Roadmap Board',
    description: 'Ariadne release trains, workstreams and live issue state.',
    styles: '.release{margin:1rem 0}.release>summary{cursor:pointer;font-weight:600;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}.version{color:var(--accent)}h3{font-size:1rem;margin:1rem 0 0}',
    body,
  });
}

/**
 * Pick the headline figures a hub card and the comparison table show for one report.
 * @param {object | null} metrics
 * @returns {{window:string,issues:string,prs:string,lines:string,tag:string}}
 */
export function reportFigures(metrics) {
  const dash = '—';
  if (!metrics) return { window: dash, issues: dash, prs: dash, lines: dash, tag: dash };
  const completion = metrics.completion ?? {};
  const diff = metrics.diff ?? {};
  const closed = completion.state_c_verified_closed_issues;
  const active = completion.chartered_active_issues;
  return {
    window: metrics.durations?.full_engineering_window_human ?? dash,
    issues: closed != null && active != null ? `${closed} / ${active}` : dash,
    prs: Array.isArray(diff.prs_merged) ? String(diff.prs_merged.length) : dash,
    lines: diff.net_repo_insertions != null ? `+${diff.net_repo_insertions} / −${diff.net_repo_deletions ?? 0}` : dash,
    tag: metrics.release_tag ?? dash,
  };
}

/**
 * Render one hub card: published (with figures) or pending.
 * @param {{slug:string,title:string,href:string,published:boolean,metrics:object|null,retrospective:boolean}} report
 * @returns {string}
 */
function renderReportCard(report) {
  if (!report.published) {
    return `<article class="card report"><h2>${escapeHtml(report.slug)}</h2><p>${escapeHtml(report.title)}</p><span class="pill pill-pending">Pending — published at the train boundary</span></article>`;
  }
  const f = reportFigures(report.metrics);
  const figures = `<dl><dt>Engineering window</dt><dd>${escapeHtml(f.window)}</dd><dt>Issues closed</dt><dd>${escapeHtml(f.issues)}</dd><dt>PRs merged</dt><dd>${escapeHtml(f.prs)}</dd><dt>Lines</dt><dd>${escapeHtml(f.lines)}</dd></dl>`;
  return `<article class="card report${report.retrospective ? ' highlight' : ''}"><h2><a href="${escapeHtml(report.href)}">${escapeHtml(report.slug)}</a></h2><p>${escapeHtml(report.metrics?.milestone_title ?? report.title)}</p><span class="pill pill-published">Published</span>${figures}</article>`;
}

/**
 * Build the sprint reports hub page (`/reports/`): a card per report and a side-by-side comparison.
 * @param {Array<{slug:string,title:string,href:string,published:boolean,metrics:object|null,retrospective:boolean}>} reports
 * @param {{generatedAt:string}} options
 * @returns {string}
 */
export function renderReportsPage(reports, { generatedAt }) {
  const ordered = [...reports.filter((r) => r.retrospective), ...reports.filter((r) => !r.retrospective).reverse()];
  const comparable = reports.filter((r) => r.published && !r.retrospective);
  const rows = comparable
    .map((r) => {
      const f = reportFigures(r.metrics);
      return `<tr><td><a href="${escapeHtml(r.href)}">${escapeHtml(r.slug)}</a></td><td>${escapeHtml(f.tag)}</td><td>${escapeHtml(f.window)}</td><td>${escapeHtml(f.issues)}</td><td>${escapeHtml(f.prs)}</td><td>${escapeHtml(f.lines)}</td></tr>`;
    })
    .join('');
  const comparison = comparable.length
    ? `<div class="table-scroll"><table><thead><tr><th>Report</th><th>Tag</th><th>Engineering window</th><th>Issues closed</th><th>PRs merged</th><th>Lines</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted">No release reports are published yet. Each one appears here when its train is certified.</p>';
  const body = `<header>
<p class="muted">Orchestrated by TangleClaw</p>
<h1>Ariadne — Autonomous Sprint Reports Hub</h1>
<p class="lede">One v2.0.0 sprint report per release train, generated and certified at each train boundary.</p>
<nav class="links"><a href="/stage">← Live 16:9 Stage Visualizer</a><a href="/roadmap/">Roadmap Board</a><a href="/provenance">Provenance Ledger</a></nav>
</header>
<section aria-labelledby="compare"><h2 id="compare">Release trains side by side</h2>${comparison}</section>
<section class="reports" aria-label="Reports">${ordered.map(renderReportCard).join('\n')}</section>
<footer>Generated ${escapeHtml(generatedAt)} by scripts/build-sprint-report.js.</footer>`;
  return renderDocument({
    title: 'Ariadne Sprint Reports',
    description: 'Ariadne v2.0.0 sprint reports for every release train.',
    styles: '.reports{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:.9rem;margin-top:1.5rem}.report h2{margin:0;font-size:1.1rem}.highlight{border-color:var(--accent)}dl{display:grid;grid-template-columns:auto 1fr;gap:.2rem .8rem;margin:.8rem 0 0;font-size:.9rem}dt{color:var(--muted)}dd{margin:0}.report .pill{white-space:normal}',
    body,
  });
}

/**
 * Fetch every issue in the repository through the GitHub CLI.
 * @param {string} repo
 * @returns {Array<object>}
 */
export function fetchGithubIssues(repo = REPO) {
  const out = execFileSync(
    'gh',
    ['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '500', '--json', 'number,title,state,stateReason,labels'],
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

/**
 * Parse `--name value` command-line options.
 * @param {string[]} argv
 * @returns {Record<string,string>}
 */
export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    opts[arg.slice(2)] = value;
    i += 1;
  }
  return opts;
}

/**
 * Build both pages and write them under the output directory.
 * Options: --roadmap <json>, --issues <json from gh issue list> (otherwise fetched live),
 * --reports-dir <dir>, --out-dir <dir>, --generated-at <timestamp>,
 * --released-tags <comma-separated tags> (otherwise read from `git ls-remote --tags origin`).
 * @param {string[]} argv
 * @returns {{roadmapPath:string,reportsPath:string}}
 */
export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const roadmapFile = opts.roadmap ?? path.join(REPO_ROOT, 'roadmap-board', 'roadmap2-data.json');
  const reportsDir = opts['reports-dir'] ?? path.join(REPO_ROOT, 'sprint-reports');
  const outDir = opts['out-dir'] ?? path.join(REPO_ROOT, 'public');
  const generatedAt = opts['generated-at'] ?? new Date().toISOString();

  const roadmap = JSON.parse(fs.readFileSync(roadmapFile, 'utf8'));
  const ghIssues = opts.issues ? JSON.parse(fs.readFileSync(opts.issues, 'utf8')) : fetchGithubIssues();
  const issues = normalizeIssues(ghIssues);
  const releasedTags =
    opts['released-tags'] !== undefined
      ? new Set(opts['released-tags'].split(',').map((t) => t.trim()).filter(Boolean))
      : fetchReleasedTags();
  const reports = loadReports(roadmap, reportsDir, releasedTags);
  const publishedReports = reports.filter((r) => r.published && !r.retrospective).map((r) => r.slug);

  const roadmapPath = path.join(outDir, 'roadmap', 'index.html');
  const reportsPath = path.join(outDir, 'reports', 'index.html');
  fs.mkdirSync(path.dirname(roadmapPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportsPath), { recursive: true });
  fs.writeFileSync(roadmapPath, renderRoadmapPage(roadmap, issues, { generatedAt, publishedReports }));
  fs.writeFileSync(reportsPath, renderReportsPage(reports, { generatedAt }));
  console.info(`[build-sprint-report] wrote ${roadmapPath}`);
  console.info(`[build-sprint-report] wrote ${reportsPath} (${reports.filter((r) => r.published).length} published)`);
  return { roadmapPath, reportsPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
