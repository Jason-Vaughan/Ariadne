#!/usr/bin/env bash
# Opens the narrow public HTTPS tunnel to the local Ariadne server, and nothing else.
#
# Usage: scripts/tunnel.sh [--check]
#        scripts/tunnel.sh --backup [DEST]
#   --check   validate configuration and print the tunnel target without starting anything
#   --backup  write a point-in-time SQLite backup (VACUUM INTO) plus DEST.sha256, print JSON and exit;
#             DEST defaults to data/backups/ariadne-<UTC timestamp>.db. Verify: shasum -a 256 -c DEST.sha256
#
# Environment:
#   ARIADNE_PORT      local Ariadne port (default 3420; only 3420 or 3421 are accepted)
#   ARIADNE_TUNNEL    cloudflared (default) | ngrok
#   ARIADNE_SKIP_HEALTH=1  skip the local /api/health probe before starting
#   ARIADNE_DB_PATH   database to back up (default data/ariadne.db)
set -euo pipefail

PORT="${ARIADNE_PORT:-3420}"
PROVIDER="${ARIADNE_TUNNEL:-cloudflared}"
CHECK_ONLY=0
BACKUP=0
BACKUP_DEST=""
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --backup)
      BACKUP=1
      if [[ $# -gt 1 && "$2" != --* ]]; then BACKUP_DEST="$2"; shift; fi
      ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "tunnel.sh: unknown argument: $1" >&2; exit 64 ;;
  esac
  shift
done

if [[ "$BACKUP" == 1 ]]; then
  BACKUP_DEST="${BACKUP_DEST:-$REPO_ROOT/data/backups/ariadne-$(date -u +%Y%m%dT%H%M%SZ).db}"
  # Paths travel through the environment, never into the script text.
  ARIADNE_REPO_ROOT="$REPO_ROOT" ARIADNE_BACKUP_DEST="$BACKUP_DEST" exec node --no-warnings --input-type=module -e '
    const { pathToFileURL } = await import("node:url");
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const root = process.env.ARIADNE_REPO_ROOT;
    const client = await import(pathToFileURL(`${root}/src/db/client.ts`).href);
    const source = resolve(root, client.resolveDbPath());
    if (!existsSync(source)) {
      console.error(`tunnel.sh: no database to back up at ${source}`);
      process.exit(66);
    }
    const { db } = client.openDatabase({ path: source, cwd: root, schemaPath: null });
    try {
      console.log(JSON.stringify(client.backupDatabase(db, process.env.ARIADNE_BACKUP_DEST)));
    } finally {
      db.close();
    }
  '
fi

# The tunnel must only ever reach the Ariadne app or its staging twin (PortHub leases 3420/3421).
case "$PORT" in
  3420|3421) ;;
  *) echo "tunnel.sh: refusing port '$PORT' — only Ariadne ports 3420/3421 may be tunnelled" >&2; exit 65 ;;
esac

case "$PROVIDER" in
  cloudflared|ngrok) ;;
  *) echo "tunnel.sh: unknown tunnel provider '$PROVIDER' (use cloudflared or ngrok)" >&2; exit 64 ;;
esac

TARGET="http://127.0.0.1:${PORT}"
echo "tunnel.sh: provider=${PROVIDER} target=${TARGET}"

if [[ "$CHECK_ONLY" == 1 ]]; then
  exit 0
fi

if ! command -v "$PROVIDER" >/dev/null 2>&1; then
  echo "tunnel.sh: '$PROVIDER' is not installed or not on PATH" >&2
  exit 69
fi

if [[ "${ARIADNE_SKIP_HEALTH:-0}" != 1 ]]; then
  # /api/health is 200 only for a WAL database with the full schema; --fail rejects its 503s.
  if ! curl --silent --fail --max-time 3 "${TARGET}/api/health" >/dev/null; then
    echo "tunnel.sh: Ariadne is not ready at ${TARGET}/api/health (needs 200: running server, WAL database, full schema)" >&2
    exit 69
  fi
fi

# A minimal environment keeps TangleClaw/Medusa variables and credentials out of the tunnel process.
PROVIDER_BIN="$(command -v "$PROVIDER")"
if [[ "$PROVIDER" == cloudflared ]]; then
  exec env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" HOME="$HOME" \
    "$PROVIDER_BIN" tunnel --no-autoupdate --url "$TARGET"
else
  exec env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" HOME="$HOME" \
    "$PROVIDER_BIN" http "$TARGET"
fi
