#!/usr/bin/env bash
set -euo pipefail

IDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$IDE_DIR/app"
PORT="${PORT:-3080}"
OFFLINE_FLAG=""
SERVER_ARGS=()

for arg in "$@"; do
  if [ "$arg" = "--offline" ]; then
    OFFLINE_FLAG="--offline"
    SERVER_ARGS+=("--prod")
  elif [ "$arg" = "--prod" ]; then
    SERVER_ARGS+=("--prod")
  fi
done

echo "====================================================="
echo "  KT Middle IDE — Native Node.js 1-Click Launcher"
echo "====================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[ERR] Node.js (>= 18) is required. Install from https://nodejs.org/"
  exit 1
fi

cd "$APP_DIR"

if [ ! -f "node_modules/vite/package.json" ]; then
  if [ -f "dist/index.html" ]; then
    echo "[INFO] vite not found, using prebuilt Offline bundle (dist/index.html)..."
    SERVER_ARGS=("--prod")
  elif [ -f "package.json" ] && command -v npm >/dev/null 2>&1; then
    echo "[INFO] Installing Vite & npm dependencies..."
    if ! npm install --no-audit --no-fund; then
      if [ -f "dist/index.html" ]; then
        echo "[WARN] npm install failed — falling back to prebuilt Offline bundle (dist)..."
        SERVER_ARGS=("--prod")
      else
        echo "[ERR] Failed to install dependencies and no dist bundle exists."
        exit 1
      fi
    fi
  fi
fi

node setup-deps.js ${OFFLINE_FLAG} || echo "[WARN] Setup warnings detected — continuing in Offline mode..."

"$APP_DIR/manage-ide.sh" stop >/dev/null 2>&1 || true

open_browser() {
  sleep 1.5
  local url="http://localhost:${PORT}"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$url" || true
  fi
}

echo "[INFO] Starting KT Middle IDE at http://localhost:${PORT} ..."
echo "       Press Ctrl+C to stop the server."
open_browser &
exec node "$APP_DIR/server.js" "${SERVER_ARGS[@]}"
