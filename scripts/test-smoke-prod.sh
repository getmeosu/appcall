#!/usr/bin/env bash
# Safety regression fixture for scripts/smoke-prod.sh.
#
# This deliberately uses fake docker/curl binaries. It proves that smoke runs
# own their temporary identity and teardown boundary without contacting Docker
# or a provider. The actual topology check remains scripts/smoke-prod.sh.
set -euo pipefail
umask 077

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/appcall-smoke-test.XXXXXX")
SMOKE_REPO="$TEST_ROOT/repo"
SMOKE="$SMOKE_REPO/scripts/smoke-prod.sh"
FAKE_BIN="$TEST_ROOT/bin"
RUN_TMP="$TEST_ROOT/runs"
DOCKER_LOG="$TEST_ROOT/docker.log"
CURL_LOG="$TEST_ROOT/curl.log"

mkdir -p "$SMOKE_REPO/scripts" "$FAKE_BIN" "$RUN_TMP"
cp "$ROOT/scripts/smoke-prod.sh" "$SMOKE"
chmod 755 "$SMOKE"
printf '%s\n' '# fake compose project' > "$SMOKE_REPO/docker-compose.prod.yml"
printf '%s\n' 'user-owned-smoke-env' > "$SMOKE_REPO/.env.smoke"
printf '%s\n' 'user-owned-env' > "$SMOKE_REPO/.env"
printf '%s\n' 'user-owned-production-env' > "$SMOKE_REPO/.env.production"
touch "$DOCKER_LOG" "$CURL_LOG"
chmod 600 "$DOCKER_LOG" "$CURL_LOG"

restore_user_env() {
  rm -rf "$TEST_ROOT"
}
trap restore_user_env EXIT

cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log=${SMOKE_DOCKER_LOG:?}

if [ "${1:-}" = "inspect" ]; then
  if [[ "$*" == *State.ExitCode* ]]; then
    printf '0\n'
  else
    printf '\n'
  fi
  exit 0
fi

[ "${1:-}" = "compose" ] || exit 0
shift
project=unknown
env_file=unknown
command=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -p|--project-name)
      project=$2
      shift 2
      ;;
    -f|--file|--env-file)
      if [ "$1" = "--env-file" ]; then env_file=$2; fi
      shift 2
      ;;
    *)
      command+=("$1")
      shift
      ;;
  esac
done
args=${command[*]}
logged_args=$(printf '%s' "$args" | sed -E 's/(Authorization: Bearer )[A-Za-z0-9]+/\1REDACTED/g')
logged_args=$(printf '%s' "$logged_args" | sed -E 's/(key_hash=)[^ ]+/\1REDACTED/g')
printf 'project=%s env=%s command=%s\n' "$project" "$env_file" "$logged_args" >> "$log"

if [[ "$args" == up\ * ]] && [ -n "${SMOKE_DOCKER_SLEEP:-}" ]; then
  sleep "$SMOKE_DOCKER_SLEEP"
fi
if [[ "$args" == down\ * ]] && [ -n "${SMOKE_DOCKER_DOWN_SLEEP:-}" ]; then
  sleep "$SMOKE_DOCKER_DOWN_SLEEP"
fi
if [[ "$args" == down\ * ]] && [ "${SMOKE_DOCKER_FAIL_DOWN:-0}" = "1" ]; then
  exit 1
fi

case "$args" in
  "port api 5080")
    printf '127.0.0.1:51890\n'
    ;;
  "ps -q runner")
    printf 'runner-%s\n' "$project"
    ;;
  "ps -q db")
    printf 'db-%s\n' "$project"
    ;;
  "ps -a -q api")
    printf 'api-%s\n' "$project"
    ;;
  "ps -a -q worker")
    printf 'worker-%s\n' "$project"
    ;;
  *"run --rm --no-deps"*)
    printf 'rust_api_startup_failed\n'
    exit 1
    ;;
  *"exec -T api sh -c"*)
    if [[ "$args" == *"Authorization: Bearer"* ]]; then
      printf '{"name":"appcall-bun"}\n'
    else
      printf 'HTTP/1.1 401 Unauthorized\n'
    fi
    ;;
  *)
    ;;
esac
EOF
chmod 700 "$FAKE_BIN/docker"

cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log=${SMOKE_CURL_LOG:?}
logged_args=$(printf '%s' "$*" | sed -E 's/(X-API-Key: )[A-Za-z0-9_]+/\1REDACTED/g')
printf '%s\n' "$logged_args" >> "$log"
case "$*" in
  *"/healthz"*)
    printf '{"status":"ok"}\n'
    ;;
  *"/readyz"*)
    if [[ "$*" == *"%{http_code}"* ]]; then
      count=$(grep -c '/readyz' "$log" || true)
      if [ "$count" -eq 2 ]; then
        printf '503\n'
      else
        printf '200\n'
      fi
    else
      printf '{"status":"ready"}\n'
    fi
    ;;
  *"/app"*)
    if [[ "$*" == *"%{redirect_url}"* ]]; then
      printf '302 http://127.0.0.1:51890/login\n'
    else
      printf '<html>login</html>\n'
    fi
    ;;
  *"/v1/connectors"*)
    printf '{"connectors":[{"key":"telegram"}]}\n'
    ;;
  *)
    printf '{}\n'
    ;;
esac
EOF
chmod 700 "$FAKE_BIN/curl"

run_smoke() {
  local port=$1
  local curl_log="$TEST_ROOT/curl-$port.log"
  : > "$curl_log"
  chmod 600 "$curl_log"
  KEEP_STACK=1 \
  SKIP_BUILD=1 \
  APPCALL_SMOKE_PORT="$port" \
  TMPDIR="$RUN_TMP" \
  PATH="$FAKE_BIN:$PATH" \
  SMOKE_DOCKER_LOG="$DOCKER_LOG" \
  SMOKE_CURL_LOG="$curl_log" \
  "$SMOKE" >/dev/null
}

run_smoke 5091 &
run_a=$!
run_smoke 5092 &
run_b=$!
run_status=0
wait "$run_a" || run_status=1
wait "$run_b" || run_status=1
[ "$run_status" -eq 0 ]

grep -q '^user-owned-smoke-env$' "$SMOKE_REPO/.env.smoke"
grep -q '^user-owned-env$' "$SMOKE_REPO/.env"
grep -q '^user-owned-production-env$' "$SMOKE_REPO/.env.production"

run_dirs=("$RUN_TMP"/appcall-smoke-*)
[ -d "${run_dirs[0]}" ]
[ "${#run_dirs[@]}" -eq 2 ]

projects=$(sed -n 's/^project=\([^ ]*\) .*$/\1/p' "$DOCKER_LOG" | sort -u | wc -l | tr -d ' ')
[ "$projects" -eq 2 ]

for run_dir in "${run_dirs[@]}"; do
  env_file="$run_dir/env"
  guard_log=$(find "$run_dir" -type f -name 'guard.log.*' -print -quit)
  [ -f "$env_file" ]
  [ -f "$guard_log" ]
  grep -q '^APPCALL_ENV=production$' "$env_file"
  env_mode=$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%Lp' "$env_file")
  log_mode=$(stat -c '%a' "$guard_log" 2>/dev/null || stat -f '%Lp' "$guard_log")
  [ "$env_mode" = 600 ]
  [ "$log_mode" = 600 ]
done

start=$(date +%s)
if KEEP_STACK=0 \
  SKIP_BUILD=1 \
  APPCALL_SMOKE_PORT=5093 \
  APPCALL_SMOKE_COMMAND_TIMEOUT_SECONDS=1 \
  APPCALL_SMOKE_START_TIMEOUT_SECONDS=1 \
  SMOKE_DOCKER_SLEEP=5 \
  TMPDIR="$RUN_TMP" \
  PATH="$FAKE_BIN:$PATH" \
  SMOKE_DOCKER_LOG="$DOCKER_LOG" \
  SMOKE_CURL_LOG="$CURL_LOG" \
  "$SMOKE" >/dev/null 2>&1; then
  printf '%s\n' 'expected bounded smoke command to fail' >&2
  exit 1
fi
elapsed=$(( $(date +%s) - start ))
[ "$elapsed" -lt 5 ]

invalid_before=$(find "$RUN_TMP" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
if APPCALL_SMOKE_PORT=invalid TMPDIR="$RUN_TMP" PATH="$FAKE_BIN:$PATH" "$SMOKE" >/dev/null 2>&1; then
  printf '%s\n' 'expected invalid smoke port to fail' >&2
  exit 1
fi
invalid_after=$(find "$RUN_TMP" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
[ "$invalid_before" -eq "$invalid_after" ]

teardown_output="$TEST_ROOT/teardown.out"
if KEEP_STACK=0 \
  SKIP_BUILD=1 \
  APPCALL_SMOKE_PORT=5094 \
  TMPDIR="$RUN_TMP" \
  PATH="$FAKE_BIN:$PATH" \
  SMOKE_DOCKER_LOG="$DOCKER_LOG" \
  SMOKE_CURL_LOG="$CURL_LOG" \
  SMOKE_DOCKER_FAIL_DOWN=1 \
  "$SMOKE" >"$teardown_output" 2>&1; then
  printf '%s\n' 'expected teardown failure to fail the smoke command' >&2
  exit 1
fi
grep -q 'owned stack cleanup failed' "$teardown_output"
retained_dir=$(sed -n 's/^run directory retained at //p' "$teardown_output" | tail -1)
[ -n "$retained_dir" ]
[ -d "$retained_dir" ]
[ -f "$retained_dir/env" ]
if ! grep -q 'command=down --timeout 10 -v --remove-orphans' "$DOCKER_LOG"; then
  printf '%s\n' 'expected teardown to pass a bounded Compose stop timeout' >&2
  exit 1
fi

cleanup_timeout_output="$TEST_ROOT/cleanup-timeout.out"
timeout_start=$(date +%s)
if KEEP_STACK=0 \
  SKIP_BUILD=1 \
  APPCALL_SMOKE_PORT=5095 \
  APPCALL_SMOKE_CLEANUP_TIMEOUT_SECONDS=1 \
  SMOKE_DOCKER_DOWN_SLEEP=30 \
  TMPDIR="$RUN_TMP" \
  PATH="$FAKE_BIN:$PATH" \
  SMOKE_DOCKER_LOG="$DOCKER_LOG" \
  SMOKE_CURL_LOG="$CURL_LOG" \
  "$SMOKE" >"$cleanup_timeout_output" 2>&1; then
  printf '%s\n' 'expected bounded teardown to fail the smoke command' >&2
  exit 1
fi
timeout_elapsed=$(( $(date +%s) - timeout_start ))
[ "$timeout_elapsed" -lt 20 ]
grep -q 'owned stack cleanup failed' "$cleanup_timeout_output"
timeout_retained_dir=$(sed -n 's/^run directory retained at //p' "$cleanup_timeout_output" | tail -1)
[ -n "$timeout_retained_dir" ]
[ -d "$timeout_retained_dir" ]
[ -f "$timeout_retained_dir/env" ]

printf '%s\n' 'smoke-prod safety fixture passed'
