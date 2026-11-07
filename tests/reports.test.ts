import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  escapeHtml,
  extractMetrics,
  isPublicIssue,
  loadReports,
  main,
  normalizeIssues,
  parseArgs,
  parseIssueCode,
  renderReportsPage,
  renderRoadmapPage,
  reportFigures,
  summarizeRoadmap,
} from '../scripts/build-sprint-report.js';

type GhIssue = { number: number; title: string; state: string; stateReason?: string; labels?: { name: string }[] };

const roadmap = {
  public_projection: { launch_approved: true, withheld_issues: [], exclude_labels: ['internal-only'], exclude_title_prefixes: ['[internal]'] },
  releases: [
    {
      version: '0.1.0',
      name: 'Foundation',
      public_status: 'Wave 1',
      trains: [
        { kind: 'bucket', name: 'Contracts', owner: 'Ariadne-Lane-A', cars: [1] },
        { kind: 'bucket', name: 'Reports Hub', owner: 'Ariadne-Lane-D', cars: [15] },
      ],
    },
    {
      version: '0.2.0',
      name: 'Onboarding',
      trains: [{ kind: 'bucket', name: 'QR Onboarding', owner: 'Ariadne-Lane-A', cars: [2, 3] }],
    },
  ],
  backlog: [{ name: 'Post-Hackathon V2', note: 'Deferred', cars: [13] }],
};

// GitHub numbers deliberately differ from planning codes, as on the real repo.
const ghIssues: GhIssue[] = [
  { number: 1, title: '[feature] A-001: Core contracts', state: 'CLOSED', stateReason: 'COMPLETED', labels: [] },
  { number: 14, title: '[docs] A-015: Reports hub', state: 'CLOSED', stateReason: 'COMPLETED', labels: [] },
  { number: 2, title: '[feature] A-002: QR <script>alert(1)</script>', state: 'OPEN', labels: [] },
  { number: 16, title: '[feature] A-013: Discord bot', state: 'CLOSED', stateReason: 'NOT_PLANNED', labels: [{ name: 'deferred-v2' }] },
  { number: 99, title: 'Untracked chore without a code', state: 'OPEN', labels: [] },
];

const metricsHtml = (id: string, metrics: object) =>
  `<html><body><script type="application/json" id="${id}">${JSON.stringify(metrics)}</script></body></html>`;

const sampleMetrics = {
  release_tag: 'v0.1.0',
  milestone_title: 'v0.1.0 — Spine',
  durations: { full_engineering_window_human: '1h 12m' },
  completion: { state_c_verified_closed_issues: 4, chartered_active_issues: 4 },
  diff: { prs_merged: [17, 18, 19], net_repo_insertions: 1480, net_repo_deletions: 24 },
};

/** Create a temporary directory removed after the test. */
function tempDir(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a015-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('parseIssueCode reads the planning code from a GitHub title', () => {
  assert.equal(parseIssueCode('[docs] A-015: Hackathon provenance'), 'A-015');
  assert.equal(parseIssueCode('no code here'), null);
});

test('normalizeIssues keys by planning code and maps GitHub states', () => {
  const issues = normalizeIssues(ghIssues);
  assert.equal(issues.get('A-015')?.number, 14);
  assert.equal(issues.get('A-015')?.state, 'closed');
  assert.equal(issues.get('A-013')?.state, 'dropped');
  assert.equal(issues.get('A-002')?.state, 'open');
  assert.equal(issues.get('A-015')?.title, 'A-015: Reports hub');
  assert.equal(issues.get('A-015')?.url, 'https://github.com/Jason-Vaughan/Ariadne/issues/14');
  assert.equal(issues.size, 4);
});

test('isPublicIssue honours labels, title prefixes, withheld codes and launch approval', () => {
  const issue = { code: 'A-002', title: 'A-002: QR', labels: [] as string[] };
  assert.equal(isPublicIssue(issue, roadmap.public_projection), true);
  assert.equal(isPublicIssue({ ...issue, labels: ['internal-only'] }, roadmap.public_projection), false);
  assert.equal(isPublicIssue({ ...issue, title: '[Internal] secret' }, roadmap.public_projection), false);
  assert.equal(isPublicIssue(issue, { withheld_issues: [2] }), false);
  assert.equal(isPublicIssue(issue, { launch_approved: false }), false);
});

test('extractMetrics reads either metrics block id and rejects malformed JSON', () => {
  assert.deepEqual(extractMetrics(metricsHtml('tc-canonical-metrics', { a: 1 })), { a: 1 });
  assert.deepEqual(extractMetrics(metricsHtml('tc-sprint-metrics-json', { b: 2 })), { b: 2 });
  assert.equal(extractMetrics('<script type="application/json" id="tc-canonical-metrics">{oops</script>'), null);
  assert.equal(extractMetrics('<html></html>'), null);
});

test('summarizeRoadmap counts completed issues, workstreams and the active release', () => {
  const summary = summarizeRoadmap(roadmap, normalizeIssues(ghIssues));
  assert.deepEqual(summary, { activeRelease: '0.2.0', issuesClosed: 2, issuesActive: 4, streamsDone: 2, streamsTotal: 3, lanes: 2 });
});

test('summarizeRoadmap reports no active release once every issue is settled', () => {
  const done = normalizeIssues([
    ...ghIssues.filter((i) => i.number !== 2),
    { number: 2, title: 'A-002: QR', state: 'CLOSED', stateReason: 'COMPLETED' },
    { number: 3, title: 'A-003: Connector', state: 'CLOSED', stateReason: 'NOT_PLANNED' },
  ]);
  const summary = summarizeRoadmap(roadmap, done);
  assert.equal(summary.activeRelease, null);
  assert.equal(summary.issuesActive, 3);
});

test('renderRoadmapPage shows releases, live states, KPIs, deferred work and the watermark', () => {
  const html = renderRoadmapPage(roadmap, normalizeIssues(ghIssues), { generatedAt: 'T', publishedReports: ['v0.1.0'] });
  assert.match(html, /class="tc-bg-watermark"/);
  assert.match(html, /src="\/tangleclaw-logo\.png"/);
  assert.match(html, /v0\.1\.0<\/span> Foundation/);
  assert.match(html, /v0\.2\.0<\/span> Onboarding/);
  assert.match(html, /<strong>2 \/ 4<\/strong>/);
  assert.match(html, /href="https:\/\/github.com\/Jason-Vaughan\/Ariadne\/issues\/14">#14<\/a>/);
  assert.match(html, /A-003<\/td><td><span class="muted">Not yet filed on GitHub/);
  assert.match(html, /Post-hackathon deferred work/);
  assert.match(html, /<details class="card release" open>\n<summary><span class="version">v0\.2\.0/);
  assert.match(html, /href="\/reports\/v0\.1\.0\/">v0\.1\.0 sprint report/);
  assert.doesNotMatch(html, /href="\/reports\/v0\.2\.0\/"/);
  assert.match(html, /Latest: v0\.1\.0 sprint report/);
});

test('renderRoadmapPage escapes issue titles and withholds excluded issues', () => {
  const issues = normalizeIssues([
    ...ghIssues,
    { number: 3, title: '[internal] A-003: private ops', state: 'OPEN', labels: [] },
  ]);
  const html = renderRoadmapPage(roadmap, issues, { generatedAt: 'T' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /private ops/);
  assert.match(html, /Withheld from public view/);
});

test('loadReports publishes a report only when its release tag exists', (t) => {
  const dir = tempDir(t);
  fs.mkdirSync(path.join(dir, 'v0.1.0'));
  fs.writeFileSync(path.join(dir, 'v0.1.0', 'index.html'), metricsHtml('tc-canonical-metrics', sampleMetrics));
  t.mock.method(console, 'info', () => {});
  const reports = loadReports(roadmap, dir, new Set(['v0.1.0']));
  assert.deepEqual(reports.map((r) => r.slug), ['v0.1.0', 'v0.2.0', 'v0.1.0-v0.2.0-retrospective']);
  assert.equal(reports[0].published, true);
  assert.equal(reports[0].href, '/reports/v0.1.0/');
  assert.deepEqual(reports[0].metrics, sampleMetrics);
  assert.equal(reports[1].published, false);
  assert.equal(reports[2].retrospective, true);
  assert.equal(reports[2].tag, 'v0.2.0');

  const untagged = loadReports(roadmap, dir, new Set());
  assert.equal(untagged[0].published, false, 'a report file without its release tag is a draft');
  assert.equal(untagged[0].metrics, null);
});

test('loadReports rejects a report whose metrics name a different release or none', (t) => {
  const dir = tempDir(t);
  fs.mkdirSync(path.join(dir, 'v0.1.0'));
  fs.writeFileSync(path.join(dir, 'v0.1.0', 'index.html'), metricsHtml('tc-canonical-metrics', { ...sampleMetrics, release_tag: 'v0.2.0' }));
  fs.mkdirSync(path.join(dir, 'v0.2.0'));
  fs.writeFileSync(path.join(dir, 'v0.2.0', 'index.html'), '<html>no metrics</html>');
  t.mock.method(console, 'info', () => {});
  const reports = loadReports(roadmap, dir, new Set(['v0.1.0', 'v0.2.0']));
  assert.equal(reports[0].published, false);
  assert.equal(reports[1].published, false);
});

test('the pre-event illustrative v0.1.0 report is not published before its release tag exists', (t) => {
  const root = path.resolve(import.meta.dirname, '..');
  const realRoadmap = JSON.parse(fs.readFileSync(path.join(root, 'roadmap-board', 'roadmap2-data.json'), 'utf8'));
  const reportsDir = path.join(root, 'sprint-reports');
  assert.ok(fs.existsSync(path.join(reportsDir, 'v0.1.0', 'index.html')), 'fixture: the illustrative report is present');
  t.mock.method(console, 'info', () => {});
  const reports = loadReports(realRoadmap, reportsDir, new Set());
  assert.deepEqual(reports.filter((r) => r.published), []);
  const html = renderReportsPage(reports, { generatedAt: 'T' });
  assert.doesNotMatch(html, /class="pill pill-published"/);
  assert.match(html, /No release reports are published yet/);
});

test('reportFigures summarises metrics and tolerates a missing block', () => {
  assert.deepEqual(reportFigures(sampleMetrics), {
    window: '1h 12m',
    issues: '4 / 4',
    prs: '3',
    lines: '+1480 / −24',
    tag: 'v0.1.0',
  });
  assert.deepEqual(Object.values(reportFigures(null)), ['—', '—', '—', '—', '—']);
});

test('renderReportsPage lists the retrospective first, compares published trains, and marks pending ones', () => {
  const reports = [
    { slug: 'v0.1.0', title: 'Foundation', href: '/reports/v0.1.0/', published: true, metrics: sampleMetrics, retrospective: false },
    { slug: 'v0.2.0', title: 'Onboarding', href: '/reports/v0.2.0/', published: false, metrics: null, retrospective: false },
    { slug: 'v0.1.0-v0.2.0-retrospective', title: 'Retro', href: '/reports/v0.1.0-v0.2.0-retrospective/', published: false, metrics: null, retrospective: true },
  ];
  const html = renderReportsPage(reports, { generatedAt: 'T' });
  assert.match(html, /class="tc-bg-watermark"/);
  const order = ['v0.1.0-v0.2.0-retrospective</h2>', 'v0.2.0</h2>', 'v0.1.0</a></h2>'].map((s) => html.indexOf(s));
  assert.ok(order.every((i) => i > 0), 'every card is rendered');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'retrospective first, then newest release first');
  assert.match(html, /<tr><td><a href="\/reports\/v0\.1\.0\/">v0\.1\.0<\/a><\/td><td>v0\.1\.0<\/td><td>1h 12m<\/td><td>4 \/ 4<\/td><td>3<\/td>/);
  assert.match(html, /Pending — published at the train boundary/);
});

test('renderReportsPage explains an empty comparison', () => {
  assert.match(renderReportsPage([], { generatedAt: 'T' }), /No release reports are published yet/);
});

test('parseArgs reads --name value pairs and rejects malformed input', () => {
  assert.deepEqual(parseArgs(['--out-dir', 'x', '--issues', 'y.json']), { 'out-dir': 'x', issues: 'y.json' });
  assert.throws(() => parseArgs(['stray']), /Unexpected argument/);
  assert.throws(() => parseArgs(['--out-dir']), /Missing value/);
});

test('main writes both pages from file inputs without touching GitHub', (t) => {
  const dir = tempDir(t);
  const roadmapFile = path.join(dir, 'roadmap.json');
  const issuesFile = path.join(dir, 'issues.json');
  const reportsDir = path.join(dir, 'reports-src');
  fs.writeFileSync(roadmapFile, JSON.stringify(roadmap));
  fs.writeFileSync(issuesFile, JSON.stringify(ghIssues));
  fs.mkdirSync(path.join(reportsDir, 'v0.1.0'), { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'v0.1.0', 'index.html'), metricsHtml('tc-canonical-metrics', sampleMetrics));
  t.mock.method(console, 'info', () => {});

  const out = main([
    '--roadmap', roadmapFile,
    '--issues', issuesFile,
    '--reports-dir', reportsDir,
    '--out-dir', path.join(dir, 'public'),
    '--generated-at', '2026-11-07T19:00:00Z',
    '--released-tags', 'v0.1.0',
  ]);

  const roadmapHtml = fs.readFileSync(out.roadmapPath, 'utf8');
  const reportsHtml = fs.readFileSync(out.reportsPath, 'utf8');
  assert.equal(out.roadmapPath, path.join(dir, 'public', 'roadmap', 'index.html'));
  assert.equal(out.reportsPath, path.join(dir, 'public', 'reports', 'index.html'));
  assert.match(roadmapHtml, /Generated 2026-11-07T19:00:00Z/);
  assert.match(roadmapHtml, /Latest: v0\.1\.0 sprint report/);
  assert.match(reportsHtml, /1h 12m/);
});

test('escapeHtml neutralises markup and quote characters', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(undefined), '');
});

test('the committed pages carry the fixed TangleClaw watermark', () => {
  const root = path.resolve(import.meta.dirname, '..');
  for (const page of ['public/roadmap/index.html', 'public/reports/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<div class="tc-bg-watermark" aria-hidden="true"><img src="\/tangleclaw-logo\.png"/, page);
  }
});
