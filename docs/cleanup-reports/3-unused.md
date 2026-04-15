# Unused Code Cleanup — Report 3

**Branch:** `worktree-agent-a46aab08`
**Base commit:** `0566e49`
**Commits added:** 3 (atomic, grouped by category)
**Date:** 2026-04-15

## Summary

| Metric | Value |
|---|---|
| Client src files deleted | 48 |
| Server src files deleted | 0 |
| Client npm deps removed | 37 |
| Server npm deps removed | 1 |
| Source LOC removed | 3,958 |
| Total repo diff | +2,522 / -9,234 |
| Build status | PASS (`npm run build`) |
| Server load status | PASS (`node -e "require('./src/index.js')"`) |
| Client CSS bundle | 73.45 kB → 38.55 kB (−48%) |
| Client JS bundle (gzip) | 292.71 kB → 292.71 kB (unchanged — already tree-shaken by vite) |

The JS bundle size was already optimal because vite/rollup tree-shakes unused imports at build time. The cleanup's real wins are:
1. **Smaller `node_modules`** (~37 fewer direct deps + transitive)
2. **Smaller CSS bundle** (unused tailwind utilities no longer generated)
3. **Much cleaner repo for developers** (no more phantom "do I need this?" for 48 files)
4. **Faster `npm install` / docker build**

## Methodology

Tools used:
- `npx knip@latest` — workspace-by-workspace unused file/export/dependency detection
- `npx depcheck@latest` — cross-checked unused npm deps (more conservative)
- Manual `grep` across the ENTIRE repo (including `server/public/widget.html`, `docker-compose*.yml`, `scripts/*`, `tests/`, `nginx.conf`, docs) for every flagged identifier to verify no dynamic/string usage

Knip configs were added ephemerally for the analysis and **not committed** (project has no ongoing need for them).

### Raw findings (knip + depcheck)

**Server knip:** 0 unused files. 1 unused dep (`uuid`). 2 unlisted deps (`bcryptjs` — soft require fallback, kept). 27 unused internal exports (all are helper functions kept for future reuse and module clarity — **deferred**, not deleted).

**Client knip:** 49 unused files (45 `ui/*` + 3 hooks + NomiiDashboard.jsx + Step5TestAgent.jsx). 38 unused deps. 16 unused exports (all helpers — deferred, low value).

**Client depcheck:** 5 unused deps flagged (subset of knip's list — depcheck can't see that radix deps are reachable only via deleted files, so it marked a lot as "used"). Knip's broader scope confirmed the full 37.

## Findings

### 1. Unused files — client (48 deleted)

All **48 files verified unreachable** from `App.tsx` route tree via transitive import analysis.

**UI components (42):** `accordion`, `alert-dialog`, `alert`, `aspect-ratio`, `avatar`, `breadcrumb`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hover-card`, `input-otp`, `input`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `switch`, `table`, `tabs`, `textarea`, `toggle-group`, `toggle`.

**Verified unreachable by:** `grep -rn "from ['\"]@/components/ui/" client/src/` shows the *only* ui components imported from outside `components/ui/` are `badge`, `sonner`, `toast` (via `hooks/use-toast`), `toaster`, `tooltip`. All 42 above were only cross-referenced within the deleted set. None referenced from `tests/`, `server/public/widget.html`, docker configs, or nginx.

**Also deleted:**
- `client/src/components/ui/use-toast.ts` — 3-line passthrough re-exporting `@/hooks/use-toast`. Zero external importers (the real hook is `hooks/use-toast.ts` which is consumed by 5 real pages).
- `client/src/hooks/use-mobile.tsx` — only imported by deleted `ui/sidebar.tsx`.
- `client/src/hooks/useAIStream.ts` — zero imports anywhere in repo.
- `client/src/hooks/useRateLimit.ts` — zero imports anywhere in repo.
- `client/src/pages/nomii/NomiiDashboard.jsx` — 2-line placeholder "Coming Soon"; replaced by `NomiiDashboardLayout.jsx` used by App.tsx.
- `client/src/components/nomii/onboarding/Step5TestAgent.jsx` — not imported by `NomiiOnboarding.jsx` (which uses Step1–Step4 + StepApiKey + StepTools).

**Commit:** `810bca1`

### 2. Unused npm dependencies — client (37 removed)

After deleting the unused UI files, the deps these files required became truly unreachable. Each was grep-verified to be absent from reachable source.

- **Form stack:** `@hookform/resolvers`, `react-hook-form`, `zod` (consumed only by deleted `form.tsx`)
- **Animation/meta:** `framer-motion`, `react-helmet-async`, `react-markdown` (zero imports in any reachable .jsx/.tsx)
- **Radix primitives (25):** `@radix-ui/react-{accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toggle, toggle-group}` — each consumed solely by its corresponding deleted ui component.
- **Shadcn extras:** `cmdk` (command.tsx), `date-fns` (calendar.tsx), `embla-carousel-react` (carousel.tsx), `input-otp` (input-otp.tsx), `react-day-picker` (calendar.tsx), `react-resizable-panels` (resizable.tsx), `vaul` (drawer.tsx).

**Kept (still reachable):**
- `@radix-ui/react-toast` — used by `toast.tsx` (reachable via `toaster.tsx`)
- `@radix-ui/react-tooltip` — used by `tooltip.tsx` (reachable via App.tsx)
- `recharts` — used by `pages/nomii/dashboard/NomiiAnalyticsCharts.jsx` (imported by `NomiiOverview.jsx`)
- `sonner`, `next-themes` — used by reachable `sonner.tsx`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` — used widely
- `tailwindcss-animate` — referenced in `tailwind.config.ts` plugins array

**Commit:** `7b348f5`

### 3. Unused npm dependencies — server (1 removed)

- **`uuid`** — package.json listed it but `grep -n "require\(['\"]uuid" server/` returns 0 matches. The `uuid` string appearances in `dataRetention.js` and `portal.js` are **SQL type annotations** (`ANY($1::uuid[])`), not JS imports.

Kept: `bcryptjs` is attempted via `try { require('bcryptjs') } catch` in 2 files, with `bcrypt` as the fallback. Since only `bcrypt` is declared and installed, the `bcryptjs` try always throws and falls through harmlessly — a defensive pattern. Leaving untouched to preserve the fallback's intent.

**Commit:** `770b875`

## Recommendations

### HIGH (done this pass)
- Delete 48 unreachable client files
- Remove 37 unused client deps
- Remove 1 unused server dep

### MEDIUM (deferred — document below)
- **27 unused internal server exports** in `engine/promptBuilder.js`, `engine/memoryUpdater.js`, `engine/soulGenerator.js`, `services/cryptoService.js`, `services/llmService.js`, `middleware/subscription.js`, `middleware/auditLog.js`, `jobs/dataRetention.js`. These are helper functions exported but not consumed externally. Removing them adds churn without clear benefit — the functions are still *used* inside their own module. Keep for module readability.
- **16 unused client exports** (`nomiiApi.js` helper functions `getToken`, `apiRequest`, `getSetupStatus`, `search`, `uploadCustomersCsv`, `getPlans`, `deleteApiKey`, `testApiKey`; `useSubscriptionStatus`; `badgeVariants`/`BadgeProps`). Same reasoning — nomiiApi is a public API module for the client; helpers may be called in future features. Low-risk to defer.
- **Client devDeps `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@eslint/js`, `typescript-eslint`, `globals`** — no `eslint.config.*` file exists, so `npm run lint` would fail. Keeping because user may re-introduce linting; zero runtime impact.
- **`@tailwindcss/typography`** — not in tailwind plugins array, but may be used in future.
- **`@testing-library/jest-dom`, `@testing-library/react`, `jsdom`, `vitest`** — no `*.test.{tsx,jsx}` under `client/src`, but scripts in `client/package.json` reference vitest. Keeping for future tests.

### LOW
- Module re-organization: `client/src/hooks/use-toast.ts` is a large 186-line shadcn hook — fine to keep.

## Deferred (flagged by knip but NOT deleted)

| Item | Reason for deferral |
|---|---|
| Server internal exports (27) | All inside modules; exports allow future consumption, low churn benefit to remove |
| Client exports (16) in `nomiiApi.js`, `SubscriptionGate.jsx`, `badge.tsx`, `sonner.tsx`, `tooltip.tsx` | Public-API style modules; conservative to preserve |
| eslint/typescript-eslint ecosystem (7 devDeps) | No config file today, but lint workflow may be restored |
| `@tailwindcss/typography` | May be used by future content pages |
| `vitest`, `@testing-library/*`, `jsdom` | Test scripts referenced in package.json |
| `bcryptjs` "unlisted" in server | Defensive soft-require pattern with bcrypt fallback; not listed because project uses `bcrypt` (which IS listed); harmless |

## Implementation log

| SHA | Subject | Files |
|---|---|---|
| `810bca1` | chore(client): remove 48 unused files (shadcn/ui boilerplate + orphan hooks) | 48 deletions |
| `7b348f5` | chore(client): remove 37 unused npm dependencies | 2 files (package.json, package-lock.json); +2,520 / −5,259 |
| `770b875` | chore(server): remove unused uuid dependency | 2 files; +2 / −17 |

## Verification

```bash
# Client build
cd client && npm run build
# ✓ built in 4.65s — 2497 modules transformed
# CSS: 38.55 kB (down from 73.45 kB — 48% smaller)

# Server module graph
cd server && node -e "require('./src/index.js'); setTimeout(()=>process.exit(0), 1500);"
# All require() calls resolve, reaches app.listen()
```

## Out of scope (untouched)

Per mission brief:
- `docker-compose*.yml`, `Dockerfile*`, `nginx.conf`, `scripts/*` (kept)
- `server/src/migrations/*` (directory doesn't exist — mission referenced it as out-of-scope either way)
- `.env*`, `.docx`/`.pptx`/`.zip` files, `Company Logos/`, `.github/`, `.claude-flow/`, `node_modules/`
- `server/public/widget.html` and `server/public/embed.js`
- DB identifier `knomi` (no changes)

## Appendix: files kept that knip flagged but were actually reachable

None — every item knip flagged as "unused" in the deleted set was verified unreachable. The medium/low deferred items above were knip flags we consciously chose to keep.
