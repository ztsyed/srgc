#!/usr/bin/env bash
# Install / upgrade the SRGC app on a k3s cluster via Helm.
# Reads OAuth + API secrets and the public hostname from .env.local so
# nothing identifying lives in the repo.
#
# Usage:  scripts/install.sh [tag]
#         tag defaults to "latest"

set -euo pipefail

TAG="${1:-latest}"
RELEASE="srgc"
NAMESPACE="default"

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Run scripts/install.sh from the repo root." >&2
  exit 1
fi

# Read a bare KEY=VALUE line from .env.local without interpreting the rest of
# the file (no `source` — that would execute arbitrary shell).
get_env() {
  local key="$1"
  local val
  val=$(grep -E "^${key}=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
  echo "$val"
}

HOST="$(get_env DEPLOY_HOST)"
AUTH_SECRET="$(get_env AUTH_SECRET)"
AUTH_GOOGLE_ID="$(get_env AUTH_GOOGLE_ID)"
AUTH_GOOGLE_SECRET="$(get_env AUTH_GOOGLE_SECRET)"
ANTHROPIC_API_KEY="$(get_env ANTHROPIC_API_KEY)"
ALLOWED_EMAILS="$(get_env ALLOWED_EMAILS)"

missing=()
[ -z "$HOST" ]               && missing+=(DEPLOY_HOST)
[ -z "$AUTH_SECRET" ]        && missing+=(AUTH_SECRET)
[ -z "$AUTH_GOOGLE_ID" ]     && missing+=(AUTH_GOOGLE_ID)
[ -z "$AUTH_GOOGLE_SECRET" ] && missing+=(AUTH_GOOGLE_SECRET)
[ -z "$ANTHROPIC_API_KEY" ]  && missing+=(ANTHROPIC_API_KEY)
[ -z "$ALLOWED_EMAILS" ]     && missing+=(ALLOWED_EMAILS)
if [ ${#missing[@]} -gt 0 ]; then
  echo "ERROR: missing keys in .env.local: ${missing[*]}" >&2
  exit 1
fi

echo "→ Upgrading ${RELEASE} to image tag :${TAG}…"
helm upgrade --install "${RELEASE}" deploy/helm/srgc-app \
  --namespace "${NAMESPACE}" \
  --set image.tag="${TAG}" \
  --set "host=${HOST}" \
  --set "secrets.AUTH_SECRET=${AUTH_SECRET}" \
  --set "secrets.AUTH_GOOGLE_ID=${AUTH_GOOGLE_ID}" \
  --set "secrets.AUTH_GOOGLE_SECRET=${AUTH_GOOGLE_SECRET}" \
  --set "secrets.ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" \
  --set "secrets.ALLOWED_EMAILS=${ALLOWED_EMAILS}" \
  --wait --timeout 5m

echo
echo "✓ Helm release deployed."
echo
echo "Status:"
kubectl -n "${NAMESPACE}" get deploy,svc,ingress,pvc -l app.kubernetes.io/instance="${RELEASE}"
echo
echo "Open: https://${HOST}"
echo
echo "Reminders:"
echo "  • DNS A record:  ${HOST}  →  <your ingress LoadBalancer IP>"
echo "  • Google OAuth redirect URI:  https://${HOST}/api/auth/callback/google"
echo "  • Seed PVC with PDFs (one-time):"
echo "      POD=\$(kubectl get pod -l app.kubernetes.io/instance=${RELEASE} -o jsonpath='{.items[0].metadata.name}')"
echo "      kubectl cp <handbook>.pdf \"\$POD:/data/pdfs/handbook.pdf\""
echo "      kubectl cp <newsletter>.pdf  \"\$POD:/data/pdfs/YYYY-MM.pdf\""
