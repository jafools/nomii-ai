# Shenmay AI — Release Process

This is the authoritative procedure for shipping a new version of Shenmay to
customers. Follow it every time.

## Mental model

- **`main` is the integration branch** — protected. Always green. Never pushed to directly.
- **Feature work** happens on `feat/*`, `fix/*`, `chore/*` branches → opened as a PR → merged after CI passes.
- **Merging to `main` does NOT ship to customers.** It builds a `:edge` image which staging runs, so you can click through the feature at `https://nomii-staging.pontensolutions.com` before cutting a release.
- **The release act is `git tag vX.Y.Z`.** That's what triggers the customer-facing `:stable` and `:latest` images to rebuild.
- **SaaS (Hetzner) is deployed manually** by SSH'ing in and checking out the tag. Do it *after* the tag is cut, so SaaS and on-prem are on the same SHA.

## Environments

| Env | URL | Image tag | Host | Purpose |
|---|---|---|---|---|
| Staging | https://nomii-staging.pontensolutions.com | `:edge` | Proxmox VM (`pontenprox` SSH alias → `10.0.100.2`) | Preview every merge to main before release |
| Prod (SaaS) | https://nomii.pontensolutions.com | `:vX.Y.Z` pulled from GHCR | Hetzner Helsinki (`nomii@204.168.232.24`) | Live customer traffic |
| Prod (on-prem) | customer's server | `:stable` (pulled from GHCR) | customer hardware | Self-hosted deployments |

## Day-to-day (working on main)

```bash
# Start work — branch off main
git checkout main
git pull
git checkout -b feat/my-thing

# ... commit changes ...
git push -u origin feat/my-thing

# Open a PR (gh pr create) — CI runs automatically.
# When CI is green, merge. Squash-merge is fine.
```

No customer sees these changes yet. `:stable` is unchanged. SaaS is unchanged.

After the merge, `:edge` rebuilds on GHCR. The Proxmox staging VM pulls `:edge`
(either via the timer, Watchtower, or a manual script — see "Staging refresh"
below) and the feature becomes visible at
https://nomii-staging.pontensolutions.com so you can click through it.

## Staging

Staging is a permanently-running copy of Shenmay on the Proxmox VM, using the
`:edge` image tag. Its DB (`nomii_ai_staging`) is separate from prod, with
fresh test data. SMTP and Stripe are left unset so you don't accidentally
email customers or charge cards during QA.

Files live in `/root/nomii-staging/` on the Proxmox VM:

- `docker-compose.staging.yml` — pulls `:edge` images, attaches the frontend to the `knomi-ai_default` docker network so the existing `nomii-cloudflared` tunnel can reach it by container name
- `.env` — staging secrets (never in git)
- `refresh-staging.sh` — pulls latest `:edge` and rolls containers if digests changed

Public hostname wired via the existing Cloudflare tunnel
(`fb2cb466-3f4f-46f8-8a0c-2b45c549bbe4`, name `knomi-ai`): route
`nomii-staging.pontensolutions.com` → `http://nomii-frontend-staging:80` on
the shared docker network.

### Staging refresh

Staging is refreshed automatically by a systemd timer
(`nomii-staging-refresh.timer`) running on the Proxmox VM. Every 5 minutes
it invokes `/root/nomii-staging/refresh-staging.sh`, which pulls `:edge`
from GHCR and rolls the staging containers if the image digest changed.
Idempotent — if `:edge` hasn't moved, it's a no-op.

To trigger manually (e.g. right after a merge, if you don't want to wait):

```bash
ssh pontenprox "bash /root/nomii-staging/refresh-staging.sh"
```

To pause auto-refresh:

```bash
ssh pontenprox "systemctl disable --now nomii-staging-refresh.timer"
```

Re-enable with the `enable --now` form. Logs: `journalctl -u nomii-staging-refresh.service`.

## Cutting a release

Do this when main has accumulated a set of changes you're ready to ship to
customers (SaaS + on-prem).

```bash
# 1. Make sure you're on main and up-to-date
git checkout main
git pull

# 2. Decide the version
#    - PATCH (v1.0.1)  — bug fixes only
#    - MINOR (v1.1.0)  — backwards-compatible features
#    - MAJOR (v2.0.0)  — breaking changes (migration notes required)

# 3. Tag and push
git tag v1.2.3
git push origin v1.2.3
```

This triggers `.github/workflows/docker-publish.yml`, which builds and pushes
the backend + frontend images to GHCR with these tags:

```
ghcr.io/jafools/shenmay-backend:1.2.3      ← note: no "v" prefix on image tags
ghcr.io/jafools/shenmay-backend:1.2
ghcr.io/jafools/shenmay-backend:stable
ghcr.io/jafools/shenmay-backend:latest
(same 4 tags for shenmay-frontend)
```

> **Phase 6 cutover (2026-04-23):** image names flipped from `nomii-*` to
> `shenmay-*` at **v2.7.0**. Tags `v2.6.0` and older live on the old
> `ghcr.io/jafools/nomii-{backend,frontend}` repos indefinitely (GHCR
> tags are immutable). Rollback to any v2.6.0-or-earlier tag works
> because those tags' compose files reference the old image names.

> **Git tags vs. Docker image tags:** we push `v1.2.3` to git, but the docker
> image tag is `1.2.3` (no `v`). This is the docker/metadata-action SemVer
> convention. Use the `v`-prefixed form when checking out git, the plain form
> when pinning `image:` in a compose file.

Wait for the GitHub Actions run to go green (~5–10 min).

## Deploying SaaS (Hetzner) to the new release

> **Changed 2026-04-18:** SaaS now **pulls** the same GHCR image that on-prem
> customers get (Finding #11 resolved). No more local source build on Hetzner.
> The deploy step is `pull + up -d`, not `build`. `.env` on Hetzner has
> `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.override.yml` set so
> the prod-specific SSL + localhost-bind config layers on automatically.

```bash
# Fetch the tag, set IMAGE_TAG, pull matching GHCR image, roll containers.
ssh nomii@204.168.232.24 "cd ~/nomii-ai && git fetch --tags && git checkout v1.2.3 && IMAGE_TAG=1.2.3 docker compose pull backend frontend && IMAGE_TAG=1.2.3 docker compose up -d backend frontend"

# Verify
ssh nomii@204.168.232.24 "curl -s http://127.0.0.1:3001/api/health"

# Confirm Hetzner is running exactly the GHCR tag, not a stray local build:
ssh nomii@204.168.232.24 "docker inspect shenmay-backend --format '{{.Config.Image}}'"
#  → ghcr.io/jafools/shenmay-backend:1.2.3
```

Keep SaaS on the exact version tag (not `:stable` and not `main`). That way
`docker inspect` tells you what version customers are running, and you can
reproduce any production issue by running the same image tag locally.

## On-prem customer experience

Customers' `docker-compose.selfhosted.yml` pins `ghcr.io/jafools/shenmay-backend:stable`
(and `:stable` for frontend). After you cut a tag, they'll get the new image
next time they run:

```bash
docker compose -f docker-compose.selfhosted.yml pull
docker compose -f docker-compose.selfhosted.yml up -d
```

New customers running `install.sh` will automatically pull the latest
released tag (the installer calls `/releases/latest` on the GitHub API).

## Releasing a hotfix

If something's broken in production and you need to ship urgently:

```bash
# 1. Branch off the broken tag (not main)
git checkout v1.2.3
git checkout -b hotfix/stripe-webhook-crash

# 2. Fix the bug, commit
git push -u origin hotfix/stripe-webhook-crash

# 3. Open a PR targeting main — CI runs.
#    Merge when green.

# 4. Tag a patch version
git checkout main
git pull
git tag v1.2.4
git push origin v1.2.4

# 5. Deploy SaaS to v1.2.4 (same as normal release)
```

## Rolling back

If a release breaks production, roll back SaaS to the previous tag:

```bash
ssh nomii@204.168.232.24 "cd ~/nomii-ai && git fetch --tags && git checkout v1.2.2 && IMAGE_TAG=1.2.2 docker compose pull backend frontend && IMAGE_TAG=1.2.2 docker compose up -d backend frontend"
```

All prior GHCR tags are retained (`:1.2.2`, `:1.1`, etc.), so rollback is just
a re-pull of the older image — no rebuild, no risk of transient build
breakage reintroducing itself.

For on-prem customers: retag `:stable` on GHCR to point at the previous
version. Fastest way is to re-run the docker-publish workflow manually
against the old tag:

```
GitHub → Actions → Publish Docker Images → Run workflow → Select tag: v1.2.2
```

Then tell customers to `docker compose pull && up -d`.

## When a migration fails

The backend runs `server/db/migrations/*.sql` on startup. If a migration
fails, the backend crash-loops and the UI goes down. Here's the recovery
path.

### SaaS (Hetzner)

```bash
# 1. Look at the error
ssh nomii@204.168.232.24 "cd ~/nomii-ai && docker compose logs backend --tail=200"

# 2. Identify the failing migration (the runner logs each file as it runs,
#    the failed one is the last "Running:" before the crash).

# 3. Roll back to the previous release's code. This gets the UI back up
#    immediately — the DB will still have any *partially-applied* schema
#    from the failed migration, but the old code will ignore it.
ssh nomii@204.168.232.24 "cd ~/nomii-ai && git stash && git checkout v1.X.Y-prev && git stash pop && docker compose up -d --build backend frontend"

# 4. Fix the migration on a branch → PR → merge → new tag.
#    If you need to clean up partial schema state on prod first, `psql`
#    into the DB and do it by hand — never auto-run from startup code.

# 5. Deploy the new tag the normal way.
```

### Self-hosted

Customers don't get automatic rollback — they have to manually pin the
compose file to the previous tag:

```bash
# In their install directory (typically ~/nomii)
sed -i 's|:stable|:v1.X.Y-prev|' docker-compose.selfhosted.yml
docker compose pull
docker compose up -d
```

Write a proper upgrade-safety release note and send it to customers before
cutting any tag that includes a non-idempotent migration.

### Preventing this

Every new migration SQL file must use `IF NOT EXISTS` / `ADD COLUMN IF NOT
EXISTS` / similar guards — our migration runner treats those as success on
re-run, which is what keeps boot-time idempotency working. If you can't make
a migration idempotent (e.g. a one-shot data backfill), split it into a
separate out-of-band script and run it manually via `docker exec shenmay-db
psql …`.

---

## Tag cheat sheet

| Tag | Moves when | Who pins here |
|-----|------------|---------------|
| `:edge` | Every push to main | Internal / staging only |
| `:1.2.3` | When tag is cut | Customers who want an exact version |
| `:1.2` | When any 1.2.x tag is cut | Customers who want all 1.2 patches |
| `:stable` | When any tag is cut | **Default for self-hosted customers** |
| `:latest` | When any tag is cut | Legacy — treat as alias for `:stable` |
