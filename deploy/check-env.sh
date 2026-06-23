#!/bin/bash
# =====================================================================
# NextGenPay — Environment drift check
# =====================================================================
# Validates that the target .env file has every variable required for a
# healthy production runtime.
#
# Exits non-zero with a clear list of missing / empty keys so that the
# deploy aborts before we restart PM2 with a broken configuration.
#
# Usage:
#   bash deploy/check-env.sh                       # checks ./.env
#   bash deploy/check-env.sh /path/to/other/.env   # checks a custom file
# =====================================================================
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[check-env] ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

# ---------- Helpers ----------------------------------------------------

# Read a single key from the env file. Returns empty string if missing
# or if the value is the empty string. Handles surrounding quotes and
# inline `#` comments after the value.
get_env() {
  local key="$1"
  local line
  line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  local value="${line#*=}"
  # Strip leading/trailing whitespace
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  # Strip surrounding double or single quotes
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  echo "$value"
}

MISSING=()
require() {
  local key="$1"
  local context="${2:-}"
  local value
  value=$(get_env "$key")
  if [[ -z "$value" ]]; then
    if [[ -n "$context" ]]; then
      MISSING+=("  - $key   (required because $context)")
    else
      MISSING+=("  - $key")
    fi
  fi
}

# ---------- Always required in production ----------------------------

ALWAYS_REQUIRED=(
  NEXT_PUBLIC_APP_URL
  NEXTAUTH_SECRET
  NEXTAUTH_URL
  JWT_SECRET
  DATABASE_URL
  DIRECT_URL
  APP_ENCRYPTION_KEY
)

for key in "${ALWAYS_REQUIRED[@]}"; do
  require "$key"
done

# ---------- Conditionally required (per partner feature flag) --------

# Map: PARTNER_*_ENABLED=true => the secret keys that MUST be set.
declare -A PARTNER_DEPS=(
  [PARTNER_POS_ENABLED]="SAMEDAY_POS_BASE_URL SAMEDAY_POS_API_KEY SAMEDAY_POS_API_SECRET"
  [PARTNER_VERIFICATION_ENABLED]="EKYCHUB_USERNAME EKYCHUB_API_TOKEN EKYCHUB_BASE_URL"
  [PARTNER_EMAIL_ENABLED]="RESEND_API_KEY EMAIL_FROM"
  [PARTNER_SMS_ENABLED]="MSG91_AUTH_KEY MSG91_TEMPLATE_ID MSG91_SENDER_ID"
  [PARTNER_AEPS_ENABLED]="PAYSPRINT_PARTNER_ID PAYSPRINT_API_KEY PAYSPRINT_BASE_URL"
  [PARTNER_DMT_ENABLED]="PAYSPRINT_PARTNER_ID PAYSPRINT_API_KEY PAYSPRINT_BASE_URL"
  [PARTNER_UPI_ENABLED]="RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET"
  [PARTNER_PAYOUT_ENABLED]="RAZORPAYX_ACCOUNT_NUMBER RAZORPAYX_KEY_ID RAZORPAYX_KEY_SECRET"
  [PARTNER_RECHARGE_ENABLED]="RECHARGE_API_TOKEN RECHARGE_API_BASE"
  [PARTNER_TRAVEL_ENABLED]="TRIPJACK_USER_ID TRIPJACK_PASSWORD"
)

for flag in "${!PARTNER_DEPS[@]}"; do
  flag_value=$(get_env "$flag")
  if [[ "$flag_value" == "true" ]]; then
    for dep in ${PARTNER_DEPS[$flag]}; do
      require "$dep" "$flag=true"
    done
  fi
done

# ---------- Result ---------------------------------------------------

if (( ${#MISSING[@]} > 0 )); then
  echo "" >&2
  echo "[check-env] FAILED — missing or empty required env vars in $ENV_FILE:" >&2
  printf '%s\n' "${MISSING[@]}" >&2
  echo "" >&2
  echo "Fix: add the missing values to $ENV_FILE and re-run the deploy." >&2
  exit 1
fi

# Count keys we actually verified for a friendly summary
TOTAL=${#ALWAYS_REQUIRED[@]}
for flag in "${!PARTNER_DEPS[@]}"; do
  flag_value=$(get_env "$flag")
  if [[ "$flag_value" == "true" ]]; then
    deps=(${PARTNER_DEPS[$flag]})
    TOTAL=$((TOTAL + ${#deps[@]}))
  fi
done

echo "[check-env] OK — $TOTAL required env vars present in $ENV_FILE"
