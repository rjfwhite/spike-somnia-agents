#!/bin/bash
# Generate committee secret keys, fund wallets, and store in Secret Manager.
# Replaces the old fund-committee.sh which required hardcoded addresses.
#
# Requires:
#   FUNDING_KEY  - hex secret key of a funded wallet (to send STT from)
#   cast         - foundry CLI (curl -L https://foundry.paradigm.xyz | bash)
#   gcloud       - Google Cloud CLI (for Secret Manager storage)
#   openssl      - for key generation
#   curl/python3 - for somnia_getSessionAddress RPC calls
#
# NOTE: Somnia session RPCs derive a DIFFERENT address from the seed than
# standard Ethereum key derivation. This script uses somnia_getSessionAddress
# to get the correct address that the session RPC will send transactions from.

set -e

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

COMMITTEE_SIZE="${COMMITTEE_SIZE:-5}"
RPC_URL="${RPC_URL:-https://dream-rpc.somnia.network/}"
AMOUNT="${AMOUNT:-1ether}"

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

if [ -z "$FUNDING_KEY" ]; then
  echo "Error: FUNDING_KEY environment variable is required"
  echo "This is the secret key of a wallet with STT to fund the committee."
  exit 1
fi

for cmd in cast openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not found"
    exit 1
  fi
done

HAS_GCLOUD=false
if command -v gcloud &>/dev/null; then
  HAS_GCLOUD=true
fi

# ---------------------------------------------------------------------------
# Helper: get session address from seed via Somnia RPC
# ---------------------------------------------------------------------------

RPC_ID=1
get_session_address() {
  local seed="$1"
  curl -sf -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"somnia_getSessionAddress\",\"params\":[\"$seed\"],\"id\":$((RPC_ID++))}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result'])"
}

# ---------------------------------------------------------------------------
# Funding wallet info
# ---------------------------------------------------------------------------

FUNDING_ADDR=$(cast wallet address --private-key "$FUNDING_KEY")
FUNDING_BAL=$(cast balance "$FUNDING_ADDR" --rpc-url "$RPC_URL" --ether 2>/dev/null || echo "?")

echo ""
echo "Committee Setup"
echo "==============="
echo "  Members:  $COMMITTEE_SIZE"
echo "  RPC:      $RPC_URL"
echo "  Amount:   $AMOUNT per member"
echo "  Funder:   $FUNDING_ADDR ($FUNDING_BAL STT)"
echo ""

# ---------------------------------------------------------------------------
# Generate keys + derive addresses
# ---------------------------------------------------------------------------

declare -a KEYS
declare -a ADDRS

echo "Generating $COMMITTEE_SIZE keys..."
echo ""

for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
  KEY="0x$(openssl rand -hex 32)"
  ADDR=$(get_session_address "$KEY")
  KEYS[$i]="$KEY"
  ADDRS[$i]="$ADDR"
  echo "  [$i] $ADDR"
done

echo ""

# ---------------------------------------------------------------------------
# Fund each address
# ---------------------------------------------------------------------------

echo "Funding wallets..."
echo ""

for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
  ADDR="${ADDRS[$i]}"
  echo -n "  [$i] $ADDR ... "

  cast send "$ADDR" \
    --value "$AMOUNT" \
    --private-key "$FUNDING_KEY" \
    --rpc-url "$RPC_URL" \
    --json 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['transactionHash'])" 2>/dev/null \
    || echo "(sent)"

  sleep 1
done

echo ""
echo "Verifying balances..."
echo ""

for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
  ADDR="${ADDRS[$i]}"
  BAL=$(cast balance "$ADDR" --rpc-url "$RPC_URL" --ether 2>/dev/null || echo "?")
  echo "  [$i] $ADDR  $BAL STT"
done

# ---------------------------------------------------------------------------
# Save keys to file (so they survive a gcloud failure)
# ---------------------------------------------------------------------------

KEYS_FILE=$(mktemp)
chmod 600 "$KEYS_FILE"
for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
  echo "${KEYS[$i]}" >> "$KEYS_FILE"
done

# ---------------------------------------------------------------------------
# Store in Secret Manager (if gcloud is available)
# ---------------------------------------------------------------------------

if [ "$HAS_GCLOUD" = true ]; then
  echo ""
  echo "Storing keys in Secret Manager..."
  echo ""

  GCLOUD_OK=true
  for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
    SECRET_ID="committee-secret-key-$i"

    # Create the secret if it doesn't exist (ignore error if it does)
    gcloud secrets create "$SECRET_ID" --replication-policy=automatic 2>/dev/null || true

    # Add the key as a new version
    if echo -n "${KEYS[$i]}" | gcloud secrets versions add "$SECRET_ID" --data-file=- --quiet 2>/dev/null; then
      echo "  [$i] Stored in $SECRET_ID"
    else
      echo "  [$i] FAILED to store in $SECRET_ID"
      GCLOUD_OK=false
    fi
  done

  if [ "$GCLOUD_OK" = true ]; then
    rm -f "$KEYS_FILE"
  fi
else
  GCLOUD_OK=false
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "================================================================"
echo "Committee set up and funded."
echo ""
echo "Addresses:"
for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
  echo "  $i: ${ADDRS[$i]}"
done
echo ""

if [ "$GCLOUD_OK" = true ]; then
  echo "Keys stored in Secret Manager: committee-secret-key-{0..$((COMMITTEE_SIZE - 1))}"
else
  echo "Keys saved to: $KEYS_FILE"
  echo ""
  echo "Store them manually:"
  for i in $(seq 0 $((COMMITTEE_SIZE - 1))); do
    echo "  echo -n '$(sed -n "$((i+1))p" "$KEYS_FILE")' | gcloud secrets versions add committee-secret-key-$i --data-file=-"
  done
fi
echo "================================================================"
