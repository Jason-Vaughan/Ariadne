#!/usr/bin/env bash
# =============================================================================
# ARIADNE H-DAY MORNING GITHUB REPO, MILESTONES & ISSUE BOOTSTRAPPER
# =============================================================================
# PRE-H-DAY GATE: DO NOT EXECUTE BEFORE SATURDAY NOV 7, 2026 @ 09:30 AM PST GO!
#
# Usage (at 09:30 AM PST on H-Day):
#   ./scripts/bootstrap-github-issues.sh [repo-name] [--public|--private]
# Example:
#   ./scripts/bootstrap-github-issues.sh Jason-Vaughan/Ariadne --public
# =============================================================================
set -euo pipefail

REPO="${1:-Jason-Vaughan/Ariadne}"
VISIBILITY="${2:---public}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKLOG_DIR="$ROOT_DIR/ISSUE_BACKLOG"

echo "=== [1/4] Ensuring GitHub Repository $REPO ($VISIBILITY) ==="
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" "$VISIBILITY" --description "Ariadne — Find Your Thread. Evidence-Backed Multi-Agent Hackathon Matchmaker & Live Stage Visualizer"
  echo "Created repository $REPO"
else
  echo "Repository $REPO already exists"
fi

if ! git -C "$ROOT_DIR" remote get-url origin >/dev/null 2>&1; then
  git -C "$ROOT_DIR" remote add origin "https://github.com/$REPO.git"
fi

echo "=== [2/4] Creating Labels on $REPO ==="
for label_spec in \
  "P0:b60205:Critical Path MVP" \
  "P1:d93f0b:High Priority MVP" \
  "train-0:0e8a16:Train 0 — Contracts & Scaffold (v0.1.0)" \
  "train-1:1d76db:Train 1 — Core Pipeline & Stage Shell (v0.2.0)" \
  "train-2:5319e7:Train 2 — End-to-End Integration & Intros (v0.3.0)" \
  "train-3:fbca04:Train 3 — Polish, Seed Pool & Judge Reports (v1.0.0)" \
  "lane-int:0052cc:Ariadne-INT (Integrator)" \
  "lane-a:006b75:Ariadne-Lane-A (Builder A)" \
  "lane-b:2cbe4e:Ariadne-Lane-B (Builder B)" \
  "lane-c:6f42c1:Ariadne-Lane-C (Builder C)" \
  "lane-d:e99695:Ariadne-Lane-D (Builder D)" \
  "lane-obsr:fef2c0:Ariadne-Obsr (Observer)"; do
  IFS=":" read -r name color desc <<< "$label_spec"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
done

echo "=== [3/4] Creating 4 Release Train Milestones on $REPO ==="
for ms_title in \
  "v0.1.0 — Train 0: Contracts, SQLite WAL & Stage Skeleton" \
  "v0.2.0 — Train 1: Core Pipeline, Fingerprints & 4-View Stage" \
  "v0.3.0 — Train 2: Two-Stage Gemini Pool, Mutual Intros & Capacity" \
  "v1.0.0 — Train 3: Live Dogfooding, 25-Dev Seed Toggle & Judge Reports"; do
  gh api "repos/$REPO/milestones" -f title="$ms_title" -f state="open" >/dev/null 2>&1 || true
done

echo "=== [4/4] Filing All 15 Active MVP Issues (A-001..A-012, A-014..A-016) ==="
ACTIVE_ISSUES=(
  "A-001:train-0,lane-int,P0"
  "A-002:train-1,lane-a,P0"
  "A-003:train-1,lane-b,P0"
  "A-004:train-1,lane-b,P0"
  "A-005:train-1,lane-b,P1"
  "A-006:train-1,lane-c,P0"
  "A-007:train-1,lane-c,P0"
  "A-008:train-1,lane-a,P0"
  "A-009:train-1,lane-d,P0"
  "A-010:train-1,lane-d,P0"
  "A-011:train-1,lane-d,P0"
  "A-012:train-2,lane-a,P0"
  "A-014:train-0,lane-int,P0"
  "A-015:train-0,lane-obsr,P0"
  "A-016:train-2,lane-c,P0"
)

for item in "${ACTIVE_ISSUES[@]}"; do
  IFS=":" read -r id labels <<< "$item"
  file="$BACKLOG_DIR/$id.md"
  title="$(head -n 1 "$file" | sed 's/^# //')"
  echo "Filing $title ..."
  gh issue create --repo "$REPO" --title "$title" --body-file "$file" --label "$labels"
done

echo "✅ All 15 Ariadne MVP issues and 4 Release Train milestones filed on $REPO!"
