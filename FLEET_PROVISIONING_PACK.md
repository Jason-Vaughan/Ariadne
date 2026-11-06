# Ariadne Hackathon Fleet Provisioning & Rule Seeding Pack

**Project:** `ARIADNE-HACK-2026` (*Find Your Thread.*)  
**PM Session:** `Ariadne-PM` (`projectId: 149`, Medusa ID: `ariadne-pm-db0f895f`)  
**Status:** Ready for Operator Execution (`POST /api/projects` is gated by `OPERATOR_ONLY`)

---

## 1. Why Operator Execution Is Required for Project Creation

When `Ariadne-PM` called `POST http://localhost:3102/api/projects`, TangleClaw enforced its project-creation boundary:

```json
{
  "error": "Only the operator can create a project. Ask the operator to do it from the TangleClaw dashboard; no project or Project Master binding can.",
  "code": "OPERATOR_ONLY"
}
```

To make creating the 8 remaining Ariadne fleet lanes effortless, use **Option A (1-Paste Dashboard Console Script — takes ~3 seconds)** or **Option B (Dashboard `+ New Project` UI Table)** below.

---

## 2. Option A — 1-Paste Dashboard Console Provisioner (~3 Seconds, Recommended)

Open the **TangleClaw Dashboard** (`https://cursatory.tail123678.ts.net:8443/`), open Browser DevTools (**Console**), and paste the block below. It uses the dashboard's built-in `apiMutate()` helper under your active Operator login to create all 8 fleet projects with the exact `TC-Lane-*` engine mapping and tags (`["Ariadne", "Ariadne-Fleet"]`):

```javascript
(async () => {
  const fleet = [
    { name: 'Ariadne-Arc',    engine: 'antigravity',            role: 'Technical Architect & A-Gate Owner' },
    { name: 'Ariadne-PRR',    engine: 'codex',                  role: 'Independent PR Reviewer & R-Gate Owner' },
    { name: 'Ariadne-INT',    engine: 'codex',                  role: 'Sole Integrator, :3420 Deployer & I-Gate Owner' },
    { name: 'Ariadne-Obsr',   engine: 'antigravity',            role: 'Sprint Process Observer, O-Gate & v2.0.0 Reports Owner' },
    { name: 'Ariadne-Lane-A', engine: 'claude-sonnet-reviewer', role: 'Builder A — Backend Core, Ingestion & Introductions' },
    { name: 'Ariadne-Lane-B', engine: 'claude-sonnet-reviewer', role: 'Builder B — Hybrid Matching & Evidence Engine' },
    { name: 'Ariadne-Lane-C', engine: 'claude-sonnet-reviewer', role: 'Builder C — Mobile Participant Web UI' },
    { name: 'Ariadne-Lane-D', engine: 'claude-sonnet-reviewer', role: 'Builder D — Stage Visualizer, Privacy & Resilience' },
  ];

  for (const lane of fleet) {
    const res = await apiMutate('/api/projects', 'POST', {
      name: lane.name,
      engine: lane.engine,
      defaultLaunchMode: 'default',
      showLaunchModePicker: true,
      silentPrime: true,
      tags: ['Ariadne', 'Ariadne-Fleet'],
    });
    console.log(lane.name, res ? `CREATED (id=${res.project?.id || res.id})` : `SKIPPED/ERR: ${api.lastError}`);
  }
  await loadProjects();
  console.log('✅ Ariadne Fleet provisioning complete! Tell Ariadne-PM so it can seed the role overlay rules.');
})();
```

> [!TIP]
> As soon as that finishes, just reply **"done"** here in `Ariadne-PM` — I will immediately detect the new project IDs via `GET /api/projects` and propose each project's tailored Role Overlay rule via `POST /api/session-rules` so you only have to click Approve!

---

## 3. Option B — Ariadne 9-Lane Fleet Roster Reference Table

If you prefer creating lanes individually via **`+ New Project`** in the TangleClaw Dashboard:

| # | Project Name | Engine | Tags | Gate / Role | Priming Prompt Link (MagicDNS) |
|---|---|---|---|---|---|
| 1 | **`Ariadne-PM`** *(Live, ID `149`)* | `antigravity` | `Ariadne` | **PM & Release Train Conductor** (Rule `#304` Active) | [PRIMING_PM.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_PM.md) |
| 2 | **`Ariadne-Arc`** | `antigravity` | `Ariadne`, `Ariadne-Fleet` | **`A-Gate` — Technical Architect** | [PRIMING_ARCHITECT.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_ARCHITECT.md) |
| 3 | **`Ariadne-PRR`** | `codex` | `Ariadne`, `Ariadne-Fleet` | **`R-Gate` — Independent PR Reviewer** | [PRIMING_PRR.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_PRR.md) |
| 4 | **`Ariadne-INT`** | `codex` | `Ariadne`, `Ariadne-Fleet` | **`I-Gate` — Sole Integrator & `:3420` Deployer** | [PRIMING_INTEGRATOR.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_INTEGRATOR.md) |
| 5 | **`Ariadne-Obsr`** | `antigravity` | `Ariadne`, `Ariadne-Fleet` | **`O-Gate` — Sprint Observer & `v2.0.0` Reports** | [PRIMING_OBSERVER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_OBSERVER.md) |
| 6 | **`Ariadne-Lane-A`** | `claude-sonnet-reviewer` | `Ariadne`, `Ariadne-Fleet` | **Builder A — Onboarding, GitHub Ingestion & Introductions** | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| 7 | **`Ariadne-Lane-B`** | `claude-sonnet-reviewer` | `Ariadne`, `Ariadne-Fleet` | **Builder B — Hybrid Matching & Evidence Engine** | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| 8 | **`Ariadne-Lane-C`** | `claude-sonnet-reviewer` | `Ariadne`, `Ariadne-Fleet` | **Builder C — Mobile Participant Web UI** | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |
| 9 | **`Ariadne-Lane-D`** | `claude-sonnet-reviewer` | `Ariadne`, `Ariadne-Fleet` | **Builder D — Stage Visualizer, Privacy & Resilience** | [PRIMING_BUILDER.md](https://cursatory.tail123678.ts.net:8443/plans/149/PRIMING_BUILDER.md) |

---

## 4. Role Overlay Rules Ready to Seed on Creation

Once the 8 fleet projects are created, `Ariadne-PM` will propose (or you can auto-seed) one consolidated `kind: "core"` rule per lane combining the **Ariadne Team Common Core** with the lane's specific **Role Overlay**:

1. **Ariadne Team Common Core (Included in All Lanes):**
   - **Pre-H-Day Gate:** Zero Ariadne application code before `09:30 AM PST` on Saturday, Nov 7, 2026 AND explicit Operator `GO`.
   - **Web-Only Self-Hosted Isolation:** Ariadne runs on `127.0.0.1:3420` (PortHub-registered), backed by SQLite WAL (`data/ariadne.db`) and SSE (`GET /api/events/stream`) + polling fallback (`GET /api/events/poll`), with zero exposure of TangleClaw `:3102` / `:8443`.
   - **Privacy & Double-Opt-In Consent:** Stage payloads (`GET /api/stage/snapshot`, `stage.*` SSE) remain pseudonymous unless `stage_display_consent = 1`. Contact details are never returned until BOTH participants approve (`approval_a = 1 AND approval_b = 1`).
   - **Chunk-Boundary Completion Receipts (`#1889`):** Every completed Car requires a structured Medusa receipt (`Car ID`, `Issues Closed`, `PR #`, `Commit SHA`, `Tests Passing`) to `Ariadne-PM` (`ariadne-pm-db0f895f`) and `Ariadne-Obsr` before stopping.
2. **Role Overlays:**
   - **`Ariadne-Arc` (`A-Gate`):** Owns contract/schema review (`<= 10 min` SLA), file-envelope isolation checks, and architectural escalations. Does not merge PRs.
   - **`Ariadne-PRR` (`R-Gate`):** Owns independent PR review (`<= 10 min` turnaround) verifying the 6-point checklist (file envelope, tests+JSDoc+CHANGELOG, privacy/consent, control-plane isolation, anti-clone matching evidence, SSE/poll resilience). Never approves own code.
   - **`Ariadne-INT` (`I-Gate`):** Sole merger to `main`, sole release tagger (`v0.1.0`..`v1.0.0`), owner of `Car 0-INT` (`A-001`, `A-014` S1, `A-015` S1) and `Car 3-INT`, PortHub `:3420`/`:3421`/`:4420` lease holder, and `tc branch check` enforcer.
   - **`Ariadne-Obsr` (`O-Gate`):** Non-interfering telemetry collector and author of the per-train TangleClaw Sprint Report Standard `v2.0.0` HTML reports (`public/reports/v0.1.0.html`..`v1.0.0.html`) and live roadmap updates (`public/roadmap/index.html`).
   - **`Ariadne-Lane-A..D` (Builders):** Execute strictly within their dispatched Car (`1 Car = 1 Worktree = 1 Branch = 1 PR`) and strict file envelope (`TRAIN_1_CHARTER_v0.2.0.md` .. `TRAIN_3_CHARTER_v1.0.0.md`). Never self-start or self-merge.
