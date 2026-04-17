# Nomii AI — Release Process

This is the authoritative procedure for shipping a new version of Nomii to
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
| Staging | https://nomii-staging.pontensolutions.com | `:edge` | Proxmox VM (`nomii-prod` SSH alias → `10.0.100.2`) | Preview every merge to main before release |
| Prod (SaaS) | https://nomii.pontensolutions.com | (built from git tag) | Hetzner Helsinki (`nomii@204.168.232.24`) | Live customer traffic |
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

Staging is a permanently-running copy of Nomii on the Proxmox VM, using the
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

Three ways to keep staging current with the latest `:edge`:

- **Manual**: `ssh nomii-prod "bash /root/nomii-staging/refresh-staging.sh"` after every merge
- **Systemd timer**: `/etc/systemd/system/nomii-staging-refresh.timer` polls every 5 min (enable with `systemctl enable --now nomii-staging-refresh.timer`)
- **Watchtower**: optional container in the staging compose that watches GHCR and recreates on digest change

The refresh script is idempotent — if `:edge` hasn't changed, it's a no-op.

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
ghcr.io/jafools/nomii-backend:1.2.3      ← note: no "v" prefix on image tags
ghcr.io/jafools/nomii-backend:1.2
ghcr.io/jafools/nomii-backend:stable
ghcr.io/jafools/nomii-backend:latest
(same 4 tags for nomii-frontend)
```

> **Git tags vs. Docker image tags:** we push `v1.2.3` to git, but the docker
> image tag is `1.2.3` (no `v`). This is the docker/metadata-action SemVer
> convention. Use the `v`-prefixed form when checking out git, the plain form
> when pinning `image:` in a compose file.

Wait for the GitHub Actions run to go green (~5–10 min).

## Deploying SaaS (Hetzner) to the new release

```bash
# Fetch the tag on Hetzner and rebuild
ssh nomii@204.168.232.24 "cd ~/nomii-ai && git stash && git fetch --tags && git checkout v1.2.3 && git stash pop && docker compose up -d --build backend frontend"

# Verify
ssh nomii@204.168.232.24 "curl -s http://127.0.0.1:3001/api/health"
```

Keep SaaS on the exact tag, not `main`. That way `git describe` on the box
tells you what version customers are running.

## On-prem customer experience

Customers' `docker-compose.selfhosted.yml` pins `ghcr.io/jafools/nomii-backend:stable`
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
ssh nomii@204.168.232.24 "cd ~/nomii-ai && git stash && git checkout v1.2.2 && git stash pop && docker compose up -d --build backend frontend"
```

For on-prem customers: retag `:stable` on GHCR to point at the previous
version. Fastest way is to re-run the docker-publish workflow manually
against the old tag:

```
GitHub → Actions → Publish Docker Images → Run workflow → Select tag: v1.2.2
```

Then tell customers to `docker compose pull && up -d`.

## Tag cheat sheet

| Tag | Moves when | Who pins here |
|-----|------------|---------------|
| `:edge` | Every push to main | Internal / staging only |
| `:1.2.3` | When tag is cut | Customers who want an exact version |
| `:1.2` | When any 1.2.x tag is cut | Customers who want all 1.2 patches |
| `:stable` | When any tag is cut | **Default for self-hosted customers** |
| `:latest` | When any tag is cut | Legacy — treat as alias for `:stable` |
