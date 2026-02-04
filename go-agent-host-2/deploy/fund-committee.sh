#!/bin/bash
# Fund committee wallets with Somnia testnet tokens
# Requires: PRIVATE_KEY environment variable (your funding wallet)
# Requires: cast (foundry) - install with: curl -L https://foundry.paradigm.xyz | bash

set -e

if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY environment variable is required"
  echo "This should be your funding wallet's private key"
  exit 1
fi

RPC_URL="${RPC_URL:-https://dream-rpc.somnia.network/}"
AMOUNT="${AMOUNT:-1ether}"  # Amount to send to each wallet

# Committee wallet addresses (derived from the generated private keys)
WALLETS=(
  "0xa2c21C6fa41249AFb100e44f066411Cea665213f"  # committee-0
  "0x935783E4004445cC3b7B1C0631eb443194Fe54d0"  # committee-1
  "0xed16B7A320A48bd057C6Cc6A49449901Cd3D1CC2"  # committee-2
  "0xF3f18DF39BdbF79cb96D414305B7EDac9605ae8e"  # committee-3
  "0xA8B3187d09d0aB1bBaBBb9e85dab43FD43144d3E"  # committee-4
)

echo "Funding committee wallets with $AMOUNT each..."
echo "RPC: $RPC_URL"
echo ""

# Get funding wallet address
FUNDING_WALLET=$(cast wallet address --private-key "$PRIVATE_KEY")
echo "Funding wallet: $FUNDING_WALLET"
BALANCE=$(cast balance "$FUNDING_WALLET" --rpc-url "$RPC_URL" --ether)
echo "Funding wallet balance: $BALANCE ETH"
echo ""

for i in "${!WALLETS[@]}"; do
  WALLET="${WALLETS[$i]}"
  echo "[$i] Sending $AMOUNT to $WALLET..."

  # Check current balance
  CURRENT=$(cast balance "$WALLET" --rpc-url "$RPC_URL" --ether 2>/dev/null || echo "0")
  echo "    Current balance: $CURRENT ETH"

  # Send transaction
  TX=$(cast send "$WALLET" \
    --value "$AMOUNT" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_URL" \
    2>&1)

  if echo "$TX" | grep -q "transactionHash"; then
    HASH=$(echo "$TX" | grep "transactionHash" | awk '{print $2}')
    echo "    TX: $HASH"
  else
    echo "    Sent successfully"
  fi

  # Small delay to avoid nonce issues
  sleep 1
done

echo ""
echo "Done! Verifying balances..."
echo ""

for i in "${!WALLETS[@]}"; do
  WALLET="${WALLETS[$i]}"
  BALANCE=$(cast balance "$WALLET" --rpc-url "$RPC_URL" --ether 2>/dev/null || echo "error")
  echo "Committee $i ($WALLET): $BALANCE ETH"
done
