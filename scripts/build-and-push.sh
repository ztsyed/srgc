#!/usr/bin/env bash
# Build the SRGC web app image for linux/amd64 (the k3s cluster runs on
# Rocky Linux x86_64) and push it to Docker Hub.
#
# Usage:  scripts/build-and-push.sh [tag]
#         tag defaults to a short timestamp (e.g. v2026-05-04-1730)
#
# Requirements:
#   - Docker Desktop running
#   - `docker login` against Docker Hub (or credsStore configured)
#   - buildx (bundled with Docker Desktop)

set -euo pipefail

REPO="docker.io/ztsyed/srgc-app"
TAG="${1:-v$(date -u +%Y-%m-%d-%H%M)}"
IMAGE="${REPO}:${TAG}"
PLATFORM="linux/amd64"

cd "$(dirname "$0")/.."

# Sanity: the daemon is reachable.
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not reachable. Start Docker Desktop and retry." >&2
  exit 1
fi

# buildx builder. Reuse the default if it supports linux/amd64; otherwise create one.
if ! docker buildx inspect default 2>/dev/null | grep -q "linux/amd64"; then
  docker buildx create --name srgc --driver docker-container --use 2>/dev/null || docker buildx use srgc
fi

echo "→ Building ${IMAGE} for ${PLATFORM}…"
docker buildx build \
  --platform "${PLATFORM}" \
  --file deploy/Dockerfile \
  --tag "${IMAGE}" \
  --tag "${REPO}:latest" \
  --push \
  .

echo
echo "✓ Pushed ${IMAGE}"
echo "  also tagged as ${REPO}:latest"
echo
echo "Next: scripts/install.sh ${TAG}    # to deploy this exact tag"
