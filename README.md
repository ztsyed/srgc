# SRGC Companion

Private web app for the Sunnyvale Rod & Gun Club. Shows what's happening
today at the Rifle/Pistol range and the Trap range, plus a calendar view
and the Policies & Procedures Handbook. Behind Google OAuth, restricted
to an allowlist.

## Local development

```bash
cp .env.example .env.local        # fill in values
mkdir -p data/pdfs data/events
# Place the handbook and any newsletters into data/pdfs/, e.g.:
# cp <your-handbook>.pdf data/pdfs/handbook.pdf
# cp <newsletter>.pdf    data/pdfs/2026-01.pdf

npm install
npm run dev
# open http://localhost:3000
```

For Google OAuth in local dev:
- Create an OAuth 2.0 Client in [Google Cloud Console](https://console.cloud.google.com/).
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
- Copy client ID/secret into `.env.local`.

Newsletters get parsed via the Claude API on `/admin` upload. They can also
be copied directly into `data/pdfs/` and parsed with the Re-parse button.

## Build & push image

```bash
scripts/build-and-push.sh [tag]   # builds linux/amd64, pushes to Docker Hub
```

## Deploy to k3s

Set `DEPLOY_HOST` and the auth secrets in `.env.local`, then:

```bash
scripts/install.sh [tag]
```

The script reads `DEPLOY_HOST`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `ANTHROPIC_API_KEY`, and `ALLOWED_EMAILS` from
`.env.local` and passes them to `helm upgrade --install`. Nothing
identifying lives in the repo.

After install:
- Add a DNS A record for `DEPLOY_HOST` → your ingress LoadBalancer IP.
- Add the production redirect URI `https://<DEPLOY_HOST>/api/auth/callback/google`
  to the Google OAuth client.
- Seed the cluster's PVC with the handbook + newsletters:

```bash
POD=$(kubectl get pod -l app.kubernetes.io/instance=srgc -o jsonpath='{.items[0].metadata.name}')
kubectl cp <handbook>.pdf  "$POD:/data/pdfs/handbook.pdf"
kubectl cp <newsletter>.pdf "$POD:/data/pdfs/YYYY-MM.pdf"
```

Then visit `https://<DEPLOY_HOST>/admin`, hit Re-parse on each month.

## Adding a new monthly newsletter

1. Sign in, go to `/admin`.
2. Pick the PDF, click "Upload & parse".
3. Verify it appears under "Ingested months".
4. Open `/` (or `/calendar/<date>`) to confirm events look right.
