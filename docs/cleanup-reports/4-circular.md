# Circular Dependency Audit — Nomii AI

**Date:** 2026-04-15
**Worktree branch:** `worktree-agent-acd5a1b0`
**Base commit:** `0566e49` (chore(session): patch handoff — Phase 1A landing page already applied)
**Tool:** madge v8.0.0

## TL;DR

**Zero circular dependencies found** in either workspace. No code changes made. No commits produced.

| Workspace | Files processed | Cycles before | Cycles after |
|-----------|-----------------|---------------|--------------|
| `client/src` (JS/JSX/TS/TSX, with `@/` alias resolved) | 91 | 0 | 0 |
| `server/src` (JS, ESM) | 52 | 0 | 0 |

## Methodology

### Commands run

```bash
# 1. Plain defaults (client only picked up entry point)
npx madge --circular client/src
npx madge --circular server/src

# 2. With explicit extensions (client still missed alias-imported files)
npx madge --circular --extensions js,jsx client/src
npx madge --circular --extensions js,jsx server/src

# 3. Combined
npx madge --circular --extensions js,jsx server/src client/src

# 4. Client with full coverage (includes TS/TSX and resolves the `@/` alias
#    declared in client/vite.config.ts and client/tsconfig.json)
#    Uses a throwaway webpack config at /tmp/madge-webpack.cjs:
#      resolve.alias = { '@': path.resolve(__dirname, 'src') }
#      resolve.extensions = ['.js', '.jsx', '.ts', '.tsx']
cd client && npx madge --circular \
  --extensions js,jsx,ts,tsx \
  --webpack-config /tmp/madge-webpack.cjs src
```

### Raw output (load-bearing runs)

**Client (full coverage with alias + TS):**
```
- Finding files
Processed 91 files (1s) (71 warnings)

✔ No circular dependency found!
```

`--json` output: `[]`

**Server (`server/src`, JS only):**
```
- Finding files
Processed 52 files (808ms) (11 warnings)

✔ No circular dependency found!
```

### Why the first passes undercounted files

- The default run on `client/src` only processed 1 file because madge's default extension list (`.js`) missed the `.jsx`/`.ts`/`.tsx` sources, and the entry `main.jsx` imports `App.tsx` via `@/` which madge couldn't resolve without an alias config.
- Adding `--extensions js,jsx` lifted the client to 33 files. Files reachable only through `@/…` imports remained unresolved (the 16-file "Skipped" list from `--warning`).
- Adding a webpack config with `resolve.alias` and TS extensions lifted coverage to 91 files — matches the on-disk count (90 + `vite-env.d.ts`), so coverage is effectively complete.
- The server is pure Node ESM with relative imports only, so no alias config is needed; the first pass already covered the graph (52 files = all `server/src/**/*.js`).

The "warnings" in every run are module-not-found messages for third-party packages (`react`, `lucide-react`, etc.) and a few edge cases — not missed internal edges.

## Findings

None. No cycles to fix, defer, or catalogue.

### Critical assessment

The graph is well-shaped for a repo of this size:

- **Server (`server/src`)** follows a clean layered pattern: `index.js` → `routes/*` → `middleware/*` + `services/*` + `db.js` → `config/*`. Nothing loops.
- **Client (`client/src`)** is a typical React/Vite layout: `main.jsx` → `App.tsx` → `pages/**` and `components/**`, with leaves in `lib/`, `hooks/`, `contexts/`. `contexts/NomiiAuthContext.jsx` and `lib/nomiiApi.js` are widely consumed but neither imports back up the tree.

## Recommendations

- **HIGH:** none — nothing to do.
- **MEDIUM:** none.
- **LOW:** re-run this audit opportunistically (e.g., every 10–20 PRs or before major refactors) so a cycle can't slip in silently. The full-coverage command for the client is the one that matters — the plain `npx madge --circular client/src` gives a false sense of security because it only resolves the single reachable `.js` entry and ignores the TSX/alias graph.

## Implementation log

No code changes. No commits.

## Deferred

None.

## Housekeeping note

`docs/cleanup-reports/` did not exist prior to this run and was created only to hold this report. The file `docs/cleanup-reports/4-circular.md` is the single artifact added in this worktree.
