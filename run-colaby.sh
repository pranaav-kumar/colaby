#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

service_names=(discovery userdetails project auth community profile collaboration gateway frontend)
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: ./run-colaby.sh [--status|--stop]

  (no option)  Start PostgreSQL, Redis, and all Colaby application services.
  --status     Show which application processes are running.
  --stop       Stop application processes started by this script.

Logs and PID files are stored in .run/.
EOF
}

is_running() {
  local name="$1" pid_file="$PID_DIR/$1.pid" pid
  [[ -f "$pid_file" ]] || return 1
  read -r pid < "$pid_file" || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

show_status() {
  local name
  for name in "${service_names[@]}"; do
    if is_running "$name"; then
      printf '%-16s running (pid %s)\n' "$name" "$(<"$PID_DIR/$name.pid")"
    else
      printf '%-16s stopped\n' "$name"
    fi
  done
  docker compose ps
}

stop_services() {
  local name pid
  for name in "${service_names[@]}"; do
    if is_running "$name"; then
      read -r pid < "$PID_DIR/$name.pid"
      printf 'Stopping %-16s (pid %s)\n' "$name" "$pid"
      kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      rm -f "$PID_DIR/$name.pid"
    fi
  done
  printf 'Application processes stopped. PostgreSQL and Redis containers remain running.\n'
  printf 'Stop containers separately with: docker compose down\n'
}

case "${1:-}" in
  --status) show_status; exit 0 ;;
  --stop) stop_services; exit 0 ;;
  "") ;;
  *) usage >&2; exit 2 ;;
esac

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  }
}

for command_name in docker java go node npm curl; do
  require_command "$command_name"
done
docker compose version >/dev/null

if [[ ! -f .env ]]; then
  if (echo > /dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then
    cp .env.example .env
    printf 'Created local .env from .env.example. PostgreSQL is already running, so its Compose service will be reused.\n'
  else
    printf 'Missing .env and PostgreSQL is not running. Run: cp .env.example .env, set POSTGRES_PASSWORD, then retry.\n' >&2
    exit 1
  fi
fi
if [[ ! -f backend/collaboration-service/.env ]]; then
  printf 'Missing backend/collaboration-service/.env. Copy its .env.example and configure it.\n' >&2
  exit 1
fi
for service in authservice userdetailsservice projectservice profileservice communityservice; do
  if [[ ! -f "backend/$service/src/main/resources/application-local.properties" ]]; then
    printf 'Missing backend/%s/src/main/resources/application-local.properties. See HOW_TO_SETUP.md.\n' "$service" >&2
    exit 1
  fi
done
if [[ ! -d frontend/node_modules ]]; then
  printf 'Frontend dependencies are missing. Run: cd frontend && npm ci\n' >&2
  exit 1
fi

start_service() {
  local name="$1" dir="$2"
  shift 2
  if is_running "$name"; then
    printf '%-16s already running (pid %s)\n' "$name" "$(<"$PID_DIR/$name.pid")"
    return
  fi
  rm -f "$PID_DIR/$name.pid"
  printf 'Starting %-16s (logs: .run/logs/%s.log)\n' "$name" "$name"
  (
    cd "$ROOT_DIR/$dir"
    nohup setsid "$@" >> "$LOG_DIR/$name.log" 2>&1 < /dev/null &
    echo "$!" > "$PID_DIR/$name.pid"
  )
}

wait_for_port() {
  local name="$1" port="$2" pid_file="$PID_DIR/$1.pid" attempt pid
  printf 'Waiting for %-16s on port %s' "$name" "$port"
  for attempt in $(seq 1 180); do
    if (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; then
      printf ' ready\n'
      return 0
    fi
    if [[ -f "$pid_file" ]]; then
      read -r pid < "$pid_file" || true
      if [[ -n "${pid:-}" ]] && ! kill -0 "$pid" 2>/dev/null; then
        printf '\n%s exited during startup. See .run/logs/%s.log\n' "$name" "$name" >&2
        tail -40 "$LOG_DIR/$name.log" >&2 || true
        return 1
      fi
    fi
    sleep 1
  done
  printf '\nTimed out waiting for %s. See .run/logs/%s.log\n' "$name" "$name" >&2
  tail -40 "$LOG_DIR/$name.log" >&2 || true
  return 1
}

ensure_data_services() {
  local pg_container redis_container
  pg_container="$(docker ps --filter 'name=^/colaby-postgres$' --format '{{.Names}}' | head -1)"
  redis_container="$(docker ps --filter 'publish=6379' --format '{{.Names}}' | head -1)"

  if [[ -z "$pg_container" ]] && (echo > /dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then
    printf 'PostgreSQL is already listening on port 5432; reusing it.\n'
  else
    docker compose up -d postgres
  fi

  if [[ -n "$redis_container" ]]; then
    printf 'Redis Docker container "%s" is already publishing port 6379; reusing it.\n' "$redis_container"
  elif (echo > /dev/tcp/127.0.0.1/6379) >/dev/null 2>&1; then
    printf 'Port 6379 is occupied by a non-Docker service. Stop it so Redis can run in Docker.\n' >&2
    return 1
  else
    docker compose up -d redis
  fi
}

ensure_data_services

# Service registry and internal callers must be up before the gateway/frontend.
start_service discovery backend/discoveryservice bash ./mvnw spring-boot:run
wait_for_port discovery 8761

start_service userdetails backend/userdetailsservice bash ./mvnw spring-boot:run
start_service project backend/projectservice bash ./mvnw spring-boot:run
wait_for_port userdetails 8082
wait_for_port project 8084

start_service auth backend/authservice bash ./mvnw spring-boot:run
start_service community backend/communityservice bash ./mvnw spring-boot:run
start_service profile backend/profileservice bash ./mvnw spring-boot:run
wait_for_port auth 8081
wait_for_port community 8083
wait_for_port profile 8085

start_service collaboration backend/collaboration-service go run .
wait_for_port collaboration 8090

start_service gateway backend/apigateway bash ./mvnw spring-boot:run
wait_for_port gateway 8080

start_service frontend frontend npm run dev -- --host 0.0.0.0
wait_for_port frontend 3000

printf '\nColaby is ready: http://localhost:3000\n'
printf 'API Gateway:     http://localhost:8080\n'
printf 'Collaboration:   http://localhost:8090/health\n'
printf 'View status:     ./run-colaby.sh --status\n'
printf 'Stop services:   ./run-colaby.sh --stop\n'
