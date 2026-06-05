---
name: deploy
description: Build, push, and deploy the SRGC app to the k3s home cluster at club.ziasyed.com. Use when asked to deploy, ship, release, or push SRGC changes live, or to roll back a bad release.
---

# Deploy SRGC to club.ziasyed.com

The app runs on the user's k3s home cluster as Helm release `srgc` (namespace
`default`), served at **https://club.ziasyed.com** behind ingress-nginx +
cert-manager. The deploy is a container image built locally, pushed to Docker
Hub (`docker.io/ztsyed/srgc-app`), then rolled out with `helm upgrade`.

Two scripts do the work; prefer them over hand-rolled commands:
- `scripts/build-and-push.sh [tag]` — builds `linux/amd64` (cluster is x86_64),
  tags `:<tag>` and `:latest`, and pushes both. Tag defaults to
  `v$(date -u +%Y-%m-%d-%H%M)`.
- `scripts/install.sh [tag]` — reads secrets + `DEPLOY_HOST` from `.env.local`
  and runs `helm upgrade --install srgc deploy/helm/srgc-app --set image.tag=<tag> --wait`.

## Procedure

Run these in order. Stop and surface the problem if any gate fails — do not
push or deploy a build that doesn't compile.

1. **Pre-flight gates** (cheap, catch errors before the slow image build):
   - `npm run build` — must succeed. This is the real gate (typecheck alone is
     not enough; it catches client/server boundary and prerender errors).
   - Confirm `.env.local` exists and has the required keys: `DEPLOY_HOST`,
     `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ANTHROPIC_API_KEY`,
     `ADMIN_EMAILS`. `install.sh` errors out if any are missing.
   - Docker must be reachable: `docker info`. If not, start it with
     `open -a Docker` and poll `docker info` every 5s until ready (~30–60s on
     a cold start). The build script also hard-fails without a daemon.

2. **Commit** the changes. This project commits straight to `main` (the deploy
   reads the working tree, and all history is linear on `main`) — follow that
   convention; don't branch. End the message with the standard
   `Co-Authored-By` trailer.

3. **Build & push**: `scripts/build-and-push.sh`. Capture the printed tag
   (e.g. `v2026-06-05-0404`) — you need it verbatim for the next step. This
   step takes a few minutes; give it a generous timeout (~10 min).

4. **Deploy**: `scripts/install.sh <tag>` using the exact tag from step 3.
   Don't rely on `:latest` — pin the dated tag so the rollout is reproducible
   and a rollback target is unambiguous.

5. **Verify** (all three):
   - Pod runs the new image:
     `kubectl get pod -l app.kubernetes.io/instance=srgc -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\t"}{.spec.containers[0].image}{"\n"}{end}'`
     — the `Running` app pod's image must end in the tag you deployed.
   - `kubectl rollout status deploy/srgc-srgc-app --timeout=120s`.
   - `curl -sS -o /dev/null -w "HTTP %{http_code} %{url_effective}\n" -L https://club.ziasyed.com`
     — expect `HTTP 200` redirecting to `/signin` (the app is auth-gated).

## Notes & gotchas

- **Auth gate**: you can only confirm the site serves and redirects to
  `/signin`. You cannot see the rendered logged-in UI without signing in, so
  tell the user what to spot-check manually after a UI change.
- **Rollback**: `helm history srgc -n default` lists revisions; roll back with
  `helm rollback srgc <REVISION> -n default`. Each `install.sh` bumps the helm
  revision (the deploy on 2026-06-05 was revision 16; prior good image was
  `v2026-05-13-0005` at revision 15).
- **Secrets**: `helm get values srgc -n default` prints real secrets
  (Anthropic key, Google OAuth secret, AUTH_SECRET) in cleartext. Avoid running
  it unless needed, and don't echo its output back into chat.
- **One-time PVC seeding** (handbook / newsletter PDFs) is only needed on a
  fresh install, not on routine redeploys — the PVC `srgc-srgc-app-data`
  persists across rollouts. `install.sh` prints the `kubectl cp` reminders.
