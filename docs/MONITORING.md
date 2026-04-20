# Shenmay AI — Uptime Monitoring

> Addresses **Finding #14** from [`AUDIT-2026-04-17.md`](AUDIT-2026-04-17.md):
> No external uptime monitoring on the SaaS. Until this is in place, Austin
> learns about outages when a customer tells him.

---

## TL;DR — recommended setup (free UptimeRobot)

External HTTP check against the production health endpoint every 5 minutes.
Alerts to email when the check fails twice in a row (so one flaky ping
doesn't wake you at 3am).

1. Sign up at https://uptimerobot.com (free tier: 50 monitors, 5-min interval)
2. Add a **HTTP(s)** monitor:
   - **URL:** `https://nomii.pontensolutions.com/api/health`
   - **Monitoring interval:** 5 minutes
   - **Keyword monitoring (recommended):** enable, keyword = `"ok"` — catches
     cases where the endpoint returns 200 but the response body is broken
     (DB disconnected, etc.). Without this you only catch hard 5xx/timeouts.
   - **Alert contacts:** add Austin's email
3. Add a second monitor for **staging** — `https://nomii-staging.pontensolutions.com/api/health` — same settings but with 30-minute alert delay (staging outages are not urgent).

---

## Why `/api/health`?

`server/src/index.js` exposes `GET /api/health` that returns:

```json
{ "status": "ok", "service": "nomii-backend", ... }
```

This endpoint hits the DB (`SELECT 1`) so a DB-down outage fails the check
even though nginx is still serving. See the route definition for the exact
shape. If you change the response body, update this doc and any keyword
checks above.

---

## Alerting — what Austin wants to see

- **Hard down** (HTTP 5xx / timeout, ≥ 2 checks in a row): email alert
- **Soft degradation** (single failed check, then recovered): no alert — noisy
- **Recovery:** email when it comes back up

Cloudflare's "Keep Alive" / "Always Online" is not a substitute — it caches
static pages, doesn't probe the backend.

---

## Fallback: self-hosted ping from pontenprox

If the external UptimeRobot route ever has a problem (billing, account, etc.),
`pontenprox` can act as a stopgap monitor since it's always running anyway
(it hosts staging + Lateris). The systemd timer below does a `curl` against
the Hetzner health endpoint every 5 minutes and logs failures; pair it with
`mail` or a simple webhook if you want alerts.

**Not set up yet** — only set up if UptimeRobot is down or unavailable.
Template:

```bash
# /root/nomii-uptime/check-hetzner.sh
#!/usr/bin/env bash
set -euo pipefail
URL="https://nomii.pontensolutions.com/api/health"
LOG=/var/log/nomii-uptime.log
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! curl -fsS --max-time 10 "$URL" | grep -q '"status":"ok"'; then
  echo "$TS DOWN" >> "$LOG"
  exit 1
fi
echo "$TS OK" >> "$LOG"
```

```ini
# /etc/systemd/system/nomii-uptime.service
[Unit]
Description=Shenmay Hetzner health check
[Service]
Type=oneshot
ExecStart=/root/nomii-uptime/check-hetzner.sh
```

```ini
# /etc/systemd/system/nomii-uptime.timer
[Unit]
Description=Run nomii-uptime every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now nomii-uptime.timer`.

---

## Future: richer observability

Out of scope for solo-dev launch. Worth considering once customer count > ~10:

- **Synthetic customer flow:** automate the signup → verify-email → login →
  widget-test flow every hour. Catches product regressions, not just
  infrastructure.
- **Prometheus + Grafana:** the self-hosted option. Overkill for one Hetzner
  CPX22, but standard once there are multiple tenants with different SLAs.
- **Backend error-rate alerts:** instrument the error handler to count 5xx
  responses and alert if rate > N/minute.

None of these are needed today. A single UptimeRobot monitor on `/api/health`
closes the "customer tells me first" gap.
