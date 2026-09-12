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
# Usage: scripts/smoke-prod.sh (APPCALL_SMOKE_PORT=0 chooses an ephemeral port;
# KEEP_STACK=1 retains the isolated stack and its temp env/log directory).
# SKIP_BUILD=1 is only for diagnosing a known existing image; final qualification
# uses the default build so the tested image contains the current source.
set -euo pipefail
umask 077

cd "$(cd "$(dirname "$0")/.." && pwd)"

REQUESTED_SMOKE_PORT=${APPCALL_SMOKE_PORT:-0}
COMMAND_TIMEOUT_SECONDS=${APPCALL_SMOKE_COMMAND_TIMEOUT_SECONDS:-120}
START_TIMEOUT_SECONDS=${APPCALL_SMOKE_START_TIMEOUT_SECONDS:-900}
CLEANUP_TIMEOUT_SECONDS=${APPCALL_SMOKE_CLEANUP_TIMEOUT_SECONDS:-60}
CLEANUP_STOP_TIMEOUT_SECONDS=${APPCALL_SMOKE_CLEANUP_STOP_TIMEOUT_SECONDS:-10}
CURL_TIMEOUT_SECONDS=${APPCALL_SMOKE_CURL_TIMEOUT_SECONDS:-10}
CURL_CONNECT_TIMEOUT_SECONDS=${APPCALL_SMOKE_CURL_CONNECT_TIMEOUT_SECONDS:-3}
KEEP_STACK=${KEEP_STACK:-0}

validate_seconds() {
  local name=$1
  local value=$2
  case "$value" in
    ''|*[!0-9]*) printf '%s must be a positive integer\n' "$name" >&2; exit 1 ;;
  esac
  [ "$value" -gt 0 ] || { printf '%s must be greater than zero\n' "$name" >&2; exit 1; }
}
validate_seconds APPCALL_SMOKE_COMMAND_TIMEOUT_SECONDS "$COMMAND_TIMEOUT_SECONDS"
validate_seconds APPCALL_SMOKE_START_TIMEOUT_SECONDS "$START_TIMEOUT_SECONDS"
validate_seconds APPCALL_SMOKE_CLEANUP_TIMEOUT_SECONDS "$CLEANUP_TIMEOUT_SECONDS"
validate_seconds APPCALL_SMOKE_CLEANUP_STOP_TIMEOUT_SECONDS "$CLEANUP_STOP_TIMEOUT_SECONDS"
validate_seconds APPCALL_SMOKE_CURL_TIMEOUT_SECONDS "$CURL_TIMEOUT_SECONDS"
validate_seconds APPCALL_SMOKE_CURL_CONNECT_TIMEOUT_SECONDS "$CURL_CONNECT_TIMEOUT_SECONDS"

case "$REQUESTED_SMOKE_PORT" in
  ''|*[!0-9]*) echo "invalid smoke port" >&2; exit 1 ;;
esac
[ "$REQUESTED_SMOKE_PORT" -ge 0 ] && [ "$REQUESTED_SMOKE_PORT" -le 65535 ] || exit 1

RUN_ID=$(openssl rand -hex 12)
TEMP_ROOT=${TMPDIR:-/tmp}
RUN_DIR=$(mktemp -d "$TEMP_ROOT/appcall-smoke-$RUN_ID.XXXXXX")
chmod 700 "$RUN_DIR"
ENV_FILE="$RUN_DIR/env"
GUARD_LOG=$(mktemp "$RUN_DIR/guard.log.XXXXXX")
chmod 600 "$GUARD_LOG"

PROJECT="appcall-smoke-$RUN_ID"
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.prod.yml --env-file "$ENV_FILE")
STACK_MAY_EXIST=0

PASS=0
step() { printf '\n==> %s\n' "$*"; }
ok() { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

run_bounded() {
  local seconds=$1
  shift
  if command -v timeout >/dev/null 2>&1; then
    if timeout --kill-after=1s "$seconds" "$@"; then
      return 0
    else
      local timeout_status=$?
      return "$timeout_status"
    fi
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    if gtimeout --kill-after=1s "$seconds" "$@"; then
      return 0
    else
      local gtimeout_status=$?
      return "$gtimeout_status"
    fi
  fi

  "$@" &
  local command_pid=$!
  local elapsed=0
  while kill -0 "$command_pid" 2>/dev/null; do
    if [ "$elapsed" -ge "$seconds" ]; then
      kill -TERM "$command_pid" 2>/dev/null || true
      for _ in 1 2 3 4 5; do
        kill -0 "$command_pid" 2>/dev/null || break
        sleep 1
      done
      kill -KILL "$command_pid" 2>/dev/null || true
      wait "$command_pid" 2>/dev/null || true
      printf 'command timed out after %ss\n' "$seconds" >&2
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  wait "$command_pid"
}

compose() {
  run_bounded "$COMMAND_TIMEOUT_SECONDS" "${COMPOSE[@]}" "$@"
}

compose_start() {
  run_bounded "$START_TIMEOUT_SECONDS" "${COMPOSE[@]}" up "$@"
}

compose_cleanup() {
  run_bounded "$CLEANUP_TIMEOUT_SECONDS" "${COMPOSE[@]}" "$@"
}

docker_bounded() {
  run_bounded "$COMMAND_TIMEOUT_SECONDS" docker "$@"
}

curl_smoke() {
  curl --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS" --max-time "$CURL_TIMEOUT_SECONDS" "$@"
}

cleanup() {
  local exit_code=$?
  local cleanup_failed=0
  local cleanup_status=0
  trap - EXIT
  if [ "$KEEP_STACK" != "1" ]; then
    if [ "$STACK_MAY_EXIST" = "1" ] && command -v docker >/dev/null 2>&1; then
      step "tearing down owned stack (volumes included — throwaway data)"
      compose_cleanup down --timeout "$CLEANUP_STOP_TIMEOUT_SECONDS" -v --remove-orphans >/dev/null 2>&1 || cleanup_status=$?
      if [ "$cleanup_status" -ne 0 ]; then
        cleanup_failed=$cleanup_status
        printf 'FAIL: owned stack cleanup failed for compose project %s\n' "$PROJECT" >&2
      fi
    fi
  fi

  if [ "$KEEP_STACK" = "1" ] || [ "$cleanup_failed" -ne 0 ] || [ "$exit_code" -ne 0 ]; then
    if [ "$KEEP_STACK" = "1" ]; then
      printf '\nKEEP_STACK=1 — stack left running under compose project %s\n' "$PROJECT"
    elif [ "$cleanup_failed" -ne 0 ]; then
      printf 'stack remains under compose project %s for bounded retry\n' "$PROJECT" >&2
    fi
    printf 'run directory retained at %s\n' "$RUN_DIR" >&2
  else
    rm -f "$GUARD_LOG" "$ENV_FILE"
    rmdir "$RUN_DIR" 2>/dev/null || true
  fi

  if [ "$exit_code" -ne 0 ]; then
    exit "$exit_code"
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    exit "$cleanup_failed"
  fi
  exit 0
}
trap cleanup EXIT

step "using isolated run identity"
printf 'compose project: %s\n' "$PROJECT"
printf 'run directory: %s\n' "$RUN_DIR"
step "writing throwaway environment"
API_KEY=ak_smoke_$(openssl rand -hex 16)
RUNNER_TOKEN="$(openssl rand -hex 32)"
SMOKE_DB_PASSWORD="$(openssl rand -hex 16)"
cat > "$ENV_FILE" << EOF
APPCALL_ENV=production
APPCALL_HTTP_PORT=$REQUESTED_SMOKE_PORT
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
APPCALL_ENV_FILE="$ENV_FILE"
EOF
chmod 600 "$ENV_FILE"

# This smoke qualifies anonymous browser gating and database connectivity, not
# broker login. Dedicated local-broker integration tests cover authenticated flows.
# Keep the broker URL inert and use a separate throwaway identity database.
step "starting the isolated database and identity database fixture"
STACK_MAY_EXIST=1
compose_start -d --wait db
compose exec -T db psql -U appcall -d appcall -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE anusa_smoke' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='anusa_smoke')\gexec
SQL

step "building + booting the stack (waits on all healthchecks)"
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  compose_start -d --no-build --wait
else
  compose_start -d --build --wait
fi
ok "stack healthy (db migrated, runner live, api ready)"

SMOKE_PORT="$REQUESTED_SMOKE_PORT"
if [ "$SMOKE_PORT" = "0" ]; then
  published_port=$(compose port api 5080)
  SMOKE_PORT=${published_port##*:}
fi
case "$SMOKE_PORT" in
  ''|*[!0-9]*) fail "compose returned invalid API port: $SMOKE_PORT" ;;
esac
[ "$SMOKE_PORT" -ge 1024 ] && [ "$SMOKE_PORT" -le 65535 ] || fail "compose returned invalid API port: $SMOKE_PORT"
API=http://127.0.0.1:$SMOKE_PORT
printf 'API endpoint: %s\n' "$API"

step "create an isolated hashed API key for smoke requests"
API_KEY_HASH=$(printf '%s' "$API_KEY" | openssl dgst -sha256 | awk '{print $NF}')
compose exec -T db psql -U appcall -d appcall -v ON_ERROR_STOP=1 -v key_hash="$API_KEY_HASH" <<'SQL'
INSERT INTO projects(id,name) VALUES('proj_smoke','Smoke fixture');
INSERT INTO api_keys(id,project_id,key_hash) VALUES('key_smoke','proj_smoke',:'key_hash');
SQL


step "liveness + readiness"
curl_smoke -fsS "$API/healthz" | grep -q '"status":"ok"' || fail "/healthz not ok"
curl_smoke -fsS "$API/readyz" | grep -q '"status":"ready"' || fail "/readyz not ready"
ok "/healthz and /readyz 200"

step "/readyz tracks the database"
compose stop db >/dev/null
for _ in $(seq 1 10); do
  code=$(curl_smoke -s -o /dev/null -w '%{http_code}' "$API/readyz")
  [ "$code" = "503" ] && break
  sleep 1
done
[ "$code" = "503" ] || fail "/readyz = $code with db stopped, want 503"
compose start db >/dev/null
for _ in $(seq 1 30); do
  code=$(curl_smoke -s -o /dev/null -w '%{http_code}' "$API/readyz")
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] || fail "/readyz did not recover after db restart"
for _ in $(seq 1 30); do
  if compose exec -T worker wget -T 5 -qO- http://127.0.0.1:5082/readyz >/dev/null 2>&1; then
    worker_ready=1
    break
  fi
  sleep 1
done
[ "${worker_ready:-0}" = "1" ] || fail "worker readiness did not recover after db restart"
ok "/readyz 503 with db down, API and worker ready after recovery"

step "dashboard is anusa-gated"
app_response=$(curl_smoke -s -o /dev/null -w '%{http_code} %{redirect_url}' "$API/app")
echo "  /app -> $app_response"
case "$app_response" in
  3*login*) : ;;
  *) fail "/app did not redirect to login: $app_response" ;;
esac
curl_smoke -s -L --max-redirs 2 "$API/app" | grep -q "dev@appcall.local" && fail "/app leaked the dev identity" || true
ok "/app redirects to anusa login; no dev identity"

step "runner isolation + token gate"
# Assert via the container spec, not a host probe: an unrelated local process
# (e.g. the dev runner) may legitimately listen on 5081, which would
# false-positive a curl check. What matters is that compose publishes nothing.
runner_container=$(compose ps -q runner)
# shellcheck disable=SC2016
published=$(docker_bounded inspect -f '{{range $port, $bindings := .NetworkSettings.Ports}}{{if $bindings}}{{$port}} {{end}}{{end}}' "$runner_container")
[ -z "$published" ] || fail "runner publishes ports to the host: $published"
db_container=$(compose ps -q db)
# shellcheck disable=SC2016
db_published=$(docker_bounded inspect -f '{{range $port, $bindings := .NetworkSettings.Ports}}{{if $bindings}}{{$port}} {{end}}{{end}}' "$db_container")
[ -z "$db_published" ] || fail "db publishes ports to the host: $db_published"
unauth=$(compose exec -T api sh -c \
  "wget -T 5 -S -qO- --post-data='{\"id\":\"smoke_rpc\",\"method\":\"runner.describe\"}' http://runner:5081/rpc 2>&1 || true")
echo "$unauth" | grep -q "401" || fail "runner accepted an unauthenticated RPC: $unauth"
auth=$(compose exec -T api sh -c \
  "wget -T 5 -qO- --header='Authorization: Bearer $RUNNER_TOKEN' --header='Content-Type: application/json' --post-data='{\"id\":\"smoke_rpc\",\"method\":\"runner.describe\"}' http://runner:5081/rpc")
echo "$auth" | grep -q "appcall-bun" || fail "runner rejected the valid token: $auth"
ok "runner/db publish no host ports; 401 without token, 200 with"

step "production guards fail fast"
if compose run --rm --no-deps -e APPCALL_DATABASE_URL= -e APPCALL_SECRET_KEY= api > "$GUARD_LOG" 2>&1; then
  fail "missing database configuration unexpectedly started"
fi
grep -q 'rust_api_startup_failed' "$GUARD_LOG" || fail "missing structured startup failure"
if compose run --rm --no-deps -e APPCALL_RUNNER_TOKEN= api > "$GUARD_LOG" 2>&1; then
  fail "missing runner token unexpectedly started"
fi
grep -q 'rust_api_startup_failed' "$GUARD_LOG" || fail "missing structured startup failure"
ok "boot refused without DATABASE_URL / RUNNER_TOKEN with safe diagnostics"

step "API surface with the platform key (manifests in-image)"
catalog=$(curl_smoke -fsS -H "X-API-Key: $API_KEY" "$API/v1/connectors")
echo "$catalog" | grep -q '"connectors"' || fail "/v1/connectors did not return the catalog"
echo "$catalog" | grep -q '"telegram"' || fail "catalog missing telegram (manifests not loaded?)"
ok "/v1/connectors serves the catalog"

step "graceful shutdown on SIGTERM"
compose stop api >/dev/null
api_container=$(compose ps -a -q api)
exit_code=$(docker_bounded inspect -f '{{.State.ExitCode}}' "$api_container")
[ "$exit_code" = "0" ] || fail "api exited $exit_code on SIGTERM, want 0"
compose start api >/dev/null
compose stop worker >/dev/null
worker_container=$(compose ps -a -q worker)
worker_exit=$(docker_bounded inspect -f '{{.State.ExitCode}}' "$worker_container")
[ "$worker_exit" = "0" ] || fail "worker exited $worker_exit on SIGTERM, want 0"
ok "api and worker drained and exited 0 on SIGTERM"

printf '\nAll %d smoke checks passed.\n' "$PASS"
