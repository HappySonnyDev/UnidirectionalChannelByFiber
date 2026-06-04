#!/bin/bash

# Download fnn binary from GitHub Releases
# Usage: ./download-fnn.sh [version]  (default: v0.8.1)

set -e

VERSION="${1:-v0.8.1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux) PLATFORM="linux" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# v0.8.x naming: fnn_<VERSION>-<ARCH>-<PLATFORM>-portable.tar.gz
FILENAME="fnn_${VERSION}-${ARCH}-${PLATFORM}-portable.tar.gz"
URL="https://github.com/nervosnetwork/fiber/releases/download/${VERSION}/${FILENAME}"

echo "Downloading fnn ${VERSION} for ${ARCH}-${PLATFORM}..."
echo "URL: $URL"
curl -fL -o "$SCRIPT_DIR/fnn.tar.gz" "$URL"

echo "Extracting..."
tar xzf "$SCRIPT_DIR/fnn.tar.gz" -C "$SCRIPT_DIR"

# Some releases extract into a subfolder, flatten if needed
if [ ! -f "$SCRIPT_DIR/fnn" ]; then
  EXTRACTED=$(find "$SCRIPT_DIR" -maxdepth 3 -type f -name fnn -not -path "$SCRIPT_DIR/fnn" -print -quit)
  if [ -n "$EXTRACTED" ]; then
    DIR=$(dirname "$EXTRACTED")
    [ -f "$DIR/fnn" ]         && mv "$DIR/fnn"         "$SCRIPT_DIR/fnn"
    [ -f "$DIR/fnn-cli" ]     && mv "$DIR/fnn-cli"     "$SCRIPT_DIR/fnn-cli"
    [ -f "$DIR/fnn-migrate" ] && mv "$DIR/fnn-migrate" "$SCRIPT_DIR/fnn-migrate"
    rmdir "$DIR" 2>/dev/null || true
  fi
fi

chmod +x "$SCRIPT_DIR/fnn" 2>/dev/null || true
[ -f "$SCRIPT_DIR/fnn-cli" ]     && chmod +x "$SCRIPT_DIR/fnn-cli"
[ -f "$SCRIPT_DIR/fnn-migrate" ] && chmod +x "$SCRIPT_DIR/fnn-migrate"

# macOS Gatekeeper: remove quarantine attribute
if [ "$OS" = "darwin" ]; then
  xattr -d com.apple.quarantine "$SCRIPT_DIR/fnn" 2>/dev/null || true
  [ -f "$SCRIPT_DIR/fnn-cli" ]     && xattr -d com.apple.quarantine "$SCRIPT_DIR/fnn-cli"     2>/dev/null || true
  [ -f "$SCRIPT_DIR/fnn-migrate" ] && xattr -d com.apple.quarantine "$SCRIPT_DIR/fnn-migrate" 2>/dev/null || true
fi

# Clean up tarball
rm -f "$SCRIPT_DIR/fnn.tar.gz"

echo "Done! fnn and fnn-cli are ready."
echo "Version: $($SCRIPT_DIR/fnn --version 2>/dev/null || echo 'unknown')"
