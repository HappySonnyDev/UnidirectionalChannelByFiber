#!/bin/bash

# WebSocket to TCP proxy for Fiber Merchant node
# This allows browser-based WASM nodes to connect to the local Merchant node
#
# Browser WASM node --ws--> ws-proxy --tcp--> Merchant fnn node

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
WS_PROXY_LISTEN="${WS_PROXY_LISTEN:-0.0.0.0:8231}"
WS_PROXY_TARGET="${WS_PROXY_TARGET:-127.0.0.1:8228}"
FIBER_P2P_PORT="${FIBER_P2P_PORT:-8228}"

# Get external IP
EXTERNAL_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || echo "YOUR_PUBLIC_IP")

echo "======================================"
echo "Fiber WebSocket Proxy"
echo "======================================"
echo "WebSocket Listen: $WS_PROXY_LISTEN"
echo "Target TCP:       $WS_PROXY_TARGET"
echo "External IP:      $EXTERNAL_IP"
echo "======================================"
echo ""
echo "For local testing:  ws://127.0.0.1:8231"
echo "For external access: ws://$EXTERNAL_IP:8231"
echo ""
echo "Add to your webapp .env file:"
echo "  VITE_FIBER_BOOTNODE=/ip4/$EXTERNAL_IP/tcp/8231/ws"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Check if websocat is installed
if ! command -v websocat &> /dev/null; then
    echo "Error: websocat is not installed. Please install it first:"
    echo "  macOS:  brew install websocat"
    echo "  Linux:  cargo install websocat"
    echo "  Or:     https://github.com/vi/websocat/releases"
    exit 1
fi

# Start the proxy
# This forwards WebSocket connections to the Merchant's TCP P2P port
# Format: websocat ws-listen:ADDR tcp:HOST:PORT
# --binary is required for Fiber's binary P2P protocol
echo "Starting WebSocket proxy (binary mode)..."
websocat --binary "ws-listen:${WS_PROXY_LISTEN}" "tcp:${WS_PROXY_TARGET}"
