#!/usr/bin/env bash
set -euo pipefail

IDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$IDE_DIR/app"
PORT="${PORT:-3080}"

echo "====================================================="
echo "  KT Middle IDE — Native Node.js 1-Click Launcher"
echo "====================================================="

if ! command -v node >/dev/null 2>&1; then
  echo "[ERR] Node.js (>= 18) is required. Install from https://nodejs.org/"
  exit 1
fi

cd "$APP_DIR"

if [ -f "package.json" ] && [ ! -f "node_modules/vite/package.json" ] && command -v npm >/dev/null 2>&1; then
  echo "[INFO] Installing Vite & npm dependencies..."
  npm install --no-audit --no-fund
fi

node setup-deps.js

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
exec node "$APP_DIR/server.js"
