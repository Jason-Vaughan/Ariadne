#!/usr/bin/env bash
# Opens the narrow public HTTPS tunnel to the local Ariadne server, and nothing else.
#
# Usage: scripts/tunnel.sh [--check]
#   --check   validate configuration and print the tunnel target without starting anything
#
# Environment:
#   ARIADNE_PORT      local Ariadne port (default 3420; only 3420 or 3421 are accepted)
#   ARIADNE_TUNNEL    cloudflared (default) | ngrok
#   ARIADNE_SKIP_HEALTH=1  skip the local /api/health probe before starting
set -euo pipefail

PORT="${ARIADNE_PORT:-3420}"
PROVIDER="${ARIADNE_TUNNEL:-cloudflared}"
CHECK_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "tunnel.sh: unknown argument: $arg" >&2; exit 64 ;;
  esac
done

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
