#!/usr/bin/env bash
# Serve the game locally. Modules and the service worker need http://, not file://.
set -euo pipefail
PORT="${1:-8000}"
cd "$(dirname "${BASH_SOURCE[0]}")/web"
echo "Memory Maze  ->  http://localhost:$PORT/   (self test: /test.html)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
