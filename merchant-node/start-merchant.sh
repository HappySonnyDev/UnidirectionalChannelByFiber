#!/bin/bash

# Start Fiber Merchant Node
# This is the payment receiver node for the AI assistant service
# Browser WASM nodes connect directly to this merchant node

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Check if fnn binary exists
FNN_BIN="${FNN_BIN:-./fnn}"
if [ ! -f "$FNN_BIN" ]; then
    echo "Error: fnn binary not found at $FNN_BIN"
    echo "Please download fnn with: ./download-fnn.sh"
    echo "Or manually from: https://github.com/nervosnetwork/fiber/releases"
    exit 1
fi

# Check if private key exists
if [ -z "$MERCHANT_PRIVATE_KEY" ]; then
    echo "Error: MERCHANT_PRIVATE_KEY not set in .env file"
    echo "Please generate a key with: openssl rand -hex 32"
    echo "Then add it to .env"
    exit 1
fi

# Create data directory and write key file
mkdir -p data/merchant/ckb
echo "$MERCHANT_PRIVATE_KEY" | sed 's/^0x//' > data/merchant/ckb/key

# Set port overrides from env (with defaults)
FIBER_P2P_PORT="${FIBER_P2P_PORT:-8228}"
FIBER_RPC_PORT="${FIBER_RPC_PORT:-8227}"

echo "======================================"
echo "Starting Fiber Merchant Node"
echo "======================================"
echo "Name: ${MERCHANT_NODE_NAME:-MerchantNode}"
echo "RPC:  127.0.0.1:${FIBER_RPC_PORT}"
echo "P2P:  0.0.0.0:${FIBER_P2P_PORT}"
echo "Data: data/merchant"
echo "======================================"

# Set password for encrypting the key
export FIBER_SECRET_KEY_PASSWORD="fiber-merchant-password"

# Start the node
exec "$FNN_BIN" \
    -c config/merchant.yml \
    -d data/merchant
