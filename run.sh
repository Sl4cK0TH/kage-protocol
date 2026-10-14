#!/usr/bin/env bash
#
# The Kage Protocol — one-command setup and launcher.
#
#   ./run.sh            Configure on first run (asks for admin credentials etc.),
#                       then build and start the backend and dashboard.
#   ./run.sh setup      Re-run the questions to change settings, then restart.
#   ./run.sh stop       Stop everything (your data is kept).
#   ./run.sh status     Show container status.
#   ./run.sh logs       Follow logs (optionally: ./run.sh logs backend).
#
# Secrets are written to backend/.env (chmod 600, git-ignored). The admin
# password is hashed with bcrypt inside the backend's Docker image, so no local
# Python/bcrypt is needed, and it is passed via stdin (never on a command line).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
BACKEND_ENV_EXAMPLE="$ROOT_DIR/backend/.env.example"
ROOT_ENV="$ROOT_DIR/.env"
DEFAULT_PROJECT="kage"

# --- Output helpers -----------------------------------------------------------

if [[ -t 1 ]]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; CYAN=$'\e[36m'; RESET=$'\e[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; CYAN=""; RESET=""
fi

info() { printf '%s\n' "${CYAN}==>${RESET} $*"; }
ok()   { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}!${RESET} $*" >&2; }
die()  { printf '%s\n' "${RED}✗ $*${RESET}" >&2; exit 1; }

usage() {
  sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
}

# --- .env file helpers ----------------------------------------------------------

# Print KEY's value from an env file (surrounding single/double quotes removed).
env_get() {
  local key=$1 file=$2
  [[ -f $file ]] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n 1 | sed -e "s/^'\(.*\)'$/\1/" -e 's/^"\(.*\)"$/\1/'
}

# Set KEY=VALUE in an env file: replace the existing line or append one.
# awk -v would interpret backslashes, so the value is passed through ENVIRON.
env_set() {
  local key=$1 value=$2 file=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  KEY="$key" VALUE="$value" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  # Keep the original file's permissions (backend/.env is 600).
  chmod --reference="$file" "$tmp" 2>/dev/null || true
  mv "$tmp" "$file"
}

# --- Input helpers ------------------------------------------------------------------

# ask VAR "Question" "default" — read a line, falling back to the default.
ask() {
  local __var=$1 prompt=$2 default=${3:-} reply
  if [[ -n $default ]]; then
    read -r -p "  ${prompt} ${DIM}[${default}]${RESET}: " reply || die "No input (run ./run.sh from an interactive terminal)."
  else
    read -r -p "  ${prompt}: " reply || die "No input (run ./run.sh from an interactive terminal)."
  fi
  printf -v "$__var" '%s' "${reply:-$default}"
}

# ask_secret VAR "Question" — read without echoing.
ask_secret() {
  local __var=$1 prompt=$2 reply
  read -r -s -p "  ${prompt}: " reply || die "No input (run ./run.sh from an interactive terminal)."
  printf '\n'
  printf -v "$__var" '%s' "$reply"
}

# confirm "Question" "y|n" — returns 0 for yes.
confirm() {
  local prompt=$1 default=${2:-n} reply hint="[y/N]"
  [[ $default == y ]] && hint="[Y/n]"
  read -r -p "  ${prompt} ${DIM}${hint}${RESET}: " reply || die "No input."
  reply=${reply:-$default}
  [[ $reply =~ ^[Yy] ]]
}

valid_port() { [[ $1 =~ ^[0-9]+$ ]] && (( $1 >= 1024 && $1 <= 65535 )); }

# Is something listening on 127.0.0.1:PORT? (bash /dev/tcp — no extra tools)
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Is the port held by this Kage project's own containers (fine to reuse)?
port_owned_by_us() {
  [[ -n $(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "publish=$1") ]]
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# --- Preflight -----------------------------------------------------------------------

preflight() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required ('docker compose', not 'docker-compose')."
  if ! docker info >/dev/null 2>&1; then
    die "Can't reach the Docker daemon. Is it running, and is your user in the 'docker' group?"
  fi
  [[ -f $BACKEND_ENV_EXAMPLE ]] || die "Missing $BACKEND_ENV_EXAMPLE — run this script from a full checkout."
}

# The root .env pins the Compose project name, so every command manages the
# same stack (and the same data volume) no matter how it is invoked.
ensure_root_env() {
  [[ -f $ROOT_ENV ]] || : > "$ROOT_ENV"
  PROJECT=$(env_get COMPOSE_PROJECT_NAME "$ROOT_ENV")
  if [[ -z $PROJECT ]]; then
    PROJECT=$DEFAULT_PROJECT
    env_set COMPOSE_PROJECT_NAME "$PROJECT" "$ROOT_ENV"
  fi
  export COMPOSE_PROJECT_NAME=$PROJECT
}

compose() { (cd "$ROOT_DIR" && docker compose "$@"); }

configured() {
  [[ -f $BACKEND_ENV ]] || return 1
  local hash
  hash=$(env_get ADMIN_PASSWORD_HASH "$BACKEND_ENV")
  [[ -n $(env_get ADMIN_USERNAME "$BACKEND_ENV") && -n $hash && $hash != *PASTE_YOUR* \
     && -n $(env_get KAGE_API_KEY "$BACKEND_ENV") && $(env_get KAGE_API_KEY "$BACKEND_ENV") != change-me \
     && -n $(env_get SESSION_SECRET "$BACKEND_ENV") ]]
}

# --- Setup ---------------------------------------------------------------------------

# Hash a password with bcrypt using the backend image (the password is read
# from stdin, so it never appears in a process list or shell history).
bcrypt_hash() {
  local password=$1 image="${PROJECT}-backend"
  info "Preparing the backend image to hash the password (first run takes a minute)..." >&2
  docker build -q -t "$image" "$ROOT_DIR/backend" >/dev/null || die "Failed to build the backend image."
  printf '%s' "$password" | docker run --rm -i "$image" python -c \
    'import sys, bcrypt; print(bcrypt.hashpw(sys.stdin.buffer.read(), bcrypt.gensalt(rounds=12)).decode())'
}

setup() {
  local fresh=1
  [[ -f $BACKEND_ENV ]] && fresh=0

  printf '\n%s\n' "${BOLD}Kage Protocol setup${RESET}"
  printf '%s\n\n' "${DIM}Press Enter to accept the value in [brackets].${RESET}"

  # Defaults: current settings when reconfiguring, sensible values otherwise.
  local cur_user cur_public cur_bport cur_fport cur_api_url cur_dash_host
  cur_user=$(env_get ADMIN_USERNAME "$BACKEND_ENV")
  cur_public=$(env_get PUBLIC_HOST "$BACKEND_ENV")
  cur_bport=$(env_get KAGE_BACKEND_PORT "$ROOT_ENV")
  cur_fport=$(env_get KAGE_FRONTEND_PORT "$ROOT_ENV")
  cur_api_url=$(env_get KAGE_PUBLIC_API_URL "$ROOT_ENV")
  cur_dash_host=$(sed -E 's#^https?://([^:/]+).*#\1#' <<<"${cur_api_url:-}")

  # Admin account.
  printf '%s\n' "${BOLD}Admin account${RESET}"
  local username password password2 hash=""
  while :; do
    ask username "Admin username" "${cur_user:-admin}"
    [[ $username =~ ^[A-Za-z0-9._-]{1,64}$ ]] && break
    warn "Use 1–64 letters, digits, dots, dashes or underscores."
  done
  while :; do
    if (( fresh )); then
      ask_secret password "Admin password (min 8 characters)"
    else
      ask_secret password "New admin password (leave blank to keep the current one)"
      [[ -z $password ]] && { hash=$(env_get ADMIN_PASSWORD_HASH "$BACKEND_ENV"); break; }
    fi
    if (( ${#password} < 8 )); then warn "Too short — use at least 8 characters."; continue; fi
    ask_secret password2 "Confirm password"
    [[ $password == "$password2" ]] && break
    warn "Passwords don't match — try again."
  done

  # Network.
  printf '\n%s\n' "${BOLD}Network${RESET}"
  local dash_host public_host bport fport
  ask dash_host "Hostname or IP you'll open the dashboard from" "${cur_dash_host:-localhost}"
  ask public_host "Hostname or IP players use to reach challenges" "${cur_public:-$dash_host}"
  while :; do
    ask bport "Backend API port" "${cur_bport:-8081}"
    valid_port "$bport" || { warn "Enter a port from 1024 to 65535."; continue; }
    if port_in_use "$bport" && ! port_owned_by_us "$bport"; then warn "Port $bport is already in use by another program."; continue; fi
    break
  done
  while :; do
    ask fport "Dashboard port" "${cur_fport:-8082}"
    valid_port "$fport" || { warn "Enter a port from 1024 to 65535."; continue; }
    [[ $fport != "$bport" ]] || { warn "The dashboard needs a different port than the API."; continue; }
    if port_in_use "$fport" && ! port_owned_by_us "$fport"; then warn "Port $fport is already in use by another program."; continue; fi
    break
  done

  # Secrets: keep existing ones when reconfiguring, unless asked to rotate.
  printf '\n%s\n' "${BOLD}Secrets${RESET}"
  local api_key session_secret new_api_key=0
  api_key=$(env_get KAGE_API_KEY "$BACKEND_ENV")
  session_secret=$(env_get SESSION_SECRET "$BACKEND_ENV")
  if [[ -z $api_key || $api_key == change-me ]]; then
    api_key=$(random_hex); new_api_key=1
    ok "Generated a new platform API key."
  elif confirm "Generate a new platform API key? (CTF platforms using the old one will stop working)" n; then
    api_key=$(random_hex); new_api_key=1
    ok "Generated a new platform API key."
  else
    ok "Keeping the existing platform API key."
  fi
  if [[ -z $session_secret || $session_secret == change-me-please ]]; then
    session_secret=$(random_hex)
    ok "Generated a session signing secret."
  fi

  [[ -n $hash ]] || hash=$(bcrypt_hash "$password")
  [[ $hash == \$2* ]] || die "Password hashing failed."
  unset password password2

  # Write backend/.env (backing up any existing file first).
  if [[ -f $BACKEND_ENV ]]; then
    cp -p "$BACKEND_ENV" "$BACKEND_ENV.bak.$(date +%Y%m%d-%H%M%S)"
    ok "Backed up the previous backend/.env."
  else
    cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV"
  fi
  chmod 600 "$BACKEND_ENV"

  local cors="http://${dash_host}:${fport}"
  [[ $cors == "http://localhost:3000" ]] || cors="$cors,http://localhost:3000"  # keep npm run dev working

  env_set ADMIN_USERNAME "$username" "$BACKEND_ENV"
  # Single-quoted: Docker Compose would otherwise expand the $ segments of the hash.
  env_set ADMIN_PASSWORD_HASH "'$hash'" "$BACKEND_ENV"
  env_set KAGE_API_KEY "$api_key" "$BACKEND_ENV"
  env_set SESSION_SECRET "$session_secret" "$BACKEND_ENV"
  env_set PUBLIC_HOST "$public_host" "$BACKEND_ENV"
  env_set CORS_ORIGINS "$cors" "$BACKEND_ENV"

  env_set KAGE_BACKEND_PORT "$bport" "$ROOT_ENV"
  env_set KAGE_FRONTEND_PORT "$fport" "$ROOT_ENV"
  env_set KAGE_PUBLIC_API_URL "http://${dash_host}:${bport}" "$ROOT_ENV"

  ok "Saved settings to backend/.env and .env."

  if (( new_api_key )); then
    printf '\n  %s\n  %s\n  %s\n' \
      "${BOLD}Platform API key${RESET} (CTFd, TryHackMe, curl… send it as the X-Kage-Key header):" \
      "${YELLOW}${api_key}${RESET}" \
      "${DIM}It's stored in backend/.env if you need it again.${RESET}"
  fi
}

# --- Start / wait --------------------------------------------------------------------

wait_for() {
  local name=$1 url=$2 seconds=${3:-120} i
  command -v curl >/dev/null 2>&1 || { warn "curl not found — skipping the $name readiness check."; return 0; }
  for ((i = 0; i < seconds; i += 2)); do
    curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null && { ok "$name is up."; return 0; }
    sleep 2
  done
  warn "$name didn't respond at $url within ${seconds}s. Check: ./run.sh logs"
  return 1
}

start() {
  info "Building and starting Kage (project: $PROJECT)..."
  compose up -d --build --remove-orphans

  local bport fport api_url dash_host healthy=1
  bport=$(env_get KAGE_BACKEND_PORT "$ROOT_ENV"); bport=${bport:-8081}
  fport=$(env_get KAGE_FRONTEND_PORT "$ROOT_ENV"); fport=${fport:-8082}
  api_url=$(env_get KAGE_PUBLIC_API_URL "$ROOT_ENV"); api_url=${api_url:-http://localhost:$bport}
  dash_host=$(sed -E 's#^https?://([^:/]+).*#\1#' <<<"$api_url")

  wait_for "Backend API" "http://127.0.0.1:${bport}/api/health" || healthy=0
  wait_for "Dashboard" "http://127.0.0.1:${fport}/login" || healthy=0

  printf '\n%s\n' "${BOLD}Kage Protocol is $([[ $healthy == 1 ]] && echo running || echo starting — see warnings above)${RESET}"
  printf '  %-12s %s\n' "Dashboard" "${GREEN}http://${dash_host}:${fport}${RESET}"
  printf '  %-12s %s\n' "API" "${api_url}"
  printf '  %-12s %s\n' "Admin user" "$(env_get ADMIN_USERNAME "$BACKEND_ENV")"
  printf '\n  %s\n' "${DIM}Stop: ./run.sh stop · Logs: ./run.sh logs · Change settings: ./run.sh setup${RESET}"
}

# --- Main -------------------------------------------------------------------------------

main() {
  local cmd=${1:-start}
  case $cmd in
    -h | --help | help) usage; return 0 ;;
  esac

  preflight
  ensure_root_env

  case $cmd in
    start)
      if ! configured; then
        [[ -f $BACKEND_ENV ]] && warn "backend/.env is incomplete — let's finish setting it up."
        setup
      fi
      start
      ;;
    setup | --setup) setup; start ;;
    stop) info "Stopping Kage (data is kept)..."; compose down; ok "Stopped." ;;
    status) compose ps ;;
    logs) shift; compose logs -f --tail=100 "$@" ;;
    *) usage; die "Unknown command: $cmd" ;;
  esac
}

main "$@"
