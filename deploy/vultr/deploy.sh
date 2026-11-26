#!/usr/bin/env bash
# Deploys Pramaan to the Vultr server: builds the web app, syncs it with the API source and the Caddy config,
# then rebuilds and restarts the containers. Re-run after every change.
#
#   deploy/vultr/deploy.sh <server-ip> [--migrate]
#
# Needs (both gitignored): deploy/vultr/web.env (VITE_* build settings) and deploy/vultr/api.env (API secrets).
set -euo pipefail

IP="${1:?usage: deploy/vultr/deploy.sh <server-ip> [--migrate]}"
MIGRATE="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/deploy/vultr"
HOST="${SITE_HOST:-pramaan-${IP//./-}.sslip.io}"
TARGET="deploy@$IP"
SSH=(ssh -o StrictHostKeyChecking=accept-new "$TARGET")

[[ -f "$HERE/web.env" && -f "$HERE/api.env" ]] || { echo "missing deploy/vultr/web.env or api.env" >&2; exit 1; }

echo "→ Building the web app for https://$HOST"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
(
  cd "$ROOT"
  set -a; source "$HERE/web.env"; set +a
  VITE_API_URL="https://$HOST" VITE_APP_URL="https://$HOST" npx vite build --outDir "$STAGE/www" --emptyOutDir >/dev/null
)

echo "→ Syncing to $TARGET:/opt/pramaan"
rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new" \
  --exclude .venv --exclude .env --exclude '.env.*' --exclude __pycache__ --exclude .pytest_cache \
  --exclude .mypy_cache --exclude .ruff_cache --exclude .storage --exclude tests \
  "$ROOT/backend" "$TARGET:/opt/pramaan/"
rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new" "$STAGE/www/" "$TARGET:/opt/pramaan/www/"
rsync -az -e "ssh -o StrictHostKeyChecking=accept-new" "$HERE/compose.yml" "$HERE/Caddyfile" "$TARGET:/opt/pramaan/"
"${SSH[@]}" 'umask 077 && cat > /opt/pramaan/api.env' < "$HERE/api.env"   # secrets: owner-only

echo "→ Building and starting containers"
"${SSH[@]}" "cd /opt/pramaan && printf 'SITE_ADDRESS=%s\n' '$HOST' > .env && docker compose build api && \
  $( [[ "$MIGRATE" == "--migrate" ]] && echo "docker compose run --rm api alembic upgrade head &&" ) \
  docker compose up -d --remove-orphans && docker image prune -f >/dev/null"

echo "→ Waiting for https://$HOST/ready"
for _ in $(seq 1 40); do
  if curl -fsS "https://$HOST/ready" >/dev/null 2>&1; then echo "✓ Live at https://$HOST"; exit 0; fi
  sleep 5
done
echo "✗ https://$HOST/ready did not come up; check: ssh $TARGET 'cd /opt/pramaan && docker compose logs --tail 100'" >&2
exit 1
