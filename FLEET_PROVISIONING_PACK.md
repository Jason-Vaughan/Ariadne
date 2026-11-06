# Ariadne Hackathon Fleet Provisioning, Non-Interactive & Medusa Config + Rule Seeding Pack

**Project:** `ARIADNE-HACK-2026` (*Find Your Thread.*)  
**PM Session:** `Ariadne-PM` (`projectId: 149`, Medusa ID: `ariadne-pm-db0f895f`)  
**Status:** Ready for Final 1-Line Console Execution on the Main Dashboard Tab (`https://cursatory.tail123678.ts.net:8443/`)

---

## 1. Why the Previous Run Printed "Done" Without Writing (`403 CSRF_REQUIRED`)

TangleClaw's armed authentication gate (`public/api-helper.js`) requires **`tcFetch`** (which attaches `X-CSRF-Token` from the `tc_csrf` cookie and `X-TangleClaw-Client: dashboard`) on every `POST` and `PATCH` request. Bare `fetch()` without `X-CSRF-Token` was rejected with `403`, while the script still reached the final `console.log` line.

The updated script below uses **`tcFetch` + `X-CSRF-Token` + `X-TangleClaw-Client: dashboard`** and verifies the HTTP status of every step.

---

## 2. 1-Line Loader (Run in the Main TangleClaw Dashboard Tab Console at `https://cursatory.tail123678.ts.net:8443/`)

> [!IMPORTANT]
> Run this in the DevTools Console of your **main TangleClaw Dashboard tab** (`https://cursatory.tail123678.ts.net:8443/`), **not** inside the `/plans/149/...` tab (plan tabs enforce `Content-Security-Policy: default-src 'none'`).

```javascript
tcFetch('/plans/149/FLEET_PROVISIONING_PACK.md').then(r=>r.text()).then(h=>eval(new DOMParser().parseFromString(h,'text/html').querySelectorAll('code.language-javascript')[1].textContent))
```

---

## 3. Full Self-Contained Script (Loaded Automatically by the 1-Liner Above)

```javascript
(async () => {
  const csrf = (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('tc_csrf=')) || '').slice(8);
  const fetcher = typeof tcFetch === 'function' ? tcFetch : fetch;
  const call = async (url, method = 'GET', body = undefined) => {
    const headers = { 'X-TangleClaw-Client': 'dashboard' };
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetcher(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) console.error(`❌ ${method} ${url} -> ${r.status}`, data);
    return { ok: r.ok, status: r.status, data };
  };

  const fleet = [
    { name: 'Ariadne-Arc',    engine: 'antigravity',            roleKey: 'ARC' },
    { name: 'Ariadne-PRR',    engine: 'codex',                  roleKey: 'PRR' },
    { name: 'Ariadne-INT',    engine: 'codex',                  roleKey: 'INT' },
    { name: 'Ariadne-Obsr',   engine: 'antigravity',            roleKey: 'OBSR' },
    { name: 'Ariadne-Lane-A', engine: 'claude-sonnet-reviewer', roleKey: 'BUILDER_A' },
    { name: 'Ariadne-Lane-B', engine: 'claude-sonnet-reviewer', roleKey: 'BUILDER_B' },
    { name: 'Ariadne-Lane-C', engine: 'claude-sonnet-reviewer', roleKey: 'BUILDER_C' },
    { name: 'Ariadne-Lane-D', engine: 'claude-sonnet-reviewer', roleKey: 'BUILDER_D' },
  ];

  const COMMON_CORE = `TEAM COMMON CORE (ARIADNE-HACK-2026 v1 — governs Ariadne-Arc, Ariadne-PRR, Ariadne-INT, Ariadne-Obsr, Ariadne-Lane-A..D)

1. Authority, Pre-H-Day Gate & Scope: Work only under an active Sprint Train Charter (Train 0..3) and explicit Car dispatch from Ariadne-PM (Medusa: ariadne-pm-db0f895f). ZERO Ariadne application code (src/, public/app/, data/ariadne.db) may be written before 09:30 AM PST on Saturday, Nov 7, 2026 AND explicit Operator GO. Stay strictly inside your assigned Car's file envelope; never self-start unassigned issues or touch another lane's files.
2. Architecture, Isolation & PortHub: Ariadne is a 100% web-only, self-hosted Node.js 22 + TypeScript + SQLite WAL (data/ariadne.db) + SSE (GET /api/events/stream) + polling fallback (GET /api/events/poll) application bound to 127.0.0.1:3420 (registered via PortHub; staging :3421; test harness :4420). Zero Ariadne runtime code or public ingress may import, proxy, or expose TangleClaw control-plane ports (:3102, :8443).
3. Privacy, Double-Opt-In Consent & Anti-Clone Matching: Stage payloads (GET /api/stage/snapshot, stage.* SSE) must remain pseudonymous (display_alias + cluster badge only) unless stage_display_consent = 1. Contact details are NEVER returned until BOTH participants explicitly approve (approval_a = 1 AND approval_b = 1). Matching uses the 5-component hybrid formula (0.35*cos(u,v) + 0.30*max(cos(n_u,o_v),cos(n_v,o_u)) + 0.15*complementarity + 0.10*novelty + 0.10*freshness) and requires 2 cited evidence pills.
4. Medusa Comms, Workload & Chunk-Boundary Completion Receipts (#1889): Keep tc workload set current at every transition. Always read full Medusa messages; reply (--in-reply-to) before tc message ack when replyRequired is true. Upon completing any assigned Car, send a structured Completion Receipt (Car ID, Issues Closed, PR #, Commit SHA, Tests Passing) to Ariadne-PM and Ariadne-Obsr, mark workload complete / safe-to-clear, and stop cleanly.`;

  const ROLE_OVERLAYS = {
    ARC: `ARCHITECT ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-Arc, A-Gate Owner)

1. Role & A-Gate Ownership: You are Ariadne-Arc (Technical Architect). You own A-Gate reviews (<= 10 min SLA) for schema changes, API/SSE contracts, privacy/consent boundaries, and cross-lane interface disputes.
2. Non-Interference & Escalation: Do not write feature code inside Builder lanes and do not merge PRs (Ariadne-INT is sole merger). Deliver crisp PASS / HOLD verdicts with exact file/line citations to Ariadne-PM and Ariadne-INT via Medusa.`,

    PRR: `PR REVIEWER ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-PRR, R-Gate Owner)

1. Role & R-Gate Ownership: You are Ariadne-PRR (Independent PR Reviewer). You own R-Gate reviews (<= 10 min turnaround) on every Car PR before Ariadne-INT merges. Never review or approve code you authored.
2. 6-Point R-Gate Checklist: Verify (a) zero files touched outside the Car's file envelope, (b) unit/contract tests passing + JSDoc on all functions + CHANGELOG.md updated, (c) double-opt-in consent & stage pseudonymity enforced, (d) zero TangleClaw :3102/:8443 leakage, (e) 2 evidence pills + anti-clone penalty preserved, (f) SSE + polling fallback parity. Send PASS or HOLD with exact file:line citations to Ariadne-INT and Ariadne-PM via Medusa.`,

    INT: `INTEGRATOR ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-INT, I-Gate Owner & Sole Merger)

1. Role, Car 0-INT / Car 3-INT & Sole Merge Authority: You are Ariadne-INT (Sole Integrator & Release Engineer). You own Car 0-INT (A-001 scaffold, A-014 S1, A-015 S1) and Car 3-INT (full E2E smoke + 60-node seed + release freeze). You are the ONLY session authorized to merge PRs to main, tag releases (v0.1.0, v0.2.0, v0.3.0, v1.0.0), and manage PortHub leases (:3420, :3421, :4420).
2. I-Gate Protocol & Branch Safety: Merge only after R-Gate PASS (and A-Gate PASS if contract-touching) plus green build/tests. Run tc branch check <branch> before retiring any branch or worktree (proceed only on safe). After each release tag, send the I-Gate Release Receipt to Ariadne-PM and Ariadne-Obsr.`,

    OBSR: `OBSERVER ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-Obsr, O-Gate & v2.0.0 Sprint Reports Owner)

1. Role & Non-Interference: You are Ariadne-Obsr (Sprint Process Observer & Metrics/Report Author). Observe fleet execution without blocking Builder or Integrator critical paths.
2. O-Gate & v2.0.0 Sprint Reports: Collect the 8 canonical timestamps (t1..t8), T_eng, 4-state issue completion (State A..D), and 3-tier cost ledger per Car. At each Train boundary (v0.1.0, v0.2.0, v0.3.0, v1.0.0), generate and validate the TangleClaw Sprint Report Standard v2.0.0 HTML report (python3 sprint-reports/validate-sprint-report.py --all) and update the live Roadmap 2 board.`,

    BUILDER_A: `BUILDER ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-Lane-A, Backend Core, Ingestion & Introductions)

1. Role & Assigned Cars: You are Ariadne-Lane-A (Builder A). Your planned Cars are Car 1-A (Conversational Onboarding & Profile Extractor: A-002, A-004, A-016 S1) and Car 2-A (Double-Opt-In Consent & Warm Intro Generator: A-007, A-008, A-009 S1).
2. Execution Discipline: Work in an isolated git worktree/branch (feat/car-1a-..., feat/car-2a-...) strictly inside your Car charter's file envelope. Write JSDoc on all functions, unit tests alongside implementation, and update CHANGELOG.md. Never run gh pr merge; open your PR and notify Ariadne-PRR, Ariadne-INT, and Ariadne-PM via Medusa.`,

    BUILDER_B: `BUILDER ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-Lane-B, Hybrid Matching & Evidence Engine)

1. Role & Assigned Cars: You are Ariadne-Lane-B (Builder B). Your planned Cars are Car 1-B (Hybrid Complementary Matching & Anti-Clone Scorer: A-003, A-005, A-017 S1) and Car 2-B (Explainable Evidence Pills & Match API: A-006, A-016 S2, A-017 S2).
2. Execution Discipline: Work in an isolated git worktree/branch (feat/car-1b-..., feat/car-2b-...) strictly inside your Car charter's file envelope. Write JSDoc on all functions, unit tests alongside implementation, and update CHANGELOG.md. Never run gh pr merge; open your PR and notify Ariadne-PRR, Ariadne-INT, and Ariadne-PM via Medusa.`,

    BUILDER_C: `BUILDER ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-Lane-C, Mobile Participant Web UI)

1. Role & Assigned Cars: You are Ariadne-Lane-C (Builder C). Your planned Cars are Car 1-C (Mobile Participant Onboarding & Profile Card UI: A-010, A-014 S2) and Car 2-C (Mobile Match Cards, Evidence Pills & Intro Drawer UI: A-009 S2, A-011).
2. Execution Discipline: Work in an isolated git worktree/branch (feat/car-1c-..., feat/car-2c-...) strictly inside your Car charter's file envelope. Verify mobile viewports (320px/375px), write JSDoc on all functions, unit tests alongside implementation, and update CHANGELOG.md. Never run gh pr merge; open your PR and notify Ariadne-PRR, Ariadne-INT, and Ariadne-PM via Medusa.`,

    BUILDER_D: `BUILDER ROLE OVERLAY (ARIADNE-HACK-2026 v1 — governs Ariadne-Lane-D, Stage Visualizer, Privacy & Resilience)

1. Role & Assigned Cars: You are Ariadne-Lane-D (Builder D). Your planned Cars are Car 1-D (Stage Graph Canvas & Live SSE Event Bus: A-012 S1, A-015 S2) and Car 2-D (Stage Privacy Controls, Warm Intro Arcs & Polling Fallback: A-012 S2, A-013, A-014 S3, A-015 S3).
2. Execution Discipline: Work in an isolated git worktree/branch (feat/car-1d-..., feat/car-2d-...) strictly inside your Car charter's file envelope. Enforce stage pseudonymity by default, write JSDoc on all functions, unit tests alongside implementation, and update CHANGELOG.md. Never run gh pr merge; open your PR and notify Ariadne-PRR, Ariadne-INT, and Ariadne-PM via Medusa.`
  };

  let failures = 0;

  // Step 1: Create any missing fleet projects (Ariadne-Arc, Ariadne-PRR, Ariadne-INT)
  const list1 = await call('/api/projects');
  const existingByName = new Map((list1.data.projects || []).map(p => [p.name, p]));

  for (const lane of fleet) {
    if (!existingByName.has(lane.name)) {
      const created = await call('/api/projects', 'POST', {
        name: lane.name,
        engine: lane.engine,
        tags: ['Ariadne', 'Ariadne-Fleet']
      });
      if (!created.ok) failures++;
      console.log('CREATE', lane.name, created.status, created.data);
    } else {
      console.log('EXISTS', lane.name, 'id=' + existingByName.get(lane.name).id);
    }
  }

  // Re-fetch project list so we have all 8 numeric IDs
  const list2 = await call('/api/projects');
  const projectsByName = new Map((list2.data.projects || []).map(p => [p.name, p]));

  // Step 2: Configure Medusa ON + Non-Interactive (Bypass) Mode + Workload Nudge on all 8 lanes
  for (const lane of fleet) {
    const p = projectsByName.get(lane.name);
    if (!p) { failures++; continue; }
    const patched = await call(`/api/projects/${encodeURIComponent(lane.name)}`, 'PATCH', {
      engine: lane.engine,
      defaultLaunchMode: 'bypassPermissions',
      showLaunchModePicker: false,
      confirmBypassHidden: true,
      releaseMode: 'off',
      versionBumpEnabled: false,
      wrapAutoPrEnabled: false,
      medusaEnabled: true,
      medusaWake: true,
      workloadNudge: { enabled: true, coordinatorProject: 'Ariadne-PM' },
      tags: ['Ariadne', 'Ariadne-Fleet']
    });
    if (!patched.ok) failures++;
    console.log('PATCH CONFIG', lane.name, patched.status, patched.ok ? 'Medusa=ON, Mode=bypassPermissions' : patched.data);
  }

  // Step 3: Seed Active Session Rules (TEAM COMMON CORE + ROLE OVERLAY) on all 8 lanes
  for (const lane of fleet) {
    const p = projectsByName.get(lane.name);
    if (!p) continue;
    const existingRules = await call(`/api/session-rules?projectId=${p.id}`);
    const activeContents = (existingRules.data.rules || [])
      .filter(r => r.status === 'active')
      .map(r => r.content || '');

    const hasCore = activeContents.some(c => c.includes('TEAM COMMON CORE (ARIADNE-HACK-2026'));
    const hasOverlay = activeContents.some(c => c.includes('ROLE OVERLAY (ARIADNE-HACK-2026'));

    if (!hasCore) {
      const r1 = await call('/api/session-rules', 'POST', { projectId: p.id, content: COMMON_CORE });
      if (!r1.ok) failures++;
      console.log('RULE CORE', lane.name, r1.status, r1.data?.rule?.status);
    }
    if (!hasOverlay) {
      const r2 = await call('/api/session-rules', 'POST', { projectId: p.id, content: ROLE_OVERLAYS[lane.roleKey] });
      if (!r2.ok) failures++;
      console.log('RULE OVERLAY', lane.name, r2.status, r2.data?.rule?.status);
    }
  }

  // Step 4: Grant Ariadne-PM (149) Project-Manager Role + Lifecycle/Hold/Stop Delegation on all 8 lanes
  const roleRes = await call('/api/coordinator-roles', 'POST', {
    projectId: 149,
    role: 'project-manager',
    note: 'Ariadne Hackathon PM Coordinator'
  });
  console.log('PM ROLE GRANT (149):', roleRes.status, roleRes.data);

  for (const lane of fleet) {
    const p = projectsByName.get(lane.name);
    if (!p) continue;
    const assign = await call('/api/control/assignments', 'POST', {
      projectId: p.id,
      requestId: `ariadne-init-pm149-${p.id}`,
      issueRef: 'ARIADNE-HACK-2026',
      authority: {
        hold: ['project:149'],
        stop: ['project:149'],
        lifecycle: ['project:149'],
        releaseDelegations: { 'project:149': ['project:149'] }
      }
    });
    if (!assign.ok) failures++;
    console.log('DELEGATE -> PM(149)', lane.name, `(#${p.id}):`, assign.status);
  }

  if (typeof loadProjects === 'function') await loadProjects();
  if (failures === 0) {
    console.log('✅ ALL 8 ARIADNE FLEET LANES CREATED, MEDUSA ENABLED, INTERACTIVE MODE OFF (BYPASS), ACTIVE RULES SEEDED, AND PM DELEGATED!');
  } else {
    console.warn(`⚠️ Completed with ${failures} failed call(s) — check red error lines above.`);
  }
})();
```
