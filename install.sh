#!/usr/bin/env bash
# =========================================================================
# Sealog-server installer
#
# Installs sealog-server, Node.js and MongoDB on a fresh server and
# registers sealog-server as a systemd service.
#
# Supported distributions:
#   - AlmaLinux / Rocky Linux / RHEL 9, 10
#   - Debian 12 (bookworm), 13 (trixie)
#   - Ubuntu 24.04 (noble), 26.04 (resolute)
#
# Quick start:
#   curl -fsSL https://raw.githubusercontent.com/OceanDataTools/sealog-server/2.x/install.sh -o install.sh
#   sudo bash install.sh
#
# Run `sudo bash install.sh --help` for all options. Safe to re-run: an
# existing checkout is updated in place and existing config/*.js and .env
# files are never overwritten.
# =========================================================================

set -Eeuo pipefail

# ---- Defaults (override with command-line options) ----------------------
INSTALL_DIR=/opt/sealog-server
SEALOG_USER=sealog
REPO_URL=https://github.com/OceanDataTools/sealog-server.git
GIT_REF=2.x
SERVER_PORT=8000
FILES_DIR=
NODE_MAJOR=24
MONGODB_VERSION=8.0
MONGO_URL=
NODE_ENV_MODE=production
WITH_PYTHON=0
OPEN_FIREWALL=0
ASSUME_YES=0

SERVICE_NAME=sealog-server
# --env-file-if-exists (used by `npm start` and the service) needs >= 22.9
MIN_NODE_VERSION=22.9.0

# ---- Output helpers -----------------------------------------------------
if [[ -t 1 ]]; then
  C_BLUE=$'\e[1;34m'; C_YELLOW=$'\e[1;33m'; C_RED=$'\e[1;31m'; C_GREEN=$'\e[1;32m'; C_OFF=$'\e[0m'
else
  C_BLUE=; C_YELLOW=; C_RED=; C_GREEN=; C_OFF=
fi

step() { echo; echo "${C_BLUE}==>${C_OFF} $*"; }
info() { echo "    $*"; }
warn() { echo "${C_YELLOW}WARNING:${C_OFF} $*" >&2; }
die()  { echo "${C_RED}ERROR:${C_OFF} $*" >&2; exit 1; }

trap 'die "Command failed (line $LINENO): $BASH_COMMAND"' ERR

usage() {
  cat <<EOF
Usage: sudo bash $0 [options]

Installs sealog-server with Node.js and MongoDB, and runs it as the
'${SERVICE_NAME}' systemd service.

Options:
  --install-dir DIR       Installation directory (default: ${INSTALL_DIR})
  --user USER             System user that runs the server (default: ${SEALOG_USER})
  --ref REF               Git branch or tag to install (default: ${GIT_REF})
  --repo URL              Git repository URL (default: ${REPO_URL})
  --port PORT             Port the API listens on (default: ${SERVER_PORT})
  --files-dir DIR         Root directory for uploaded files
                          (default: <install-dir>/sealog-files)
  --node-major N          Node.js major version from NodeSource (default: ${NODE_MAJOR})
  --mongodb-version V     MongoDB release series (default: ${MONGODB_VERSION})
  --mongo-url URL         Use an existing MongoDB instead of installing one locally,
                          e.g. mongodb://db.example.org:27017/sealogDB
  --mode MODE             production | demo-vehicle | demo-vessel (default: ${NODE_ENV_MODE})
                          The demo modes preload sample cruises, lowerings and events.
  --with-python           Also set up the Python venv used by the misc/ scripts
  --open-firewall         Open the API port in firewalld/ufw if either is active
  -y, --yes               Do not ask for confirmation
  -h, --help              Show this help
EOF
}

# ---- Parse arguments ----------------------------------------------------
need_arg() { [[ $# -ge 2 && -n "$2" ]] || die "Option $1 requires a value"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)     need_arg "$@"; INSTALL_DIR=$2; shift 2 ;;
    --user)            need_arg "$@"; SEALOG_USER=$2; shift 2 ;;
    --ref)             need_arg "$@"; GIT_REF=$2; shift 2 ;;
    --repo)            need_arg "$@"; REPO_URL=$2; shift 2 ;;
    --port)            need_arg "$@"; SERVER_PORT=$2; shift 2 ;;
    --files-dir)       need_arg "$@"; FILES_DIR=$2; shift 2 ;;
    --node-major)      need_arg "$@"; NODE_MAJOR=$2; shift 2 ;;
    --mongodb-version) need_arg "$@"; MONGODB_VERSION=$2; shift 2 ;;
    --mongo-url)       need_arg "$@"; MONGO_URL=$2; shift 2 ;;
    --mode)            need_arg "$@"; NODE_ENV_MODE=$2; shift 2 ;;
    --with-python)     WITH_PYTHON=1; shift ;;
    --open-firewall)   OPEN_FIREWALL=1; shift ;;
    -y|--yes)          ASSUME_YES=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *)                 usage >&2; die "Unknown option: $1" ;;
  esac
done

INSTALL_DIR=${INSTALL_DIR%/}
FILES_DIR=${FILES_DIR:-${INSTALL_DIR}/sealog-files}

[[ "$SERVER_PORT" =~ ^[0-9]+$ ]] && (( SERVER_PORT >= 1 && SERVER_PORT <= 65535 )) \
  || die "Invalid port: ${SERVER_PORT}"
[[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || die "Invalid Node.js major version: ${NODE_MAJOR}"
[[ "$MONGODB_VERSION" =~ ^[0-9]+\.[0-9]+$ ]] || die "Invalid MongoDB version: ${MONGODB_VERSION} (expected e.g. 8.0)"
[[ "$INSTALL_DIR" == /* && "$FILES_DIR" == /* ]] || die "--install-dir and --files-dir must be absolute paths"
case "$NODE_ENV_MODE" in
  production|demo-vehicle|demo-vessel) ;;
  *) die "Invalid --mode: ${NODE_ENV_MODE}" ;;
esac

[[ $EUID -eq 0 ]] || die "This script must be run as root (try: sudo bash $0)"

# ---- Detect platform ----------------------------------------------------
[[ -r /etc/os-release ]] || die "Cannot read /etc/os-release; unsupported system"
# shellcheck disable=SC1091
. /etc/os-release
OS_ID=${ID:-unknown}
OS_VERSION=${VERSION_ID:-}
OS_MAJOR=${OS_VERSION%%.*}
ARCH=$(uname -m)

# MONGO_REPO_* describe which MongoDB repository to use. MongoDB publishes
# server packages late for new distro releases, so Debian 13 and Ubuntu
# 26.04 use the previous release's packages, whose dependencies they
# satisfy (libssl3t64/libcurl4t64 provide libssl3/libcurl4).
case "$OS_ID" in
  ubuntu)
    PKG=apt
    case "$OS_VERSION" in
      24.04|26.04) MONGO_REPO_CODENAME=noble ;;
      *) die "Unsupported Ubuntu release ${OS_VERSION} (supported: 24.04, 26.04)" ;;
    esac
    MONGO_REPO_DISTRO=ubuntu
    MONGO_REPO_COMPONENT=multiverse
    ;;
  debian)
    PKG=apt
    case "$OS_MAJOR" in
      12|13) MONGO_REPO_CODENAME=bookworm ;;
      *) die "Unsupported Debian release ${OS_VERSION} (supported: 12, 13)" ;;
    esac
    MONGO_REPO_DISTRO=debian
    MONGO_REPO_COMPONENT=main
    ;;
  almalinux|rocky|rhel)
    PKG=dnf
    case "$OS_MAJOR" in
      9|10) ;;
      *) die "Unsupported ${NAME:-$OS_ID} release ${OS_VERSION} (supported: 9, 10)" ;;
    esac
    ;;
  *)
    die "Unsupported distribution '${OS_ID}'. Supported: AlmaLinux, Rocky Linux, RHEL 9/10, Debian 12/13, Ubuntu 24.04/26.04"
    ;;
esac

case "$ARCH" in
  x86_64|aarch64) ;;
  *) die "Unsupported CPU architecture: ${ARCH} (supported: x86_64, aarch64)" ;;
esac

INSTALL_MONGODB=1
[[ -n "$MONGO_URL" ]] && INSTALL_MONGODB=0

if (( INSTALL_MONGODB )); then
  if [[ "$OS_ID" == debian && "$ARCH" == aarch64 ]]; then
    die "MongoDB does not publish Debian packages for ${ARCH}. Use Ubuntu, or point at an existing database with --mongo-url."
  fi
  # MongoDB >= 5.0 on x86_64 requires AVX; it is often masked by VM CPU models.
  if [[ "$ARCH" == x86_64 ]] && ! grep -qw avx /proc/cpuinfo; then
    die "This CPU does not advertise AVX, which MongoDB ${MONGODB_VERSION} requires on x86_64. If this is a VM, expose the host CPU model (e.g. 'host' / 'host-passthrough'), or use --mongo-url to point at an existing database."
  fi
fi

# systemd may be absent in containers; install everything but skip service management.
HAVE_SYSTEMD=0
[[ -d /run/systemd/system ]] && HAVE_SYSTEMD=1

# ---- Confirm ------------------------------------------------------------
cat <<EOF

Sealog-server will be installed with these settings:

  Distribution:      ${PRETTY_NAME:-$OS_ID $OS_VERSION} (${ARCH})
  Install directory: ${INSTALL_DIR}
  Files directory:   ${FILES_DIR}
  Service user:      ${SEALOG_USER}
  Git repo / ref:    ${REPO_URL} @ ${GIT_REF}
  API port:          ${SERVER_PORT}
  Mode (NODE_ENV):   ${NODE_ENV_MODE}
  Node.js:           ${NODE_MAJOR}.x (NodeSource), unless >= ${MIN_NODE_VERSION} is already installed
  MongoDB:           $( (( INSTALL_MONGODB )) && echo "${MONGODB_VERSION} (installed locally)" || echo "existing database at ${MONGO_URL}")
  Python venv:       $( (( WITH_PYTHON )) && echo yes || echo no)
EOF

if (( ! ASSUME_YES )); then
  if [[ -t 0 ]]; then
    read -r -p $'\nProceed? [y/N] ' reply
  elif [[ -r /dev/tty ]]; then
    read -r -p $'\nProceed? [y/N] ' reply </dev/tty
  else
    die "No terminal available for confirmation; re-run with --yes"
  fi
  [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]] || { echo "Aborted."; exit 1; }
fi

# ---- Helpers ------------------------------------------------------------
apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "$@"
}

pkg_install() {
  if [[ $PKG == apt ]]; then apt_install "$@"; else dnf install -y -q "$@"; fi
}

version_ge() {  # version_ge A B  ->  true if A >= B
  [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]
}

wait_for_mongod() {
  local _
  for _ in $(seq 1 30); do
    mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1 && return 0
    systemctl -q is-failed mongod && return 1
    sleep 2
  done
  return 1
}

git_in_repo() {
  git -c safe.directory="$INSTALL_DIR" -C "$INSTALL_DIR" "$@"
}

# set_env FILE KEY VALUE: set KEY=VALUE in a dotenv file, replacing an
# existing (possibly commented-out) assignment or appending one.
set_env() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp)
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0; pat = "^#?[[:space:]]*" key "=" }
    !done && $0 ~ pat { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# get_env FILE KEY: print the value of an uncommented KEY in a dotenv file
get_env() {
  sed -n "s/^$2=//p" "$1" | tail -n1
}

# ---- 1. Base packages ---------------------------------------------------
step "Installing base packages"
PYTHON_BIN=python3
if [[ $PKG == apt ]]; then
  DEBIAN_FRONTEND=noninteractive apt-get update -q
  apt_install ca-certificates curl gnupg git
  (( WITH_PYTHON )) && apt_install python3 python3-venv python3-pip
else
  # curl-minimal is preinstalled on EL9/10 and conflicts with the curl package
  command -v curl >/dev/null || pkg_install curl
  pkg_install ca-certificates git tar
  if (( WITH_PYTHON )); then
    # requirements.txt needs Python >= 3.10; EL9's default python3 is 3.9
    if [[ "$OS_MAJOR" == 9 ]]; then
      PYTHON_BIN=python3.12
      pkg_install python3.12 python3.12-pip
    else
      pkg_install python3 python3-pip
    fi
  fi
fi

# ---- 2. Node.js ---------------------------------------------------------
step "Installing Node.js"
NODE_BIN=$(command -v node || true)
CURRENT_NODE=
[[ -n "$NODE_BIN" ]] && CURRENT_NODE=$("$NODE_BIN" -p 'process.versions.node' 2>/dev/null || true)

if [[ -n "$CURRENT_NODE" ]] && version_ge "$CURRENT_NODE" "$MIN_NODE_VERSION"; then
  info "Node.js ${CURRENT_NODE} already installed at ${NODE_BIN}; keeping it"
else
  [[ -n "$CURRENT_NODE" ]] && info "Node.js ${CURRENT_NODE} is too old (need >= ${MIN_NODE_VERSION}); upgrading"
  if [[ $PKG == apt ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  fi
  pkg_install nodejs
  hash -r
  NODE_BIN=$(command -v node) || die "Node.js installation failed"
fi
NPM_BIN=$(command -v npm) || die "npm not found after installing Node.js"
info "Using Node.js $("$NODE_BIN" -v), npm $("$NPM_BIN" -v)"

# ---- 3. MongoDB ---------------------------------------------------------
if (( INSTALL_MONGODB )); then
  step "Installing MongoDB ${MONGODB_VERSION}"
  if [[ $PKG == apt ]]; then
    keyring=/usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg
    curl -fsSL "https://pgp.mongodb.com/server-${MONGODB_VERSION}.asc" | gpg --batch --yes --dearmor -o "$keyring"
    case "$ARCH" in x86_64) deb_arch=amd64 ;; aarch64) deb_arch=arm64 ;; esac
    echo "deb [ arch=${deb_arch} signed-by=${keyring} ] https://repo.mongodb.org/apt/${MONGO_REPO_DISTRO} ${MONGO_REPO_CODENAME}/mongodb-org/${MONGODB_VERSION} ${MONGO_REPO_COMPONENT}" \
      > "/etc/apt/sources.list.d/mongodb-org-${MONGODB_VERSION}.list"
    DEBIAN_FRONTEND=noninteractive apt-get update -q
    apt_install mongodb-org
  else
    cat > "/etc/yum.repos.d/mongodb-org-${MONGODB_VERSION}.repo" <<EOF
[mongodb-org-${MONGODB_VERSION}]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/${OS_MAJOR}/mongodb-org/${MONGODB_VERSION}/\$basearch/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-${MONGODB_VERSION}.asc
EOF
    pkg_install mongodb-org
  fi

  if (( HAVE_SYSTEMD )); then
    systemctl enable --now mongod
    info "Waiting for MongoDB to accept connections..."
    if ! wait_for_mongod; then
      # The packaged mongod.service sets GLIBC_TUNABLES=glibc.pthread.rseq=0,
      # which makes MongoDB 8.x refuse to start on Linux >= 6.19 (e.g.
      # Ubuntu 26.04), see https://jira.mongodb.org/browse/SERVER-121912.
      # Leaving glibc's rseq enabled lets it start, with reduced tcmalloc
      # performance. Only applied when that specific failure is detected.
      if journalctl -u mongod --no-pager 2>/dev/null | grep -q 'Linux kernel versions 6.19 and newer'; then
        warn "MongoDB refused to start on kernel $(uname -r) (SERVER-121912); re-enabling glibc rseq for mongod"
        mkdir -p /etc/systemd/system/mongod.service.d
        cat > /etc/systemd/system/mongod.service.d/sealog-kernel-rseq.conf <<EOF
# Added by the sealog-server installer: MongoDB refuses to start on Linux
# >= 6.19 with glibc rseq disabled (https://jira.mongodb.org/browse/SERVER-121912).
# Remove this file once MongoDB or the kernel no longer needs it.
[Service]
UnsetEnvironment=GLIBC_TUNABLES
EOF
        systemctl daemon-reload
        systemctl reset-failed mongod
        systemctl restart mongod
        wait_for_mongod || die "MongoDB did not start; check 'journalctl -u mongod'"
      else
        die "MongoDB did not start; check 'journalctl -u mongod'"
      fi
    fi
    info "MongoDB is running"
  else
    warn "systemd is not running; MongoDB was installed but not started"
  fi
else
  step "Skipping MongoDB installation; using ${MONGO_URL}"
fi

# ---- 4. Service user ----------------------------------------------------
step "Creating service user '${SEALOG_USER}'"
if id -u "$SEALOG_USER" >/dev/null 2>&1; then
  info "User already exists"
else
  useradd --system --user-group --home-dir "$INSTALL_DIR" --no-create-home \
    --shell /usr/sbin/nologin --comment "Sealog server" "$SEALOG_USER"
fi
SEALOG_GROUP=$(id -gn "$SEALOG_USER")

# ---- 5. Source code -----------------------------------------------------
step "Fetching sealog-server (${GIT_REF})"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing checkout found; updating"
  git_in_repo fetch --tags --prune origin
  git_in_repo checkout "$GIT_REF"
  # Fast-forward when GIT_REF is a branch; a tag leaves a detached HEAD
  if git_in_repo symbolic-ref -q HEAD >/dev/null; then
    git_in_repo merge --ff-only "origin/${GIT_REF}"
  fi
elif [[ -e "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
  die "${INSTALL_DIR} exists, is not empty and is not a git checkout; choose another --install-dir"
else
  git clone --branch "$GIT_REF" "$REPO_URL" "$INSTALL_DIR"
fi
info "Checked out $(git_in_repo describe --tags --always)"

# ---- 6. Configuration ---------------------------------------------------
step "Creating configuration files"
for dist in "$INSTALL_DIR"/config/*.js.dist; do
  target=${dist%.dist}
  if [[ -e "$target" ]]; then
    info "Keeping existing config/$(basename "$target")"
  else
    cp "$dist" "$target"
    info "Created config/$(basename "$target")"
  fi
done

ENV_FILE=$INSTALL_DIR/.env
if [[ -e "$ENV_FILE" ]]; then
  info "Keeping existing .env"
else
  cp "$INSTALL_DIR/.env.dist" "$ENV_FILE"
  set_env "$ENV_FILE" SEALOG_SERVER_PORT "$SERVER_PORT"
  set_env "$ENV_FILE" NODE_ENV "$NODE_ENV_MODE"
  set_env "$ENV_FILE" SEALOG_SERVER_FILEPATH_ROOT "$FILES_DIR"
  [[ -n "$MONGO_URL" ]] && set_env "$ENV_FILE" MONGO_URL "$MONGO_URL"
  info "Created .env"
fi

if [[ -z "$(get_env "$ENV_FILE" SEALOG_SERVER_SECRET)" ]]; then
  secret=$("$NODE_BIN" -e "console.log(require('crypto').randomBytes(256).toString('base64'))")
  set_env "$ENV_FILE" SEALOG_SERVER_SECRET "$secret"
  unset secret
  info "Generated JWT secret (SEALOG_SERVER_SECRET)"
fi
chown "$SEALOG_USER:$SEALOG_GROUP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# The running server reads its settings from .env, so report those.
SERVER_PORT=$(get_env "$ENV_FILE" SEALOG_SERVER_PORT)
SERVER_PORT=${SERVER_PORT:-8000}
FILES_DIR=$(get_env "$ENV_FILE" SEALOG_SERVER_FILEPATH_ROOT)
FILES_DIR=${FILES_DIR:-$INSTALL_DIR/sealog-files}
NODE_ENV_MODE=$(get_env "$ENV_FILE" NODE_ENV)

# ---- 7. Node modules ----------------------------------------------------
step "Installing Node.js dependencies"
# --ignore-scripts skips the 'prepare' (husky) hook, a dev-only tool that
# is not installed with --omit=dev. No runtime dependency needs install scripts.
npm_cache=$(mktemp -d)
(cd "$INSTALL_DIR" && "$NPM_BIN" ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$npm_cache")
rm -rf "$npm_cache"

# ---- 8. Python environment (optional) -----------------------------------
if (( WITH_PYTHON )); then
  step "Setting up Python virtual environment"
  [[ -d "$INSTALL_DIR/venv" ]] || "$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
  "$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
  "$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"

  py_settings=$INSTALL_DIR/misc/python_sealog/settings.py
  if [[ -e "$py_settings" ]]; then
    info "Keeping existing misc/python_sealog/settings.py"
  else
    sed -e "s|localhost:8000|localhost:${SERVER_PORT}|g" \
        -e "s|^API_SERVER_FILE_PATH = .*|API_SERVER_FILE_PATH = '${FILES_DIR}'|" \
        "${py_settings}.dist" > "$py_settings"
    info "Created misc/python_sealog/settings.py (set TOKEN to a sealog JWT before using the scripts)"
  fi
fi

# ---- 9. File storage & ownership ----------------------------------------
step "Preparing file storage at ${FILES_DIR}"
mkdir -p "$FILES_DIR"/{images,cruises,lowerings}
chown -R "$SEALOG_USER:$SEALOG_GROUP" "$INSTALL_DIR" "$FILES_DIR"

# ---- 10. systemd service ------------------------------------------------
step "Installing systemd service '${SERVICE_NAME}'"
mongo_deps=
(( INSTALL_MONGODB )) && mongo_deps=" mongod.service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Sealog event-logging server
Documentation=https://github.com/OceanDataTools/sealog-server
After=network-online.target${mongo_deps}
Wants=network-online.target${mongo_deps}

[Service]
Type=simple
User=${SEALOG_USER}
Group=${SEALOG_GROUP}
WorkingDirectory=${INSTALL_DIR}
# Settings (including NODE_ENV) are read from ${INSTALL_DIR}/.env
ExecStart=${NODE_BIN} --env-file-if-exists=.env server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

SERVICE_OK=0
if (( HAVE_SYSTEMD )); then
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
  systemctl restart "$SERVICE_NAME"

  info "Waiting for sealog-server to respond on port ${SERVER_PORT}..."
  for _ in $(seq 1 30); do
    if curl -fsk -o /dev/null "http://127.0.0.1:${SERVER_PORT}/sealog-server" \
      || curl -fsk -o /dev/null "https://127.0.0.1:${SERVER_PORT}/sealog-server"; then
      SERVICE_OK=1
      break
    fi
    sleep 2
  done
  (( SERVICE_OK )) || warn "sealog-server did not respond yet; check 'journalctl -u ${SERVICE_NAME}'"
else
  warn "systemd is not running; the service was installed but not started"
fi

# ---- 11. Firewall -------------------------------------------------------
FIREWALL_NOTE=
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  if (( OPEN_FIREWALL )); then
    step "Opening port ${SERVER_PORT}/tcp in firewalld"
    firewall-cmd --quiet --permanent --add-port="${SERVER_PORT}/tcp"
    firewall-cmd --quiet --reload
  else
    FIREWALL_NOTE="firewalld is active; to allow remote access run: firewall-cmd --permanent --add-port=${SERVER_PORT}/tcp && firewall-cmd --reload"
  fi
elif command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  if (( OPEN_FIREWALL )); then
    step "Opening port ${SERVER_PORT}/tcp in ufw"
    ufw allow "${SERVER_PORT}/tcp"
  else
    FIREWALL_NOTE="ufw is active; to allow remote access run: ufw allow ${SERVER_PORT}/tcp"
  fi
fi

# ---- Summary ------------------------------------------------------------
host_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
host_ip=${host_ip:-<server-ip>}

echo
if (( SERVICE_OK )); then
  echo "${C_GREEN}sealog-server is installed and running.${C_OFF}"
else
  echo "${C_GREEN}sealog-server is installed.${C_OFF}"
fi
cat <<EOF

  API:            http://${host_ip}:${SERVER_PORT}/sealog-server
  API docs:       http://${host_ip}:${SERVER_PORT}/sealog-server/documentation
  Install dir:    ${INSTALL_DIR}
  Settings:       ${ENV_FILE}  (restart the service after editing)
  Uploaded files: ${FILES_DIR}

  Service:        systemctl status|restart ${SERVICE_NAME}
  Logs:           journalctl -u ${SERVICE_NAME} -f
EOF
if [[ "$NODE_ENV_MODE" == production ]]; then
  cat <<EOF

  When it starts against an empty database, sealog-server creates an
  'admin' account (password 'demo') and a 'guest' account (no password).
  Change both passwords immediately.
EOF
fi
if (( WITH_PYTHON )); then
  echo
  echo "  Python venv:    ${INSTALL_DIR}/venv (see INSTALL.md for the optional misc/ services)"
fi
if [[ -n "$FIREWALL_NOTE" ]]; then
  echo
  warn "$FIREWALL_NOTE"
fi
echo
