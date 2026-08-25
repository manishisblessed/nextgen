#!/bin/bash
set -euo pipefail

# ── NextGenPay — Production Deploy ────────────────────────────────────
# Usage:  ./deploy.sh
# Stores production .env at ~/env-nextgenpay (outside the repo) so
# git pull never clobbers secrets. Every deploy copies it in fresh.
# ──────────────────────────────────────────────────────────────────────

APP_DIR="/home/ubuntu/nextgenpay"
ENV_SOURCE="/home/ubuntu/env-nextgenpay"
# Use the REPO's ecosystem file (always current with the code) — it defines
# BOTH the web app and the background worker, so a deploy restarts both.
ECOSYSTEM="$APP_DIR/ecosystem.config.js"
LOG_DIR="/home/ubuntu/logs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step=0
total=7

log() { step=$((step+1)); echo -e "\n${CYAN}[${step}/${total}]${NC} ${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
fail() { echo -e "${RED}✖  $1${NC}"; exit 1; }

START=$(date +%s)

echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  NextGenPay — Production Deploy${NC}"
echo -e "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

# ── Pre-flight checks ────────────────────────────────────────────────

if [ ! -d "$APP_DIR/.git" ]; then
  fail "No git repo found at $APP_DIR"
fi

if [ ! -f "$ENV_SOURCE" ]; then
  fail "Production env file not found at $ENV_SOURCE\n   Create it once:  cp $APP_DIR/.env $ENV_SOURCE\n   Then edit $ENV_SOURCE with production values."
fi

mkdir -p "$LOG_DIR"

# ── Step 1: Pull latest code ─────────────────────────────────────────

log "Pulling latest code from origin/main..."
cd "$APP_DIR"
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  warn "Already up-to-date ($(git rev-parse --short HEAD)). Continuing anyway..."
else
  git reset --hard origin/main
  echo "  Updated: $(git rev-parse --short "$LOCAL") → $(git rev-parse --short HEAD)"
fi

# ── Step 2: Copy production .env ──────────────────────────────────────

log "Copying production .env..."
cp "$ENV_SOURCE" "$APP_DIR/.env"
echo "  Copied from $ENV_SOURCE"

# ── Guard: the database MUST be the Mumbai project (ap-south-1) ────────
# The Tokyo project (ap-northeast-1) was retired. If a deploy ever points
# production at it again, local (Mumbai) and prod writes split across two
# databases and data silently goes missing (schemes not showing, etc.).
# Fail hard here BEFORE migrations/build/restart. Emergency override:
#   ALLOW_TOKYO_DB=1 ./deploy.sh
db_url_line=$(grep -E '^[[:space:]]*DATABASE_URL=' "$APP_DIR/.env" | tail -n 1 || true)
if [ -z "$db_url_line" ]; then
  fail "DATABASE_URL is missing from $APP_DIR/.env — refusing to deploy."
fi
if echo "$db_url_line" | grep -q "ap-northeast-1"; then
  if [ "${ALLOW_TOKYO_DB:-0}" = "1" ]; then
    warn "DATABASE_URL points at the retired Tokyo project (ap-northeast-1) — continuing because ALLOW_TOKYO_DB=1."
  else
    fail "DATABASE_URL points at the retired Tokyo project (ap-northeast-1).\n   Production must use the Mumbai project (ap-south-1).\n   Fix $ENV_SOURCE, then redeploy. Override only if you REALLY mean it:\n     ALLOW_TOKYO_DB=1 ./deploy.sh"
  fi
elif echo "$db_url_line" | grep -q "ap-south-1"; then
  echo "  DB region OK: ap-south-1 (Mumbai)"
else
  warn "DATABASE_URL region is neither ap-south-1 nor ap-northeast-1 — double-check $ENV_SOURCE points at the intended database."
fi

# ── Step 3: Install dependencies ─────────────────────────────────────

log "Installing dependencies (npm ci)..."
npm ci --production=false 2>&1 | tail -3

# ── Step 4: Generate Prisma client ────────────────────────────────────

log "Generating Prisma client..."
npx prisma generate

# ── Step 5: Sync database schema ─────────────────────────────────────

log "Applying database migrations..."
npx prisma migrate deploy

# ── Step 6: Build ─────────────────────────────────────────────────────
# `next build` is memory-hungry. On a small instance it aborts with a V8
# OOM ("Aborted (core dumped)"). Because of `set -o pipefail` above, that
# failure kills this script BEFORE the PM2 restart (step 7), so PM2 keeps
# serving the OLD build and the deploy silently has no effect. Two guards:
#   1. Ensure some swap headroom so the kernel doesn't hard-OOM.
#   2. Raise Node's heap ceiling for the build.
# Both are best-effort and never abort the deploy on their own.

log "Building Next.js app..."

swap_mb=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}')
if [ "${swap_mb:-0}" -lt 2048 ]; then
  avail_gb=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')
  if [ -f /swapfile ]; then
    sudo swapon /swapfile 2>/dev/null || true
    echo "  Re-enabled existing /swapfile (swap now: $(free -m | awk '/^Swap:/ {print $2}')MB)"
  elif [ "${avail_gb:-0}" -ge 6 ]; then
    swap_size=4G
    if [ "${avail_gb:-0}" -lt 8 ]; then swap_size=2G; fi
    warn "Swap is ${swap_mb:-0}MB — creating a ${swap_size} swapfile at /swapfile..."
    if sudo fallocate -l "$swap_size" /swapfile && sudo chmod 600 /swapfile \
       && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile; then
      grep -q '^/swapfile ' /etc/fstab \
        || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
      echo "  Swap enabled: $(free -m | awk '/^Swap:/ {print $2}')MB"
    else
      warn "Could not create swapfile — build may OOM. Add swap or resize the instance."
    fi
  else
    warn "Low swap (${swap_mb:-0}MB) and only ${avail_gb:-?}G free disk — build may OOM. Free disk or resize the instance."
  fi
else
  echo "  Swap OK: ${swap_mb}MB"
fi

# Capture the build to a log and inspect the REAL exit code. Piping straight
# into `tail` (as before) let `pipefail` abort the script with no explanation,
# so failures looked like silent no-ops while PM2 kept the old build live.
BUILD_LOG="$LOG_DIR/build-$(date +%Y%m%d-%H%M%S).log"
set +e
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" npm run build >"$BUILD_LOG" 2>&1
build_rc=$?
set -e
tail -8 "$BUILD_LOG"
if [ "$build_rc" -ne 0 ]; then
  echo ""
  if grep -qiE 'out of memory|Aborted \(core dumped\)|JavaScript heap|Reached heap limit|Runtime_MapGrow' "$BUILD_LOG"; then
    fail "Build FAILED — OUT OF MEMORY.\n   The PREVIOUS build is STILL running; nothing new was deployed.\n   Add swap / free disk / resize the instance, then re-run this script:\n     free -h && df -h /\n     sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile\n     echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab\n   Full log: $BUILD_LOG"
  else
    fail "Build FAILED (exit $build_rc).\n   The PREVIOUS build is STILL running; nothing new was deployed.\n   Full log: $BUILD_LOG"
  fi
fi
echo "  Build OK — log: $BUILD_LOG"

# ── Step 7: Restart PM2 ──────────────────────────────────────────────

log "Restarting PM2 processes..."
# startOrRestart restarts every app defined in the ecosystem file (and starts
# any that aren't running yet). The worker loads TypeScript at boot via tsx —
# if it is not restarted here it keeps executing the OLD code from memory, so
# NEVER restart only the web app.
pm2 startOrRestart "$ECOSYSTEM" --update-env
# Belt-and-braces: fail loudly if the worker somehow didn't come back fresh.
pm2 restart nextgenpay-worker --update-env >/dev/null 2>&1 \
  || warn "nextgenpay-worker restart failed — check 'pm2 status' manually!"
pm2 save

echo ""
pm2 list

END=$(date +%s)
ELAPSED=$((END - START))

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete in ${ELAPSED}s${NC}"
echo -e "${GREEN}  Commit: $(git rev-parse --short HEAD)${NC}"
echo -e "${GREEN}  Run 'pm2 logs' to verify startup${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
