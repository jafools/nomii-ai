# Nomii AI — Release Process

This is the authoritative procedure for shipping a new version of Nomii to
customers. Follow it every time.

## Mental model

- **`main` is the integration branch** — protected. Always green. Never pushed to directly.
- **Feature work** happens on `feat/*`, `fix/*`, `chore/*` branches → opened as a PR → merged after CI passes.
- **Merging to `main` does NOT ship to customers.** It only builds a `:edge` image for internal testing.
- **The release act is `git tag vX.Y.Z`.** That's what triggers the customer-facing `:stable` and `:latest` images to rebuild.
- **SaaS (Hetzner) is deployed manually** by SSH'ing in and running `git pull && docker compose up -d --build`. Do it *after* the tag is cut, and pull the tag (not `main`) so SaaS and on-prem are on the same SHA.

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
ghcr.io/jafools/nomii-backend:v1.2.3
ghcr.io/jafools/nomii-backend:v1.2
ghcr.io/jafools/nomii-backend:stable
ghcr.io/jafools/nomii-backend:latest
(same 4 tags for nomii-frontend)
```

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
| `:v1.2.3` | When tag is cut | Customers who want an exact version |
| `:v1.2` | When any v1.2.x tag is cut | Customers who want all 1.2 patches |
| `:stable` | When any tag is cut | **Default for self-hosted customers** |
| `:latest` | When any tag is cut | Legacy — treat as alias for `:stable` |
