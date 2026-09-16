#!/usr/bin/env bash
# Regenerate web/levels/*.json and web/assets/textures/*.png from the real
# memory-maze environment, using the memory-maze docker image.
#
#   ./tools/export.sh [--seeds 12] [--sizes 9x9,11x11]
#
# Build the image first if you don't have it:
#   docker build -t memory-maze:latest ../../repos/memory-maze
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(dirname "$HERE")"
MAZE_REPO="${MAZE_REPO:-$(cd "$PROJECT/../../repos/memory-maze" && pwd)}"
IMAGE="${IMAGE:-memory-maze:latest}"

docker run --rm \
  -v "$MAZE_REPO":/app \
  -v "$PROJECT":/project \
  -w /project \
  -e MUJOCO_GL=osmesa \
  -u "$(id -u):$(id -g)" \
  "$IMAGE" /project/tools/export_levels.py --out /project/web "$@"
