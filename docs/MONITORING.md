# Shenmay AI — Uptime Monitoring

> Addresses **Finding #14** from [`AUDIT-2026-04-17.md`](AUDIT-2026-04-17.md):
> No external uptime monitoring on the SaaS. Until this is in place, Austin
> learns about outages when a customer tells him.

---

## TL;DR — recommended setup (free UptimeRobot)

Three HTTP(S) monitors against prod, 5-minute interval. Free tier allows 50
monitors so there's room to grow; these three cover the blast-radius of any
customer-visible outage.

1. Sign up at https://uptimerobot.com (free tier: 50 monitors, 5-min interval).
2. Add **Alert contact**: Austin's email. Set SMS for paging later if needed.
3. Add the three monitors below.

### Monitor 1 — backend deep health (DB-aware)

| Field | Value |
|---|---|
| Monitor Type | `HTTP(s) — Keyword` |
| Friendly Name | `Shenmay prod — /api/health` |
| URL | `https://shenmay.ai/api/health` |
| Keyword Type | `exists` |
| Keyword | `shenmay-ai` |
| Monitoring Interval | `5 minutes` |
| HTTP Method | `GET` |
| Alert When Down After | `2 consecutive failures` (≈ 10 min) |
| Alert Contact | Austin (email) |

Why keyword `shenmay-ai`: unique to Shenmay's healthy response, distinguishes a
real `{"status":"ok","service":"shenmay-ai"}` from a Cloudflare error page that
happens to return 200, or a stale cached response from a different app.

Why this endpoint matters: since PR #96, `/api/health` runs `SELECT 1` against
Postgres. A DB-down outage now returns HTTP 503 with `"status":"degraded"`,
failing both the status-code check and the keyword check. Previously the
endpoint was a hardcoded 200 and could not see a disconnected DB — the
monitor only caught hard crashes of the backend process or nginx.

### Monitor 2 — apex marketing-to-app redirect

| Field | Value |
|---|---|
| Monitor Type | `HTTP(s)` |
| Friendly Name | `Shenmay prod — apex` |
| URL | `https://shenmay.ai/` |
| Monitoring Interval | `5 minutes` |
| Alert When Down After | `2 consecutive failures` |
| Alert Contact | Austin (email) |

Catches: Cloudflare tunnel down, nginx down, SSL expiry, frontend container
not serving, apex redirect broken.

### Monitor 3 — embed.js (customer-visible widget distribution)

| Field | Value |
|---|---|
| Monitor Type | `HTTP(s) — Keyword` |
| Friendly Name | `Shenmay prod — embed.js` |
| URL | `https://shenmay.ai/embed.js` |
| Keyword Type | `exists` |
| Keyword | `widget-key` |
| Monitoring Interval | `5 minutes` |
| Alert When Down After | `2 consecutive failures` |
| Alert Contact | Austin (email) |

Why: `embed.js` is loaded on every customer's website. If it 404s or returns
garbage, widget rendering breaks everywhere at once. The `widget-key` keyword
is what the embed script uses to read `data-widget-key="..."` from the host
page — its presence confirms the script is the real file, not a Cloudflare
error.

---

## Alert policy — what Austin wants to see

- **Hard down** (HTTP 5xx / timeout / keyword missing, ≥ 2 checks in a row):
  email alert.
- **Soft degradation** (single failed check, then recovered): no alert —
  noisy and not actionable.
- **Recovery:** email when the monitor comes back up.

Cloudflare's "Always Online" is not a substitute — it caches static pages and
doesn't probe the backend.

---

## Optional: staging monitor

`https://nomii-staging.pontensolutions.com/api/health` is publicly reachable
and auto-refreshes to `:edge` every 5 min. A monitor on it helps catch merges
that break the happy path before a customer-hitting tag, but it's noisy
during active dev. If you add it, set the interval to 30 min and route
alerts to a separate "staging" contact so they don't page with prod alerts.

Skip entirely until customer volume means a staging break is costing signal
real teams would notice.

---

## Resend bounce / complaint webhook (future follow-up)

**Not implemented yet** — no server-side receiver exists. Placeholder here so
this is a one-step change when the time comes.

1. Add `POST /api/webhooks/resend` to `server/src/routes/` — Resend signs
   webhook bodies with `Svix-Signature`; verify before trusting. Schema:
   <https://resend.com/docs/dashboard/webhooks/event-types>.
2. On `email.bounced` / `email.complained` events, log + flag the recipient
   so the app can stop sending to persistently-bouncing addresses (avoids
   Resend rate-limiting our whole account).
3. Wire the endpoint into UptimeRobot as a *heartbeat* monitor (inverse of
   normal — expect a ping every N minutes, alert if silent). UptimeRobot's
   free tier doesn't have heartbeat, so this step needs the paid plan or a
   self-hosted Uptime Kuma.

Gate this on: first real customer hits a bounce + we discover we had no
visibility. Until then, Resend's dashboard at `resend.com` is the source of
truth and Austin checks it when something smells off.

---

## Fallback: self-hosted ping from pontenprox

If UptimeRobot ever has a problem (billing, account, etc.), `pontenprox` can
act as a stopgap monitor since it's always running (it hosts staging +
Lateris). The systemd timer below does a `curl` against the Hetzner health
endpoint every 5 minutes and logs failures; pair it with `mail` or a simple
webhook if you want alerts.

**Not set up yet** — only set up if UptimeRobot is down or unavailable.

Template:

```bash
# /root/shenmay-uptime/check-hetzner.sh
#!/usr/bin/env bash
set -euo pipefail
URL="https://shenmay.ai/api/health"
LOG=/var/log/shenmay-uptime.log
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! curl -fsS --max-time 10 "$URL" | grep -q '"status":"ok"'; then
  echo "$TS DOWN" >> "$LOG"
  exit 1
fi
echo "$TS OK" >> "$LOG"
```

```ini
# /etc/systemd/system/shenmay-uptime.service
[Unit]
Description=Shenmay Hetzner health check
[Service]
Type=oneshot
ExecStart=/root/shenmay-uptime/check-hetzner.sh
```

```ini
# /etc/systemd/system/shenmay-uptime.timer
[Unit]
Description=Run shenmay-uptime every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now shenmay-uptime.timer`.

---

## Future: richer observability

Out of scope for solo-dev launch. Worth considering once customer count > ~10:

- **Synthetic customer flow:** reuse the existing `e2e-saas` Playwright suite
  on a scheduled run against prod (GitHub Actions cron) — catches product
  regressions, not just infra. The nightly `e2e-repeatability.yml` cron is
  the staging-facing version; a 2-hourly prod-facing subset would be next.
- **Prometheus + Grafana:** the self-hosted option. Overkill for one Hetzner
  CPX22 but standard once there are multiple tenants with different SLAs.
- **Backend error-rate alerts:** instrument the error handler to count 5xx
  responses and alert if rate > N/minute.

None of these are needed today. The three UptimeRobot monitors above close
the "customer tells me first" gap.
