#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDE_DIR="$(cd "$APP_DIR/.." && pwd)"
ROOT_DIR="$(cd "$IDE_DIR/.." && pwd)"
PID_FILE="$APP_DIR/.local-ide.pid"
LOG_FILE="$APP_DIR/.local-ide.log"
PORT="${PORT:-3080}"

open_browser() {
  local url="http://localhost:${PORT}"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$url" || true
  fi
}

setup_deps() {
  if ! command -v node >/dev/null 2>&1; then
    echo "[ERR] Node.js (>= 18) is not installed."
    return 1
  fi
  cd "$APP_DIR"
  if [ -f "package.json" ] && [ ! -d "node_modules" ] && command -v npm >/dev/null 2>&1; then
    npm install --no-audit --no-fund --silent || true
  fi
  node "$APP_DIR/setup-deps.js"
}

start_ide() {
  setup_deps
  stop_ide
  nohup node "$APP_DIR/server.js" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 1
  echo "[OK] KT Middle IDE running at http://localhost:${PORT} (PID $(cat "$PID_FILE"))"
  open_browser
}

stop_ide() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" >/dev/null 2>&1 || true
    rm -f "$PID_FILE"
    echo "[OK] Stopped KT Middle IDE."
  fi
}

show_status() {
  echo "=== KT Middle IDE Status (Native Node.js) ==="
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
    echo "IDE Server : RUNNING (PID $(cat "$PID_FILE")) -> http://localhost:${PORT}"
  else
    echo "IDE Server : STOPPED"
  fi
  if [ -f "$LOG_FILE" ]; then
    echo "--- Recent Logs ---"
    tail -n 15 "$LOG_FILE" || true
  fi
}

case "${1:-}" in
  setup|install) setup_deps ;;
  start|local) start_ide ;;
  stop) stop_ide ;;
  status) show_status ;;
  *)
    while true; do
      echo ""
      echo "====================================================="
      echo "   KT Middle IDE — Native Node.js Manager"
      echo "====================================================="
      echo " [1] Install Dependencies & Start IDE"
      echo " [2] Status & Logs"
      echo " [3] Stop IDE Server"
      echo " [4] Run Dependency Setup (Arduino CLI)"
      echo " [0] Exit"
      echo "====================================================="
      read -r -p "Select option: " choice
      case "$choice" in
        1) start_ide ;;
        2) show_status ;;
        3) stop_ide ;;
        4) setup_deps ;;
        0) exit 0 ;;
        *) echo "Invalid choice" ;;
      esac
    done
    ;;
esac
