#!/bin/bash

# Check Merchant node status and list channels
# This script verifies the merchant node is running and displays channel information

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

FNN_CLI="${FNN_CLI:-./fnn-cli}"
MERCHANT_RPC="http://127.0.0.1:${FIBER_RPC_PORT:-8227}"

echo "======================================"
echo "Fiber Merchant Node - Channel Status"
echo "======================================"
echo "RPC: $MERCHANT_RPC"
echo ""

# Check if fnn-cli exists
if [ ! -f "$FNN_CLI" ]; then
    echo "Warning: fnn-cli not found at $FNN_CLI"
    echo "Falling back to curl for RPC calls..."
    USE_CURL=true
else
    USE_CURL=false
fi

# Check node info
echo "--- Node Info ---"
if [ "$USE_CURL" = true ]; then
    NODE_INFO=$(curl -s -X POST "$MERCHANT_RPC" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"node_info","params":[],"id":1}' 2>/dev/null || echo "")
    if [ -z "$NODE_INFO" ] || echo "$NODE_INFO" | grep -q "error\|Connection refused"; then
        echo "Error: Cannot connect to Merchant node at $MERCHANT_RPC"
        echo "Make sure the node is running: ./start-merchant.sh"
        exit 1
    fi
    echo "$NODE_INFO" | python3 -m json.tool 2>/dev/null || echo "$NODE_INFO"
else
    if ! "$FNN_CLI" -u "$MERCHANT_RPC" node info 2>/dev/null; then
        echo "Error: Cannot connect to Merchant node at $MERCHANT_RPC"
        echo "Make sure the node is running: ./start-merchant.sh"
        exit 1
    fi
fi

echo ""

# List channels
echo "--- Channels ---"
if [ "$USE_CURL" = true ]; then
    CHANNELS=$(curl -s -X POST "$MERCHANT_RPC" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"list_channels","params":[],"id":1}' 2>/dev/null || echo "")
    if [ -z "$CHANNELS" ] || echo "$CHANNELS" | grep -q "error\|Connection refused"; then
        echo "Error: Failed to list channels"
    else
        echo "$CHANNELS" | python3 -m json.tool 2>/dev/null || echo "$CHANNELS"
    fi
else
    "$FNN_CLI" -u "$MERCHANT_RPC" channel list_channels 2>/dev/null || echo "No channels found"
fi

echo ""
echo "======================================"
echo "Channel check complete!"
echo "======================================"
echo ""
echo "Tips:"
echo "  - To open a channel, the browser WASM node will auto-connect"
echo "  - Make sure the WebSocket proxy is running: ./start-ws-proxy.sh"
echo "  - Check node balance: curl -X POST $MERCHANT_RPC -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"node_info\",\"params\":[],\"id\":1}'"
