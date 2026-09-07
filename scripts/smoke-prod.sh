#!/usr/bin/env bash
# Prod-shaped smoke test: boots the EXACT production compose topology with
# throwaway secrets and proves the properties the deploy depends on:
#
#   1. Rust images build (all operator binaries and migrations in-image)
#   2. all four healthchecks pass (`up --wait` = migrations applied)
#   3. /healthz 200; /readyz tracks the database (200 -> stop db -> 503 -> 200)
#   4. /app is anusa-gated (redirects to login; never the dev identity)
#   5. the runner is unreachable from the host and token-gated on the network
#   6. production config guards fail the boot loudly (missing DB URL / token)
#   7. /v1/connectors serves the catalog (manifests present in-image)
#   8. SIGTERM drains gracefully (clean exit 0)
#
# Usage: scripts/smoke-prod.sh (APPCALL_SMOKE_PORT=5089; KEEP_STACK=1 retains it)
# SKIP_BUILD=1 is only for diagnosing a known existing image; final qualification
# uses the default build so the tested image contains the current source.
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

ENV_FILE=.env.smoke
PROJECT=appcall-smoke
GUARD_LOG=$(mktemp)
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.prod.yml --env-file "$ENV_FILE")
SMOKE_PORT=${APPCALL_SMOKE_PORT:-5089}
case "$SMOKE_PORT" in ''|*[!0-9]*) echo "invalid smoke port" >&2; exit 1;; esac
[ "$SMOKE_PORT" -ge 1024 ] && [ "$SMOKE_PORT" -le 65535 ] || exit 1
API=http://127.0.0.1:$SMOKE_PORT

PASS=0
step() { printf '\n==> %s\n' "$*"; }
ok() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
  rm -f "$GUARD_LOG"
  if [ "${KEEP_STACK:-0}" != "1" ]; then
    step "tearing down (volumes included — throwaway data)"
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  else
    printf '\nKEEP_STACK=1 — stack left running under compose project %s\n' "$PROJECT"
  fi
}
trap cleanup EXIT

step "writing throwaway $ENV_FILE"
API_KEY=ak_smoke_$(openssl rand -hex 16)
RUNNER_TOKEN="$(openssl rand -hex 32)"
SMOKE_DB_PASSWORD="$(openssl rand -hex 16)"
cat > "$ENV_FILE" << EOF
APPCALL_ENV=production
APPCALL_HTTP_PORT=$SMOKE_PORT
POSTGRES_PASSWORD=$SMOKE_DB_PASSWORD
APPCALL_DEV_API_KEY=platform_smoke_$(openssl rand -hex 16)
APPCALL_SECRET_KEY=$(openssl rand -hex 32)
APPCALL_OAUTH_STATE_SECRET=$(openssl rand -hex 32)
APPCALL_RUNNER_TOKEN=$RUNNER_TOKEN
APPCALL_PUBLIC_BASE_URL=https://smoke.example.invalid
APPCALL_WEBHOOK_SIGNING_SECRET=$(openssl rand -hex 32)
ANUSA_API_URL=http://127.0.0.1:9
ANUSA_DATABASE_URL=postgres://appcall:$SMOKE_DB_PASSWORD@db:5432/anusa_smoke?sslmode=disable
ANUSA_JWT_ACCESS_SECRET=$(openssl rand -hex 32)
APPCALL_SESSION_SECRET=$(openssl rand -hex 32)
APPCALL_SESSION_COOKIE_SECURE=true
APPCALL_UNIPILE_MAX_ACCOUNTS=0
APPCALL_ENV_FILE=$ENV_FILE
EOF

# This smoke qualifies anonymous browser gating and database connectivity, not
# broker login. Dedicated local-broker integration tests cover authenticated flows.
# Keep the broker URL inert and use a separate throwaway identity database.
step "starting the isolated database and identity database fixture"
"${COMPOSE[@]}" up -d --wait db
"${COMPOSE[@]}" exec -T db psql -U appcall -d appcall -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE anusa_smoke' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='anusa_smoke')\gexec
SQL

step "building + booting the stack (waits on all healthchecks)"
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  "${COMPOSE[@]}" up -d --no-build --wait
else
  "${COMPOSE[@]}" up -d --build --wait
fi
ok "stack healthy (db migrated, runner live, api ready)"

step "create an isolated hashed API key for smoke requests"
API_KEY_HASH=$(printf '%s' "$API_KEY" | openssl dgst -sha256 | awk '{print $NF}')
"${COMPOSE[@]}" exec -T db psql -U appcall -d appcall -v ON_ERROR_STOP=1 -v key_hash="$API_KEY_HASH" <<'SQL'
INSERT INTO projects(id,name) VALUES('proj_smoke','Smoke fixture');
INSERT INTO api_keys(id,project_id,key_hash) VALUES('key_smoke','proj_smoke',:'key_hash');
SQL


step "liveness + readiness"
curl -fsS "$API/healthz" | grep -q '"status":"ok"' || fail "/healthz not ok"
curl -fsS "$API/readyz" | grep -q '"status":"ready"' || fail "/readyz not ready"
ok "/healthz and /readyz 200"

step "/readyz tracks the database"
"${COMPOSE[@]}" stop db >/dev/null
for _ in $(seq 1 10); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$API/readyz")
  [ "$code" = "503" ] && break
  sleep 1
done
[ "$code" = "503" ] || fail "/readyz = $code with db stopped, want 503"
"${COMPOSE[@]}" start db >/dev/null
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$API/readyz")
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] || fail "/readyz did not recover after db restart"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T worker wget -qO- http://127.0.0.1:5082/readyz >/dev/null 2>&1; then
    worker_ready=1
    break
  fi
  sleep 1
done
[ "${worker_ready:-0}" = "1" ] || fail "worker readiness did not recover after db restart"
ok "/readyz 503 with db down, API and worker ready after recovery"

step "dashboard is anusa-gated"
app_response=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$API/app")
echo "  /app -> $app_response"
case "$app_response" in
  3*login*) : ;;
  *) fail "/app did not redirect to login: $app_response" ;;
esac
curl -s -L --max-redirs 2 "$API/app" | grep -q "dev@appcall.local" && fail "/app leaked the dev identity" || true
ok "/app redirects to anusa login; no dev identity"

step "runner isolation + token gate"
# Assert via the container spec, not a host probe: an unrelated local process
# (e.g. the dev runner) may legitimately listen on 5081, which would
# false-positive a curl check. What matters is that compose publishes nothing.
runner_container=$("${COMPOSE[@]}" ps -q runner)
published=$(docker inspect -f '{{range $port, $bindings := .NetworkSettings.Ports}}{{if $bindings}}{{$port}} {{end}}{{end}}' "$runner_container")
[ -z "$published" ] || fail "runner publishes ports to the host: $published"
db_container=$("${COMPOSE[@]}" ps -q db)
db_published=$(docker inspect -f '{{range $port, $bindings := .NetworkSettings.Ports}}{{if $bindings}}{{$port}} {{end}}{{end}}' "$db_container")
[ -z "$db_published" ] || fail "db publishes ports to the host: $db_published"
unauth=$("${COMPOSE[@]}" exec -T api sh -c \
  "wget -S -qO- --post-data='{\"id\":\"smoke_rpc\",\"method\":\"runner.describe\"}' http://runner:5081/rpc 2>&1 || true")
echo "$unauth" | grep -q "401" || fail "runner accepted an unauthenticated RPC: $unauth"
auth=$("${COMPOSE[@]}" exec -T api sh -c \
  "wget -qO- --header='Authorization: Bearer $RUNNER_TOKEN' --header='Content-Type: application/json' --post-data='{\"id\":\"smoke_rpc\",\"method\":\"runner.describe\"}' http://runner:5081/rpc")
echo "$auth" | grep -q "appcall-bun" || fail "runner rejected the valid token: $auth"
ok "runner/db publish no host ports; 401 without token, 200 with"

step "production guards fail fast"
if "${COMPOSE[@]}" run --rm --no-deps -e APPCALL_DATABASE_URL= -e APPCALL_SECRET_KEY= api > "$GUARD_LOG" 2>&1; then
  fail "missing database configuration unexpectedly started"
fi
grep -q 'rust_api_startup_failed' "$GUARD_LOG" || fail "missing structured startup failure"
if "${COMPOSE[@]}" run --rm --no-deps -e APPCALL_RUNNER_TOKEN= api > "$GUARD_LOG" 2>&1; then
  fail "missing runner token unexpectedly started"
fi
grep -q 'rust_api_startup_failed' "$GUARD_LOG" || fail "missing structured startup failure"
ok "boot refused without DATABASE_URL / RUNNER_TOKEN with safe diagnostics"

step "API surface with the platform key (manifests in-image)"
catalog=$(curl -fsS -H "X-API-Key: $API_KEY" "$API/v1/connectors")
echo "$catalog" | grep -q '"connectors"' || fail "/v1/connectors did not return the catalog"
echo "$catalog" | grep -q '"telegram"' || fail "catalog missing telegram (manifests not loaded?)"
ok "/v1/connectors serves the catalog"

step "graceful shutdown on SIGTERM"
"${COMPOSE[@]}" stop api >/dev/null
api_container=$("${COMPOSE[@]}" ps -a -q api)
exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$api_container")
[ "$exit_code" = "0" ] || fail "api exited $exit_code on SIGTERM, want 0"
"${COMPOSE[@]}" start api >/dev/null
"${COMPOSE[@]}" stop worker >/dev/null
worker_container=$("${COMPOSE[@]}" ps -a -q worker)
worker_exit=$(docker inspect -f '{{.State.ExitCode}}' "$worker_container")
[ "$worker_exit" = "0" ] || fail "worker exited $worker_exit on SIGTERM, want 0"
ok "api and worker drained and exited 0 on SIGTERM"

printf '\nAll %d smoke checks passed.\n' "$PASS"
