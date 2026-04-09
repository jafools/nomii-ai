# Nomii AI — Product Roadmap
*Last updated: 2026-04-09*

> Organised by time horizon and priority, not by session. For session-by-session build history see `SESSION_HANDOFF.md`. For current feature inventory see `FEATURES.md`.

---

## 🔴 Immediate (Pending ops / one-liners)

These are not features — they're unfinished deployment steps that block live demos or have lingering gaps.

| Task | Command / Notes |
|------|----------------|
| **Apply migration 022** (notifications table) | `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/022_notifications.sql` |
| **Enable `send_document` for Covenant Trust** | `UPDATE tenants SET enabled_tools = enabled_tools \|\| '["send_document"]'::jsonb WHERE slug = 'covenant-trust';` |
| **Verify pending migrations 015b–019 applied** | Check `\dt` in psql — `custom_tools`, `customer_data` (generic schema), `agent_soul_template` column must all exist |
| **Stripe Portal return URL env var** | Set `STRIPE_PORTAL_RETURN_URL=https://app.pontensolutions.com/nomii/dashboard/plans` in server `.env` |
| **Trademark filing** | Attorney sign-off on "Nomii AI" — Aware Inc. conflict flagged. Required before public commercial launch. |
| **GHCR packages public** | First workflow run will create packages; `make-public` job auto-runs. If it fails, add `PACKAGES_PAT` secret (classic PAT, `write:packages` scope) in repo Settings → Secrets |
| **Self-hosted parity audit** | End-to-end test of `scripts/install.sh` on a fresh VM; verify migrations, env vars, Stripe, email, auth all work identically to cloud | 

---

## 🔴 Next Session — Activate Self-Hosted on VPS + E2E Test

✅ **Complete on-prem single-tenant system is built (2026-04-09, afternoon).** One deployment step + validation:

| Task | Notes | Time |
|------|-------|------|
| **Apply migration 029** on VPS | `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/029_licenses.sql` | 2 min |
| **Set `NOMII_LICENSE_MASTER=true`** in VPS `.env` | Activates the `/api/license/validate` endpoint so self-hosted instances can call it | 1 min |
| **Redeploy VPS** | `cd ~/Knomi/knomi-ai && git pull && docker compose up --build -d` | 5 min |
| **End-to-end test** | Run `scripts/install.sh` on a local Ubuntu VM, verify trial mode works, test license upgrade path | 30 min |
| **Build pontensolutions.com `/nomii/license`** (optional for v1) | Simple page with Stripe payment links per plan; can use manual key issuance via admin API initially | 30 min |

**Why now:** On-prem deployments are trial-ready (no key required to start). Operators have a clear upgrade path. This unblocks the self-hosted product launch.

---

## 🟡 Sprint 1 — Demo-Ready & Growth (Next 1–2 sessions)

Features that close obvious product gaps or directly help acquire the first paying customers.

### Analytics Dashboard
The current dashboard shows four static numbers. No trends, no charts, no insight into what's actually working.

- Message volume chart (daily/weekly/monthly) — line or bar
- Escalation rate over time — is the AI getting better?
- Tool invocation breakdown — which tools are being called, how often
- Top customer engagement (most active customers, conversation lengths)
- Resolution rate (% of conversations ended without escalation)

**Why now:** A sales demo that shows "your AI handled 847 conversations this month with a 3% escalation rate" closes deals. Four static numbers don't.

---

### Conversation History in Widget (Returning Users)
Authenticated returning customers get a personalized greeting referencing past sessions, but they can't *scroll back* to see their actual message history in the widget. This is a jarring disconnect — the agent "remembers" them but the chat UI shows nothing.

- On widget open for an authenticated user, load the last N messages from the most recent conversation
- If conversation ended, show a subtle divider: "— New session —"
- Cap at last 20–30 messages to avoid scroll overload

**Why now:** Core UX gap. The anonymous → auth handoff we built lands the user in a visible conversation history — this is the obvious next step.

---

### Advisor Handoff Notes
When an advisor hands a conversation back to the AI agent, they currently leave no context. The agent starts fresh (using memory/soul), but it has no idea what the advisor discussed or decided during the human takeover window.

- Text field on the "Hand Back" confirmation modal: "Leave a note for the AI"
- Note stored on the conversation row
- Injected into the system prompt on the next AI turn as a `## ADVISOR NOTES` block (same style as `OPEN FOLLOW-UPS`)
- Cleared after the next AI session summary is written

**Why now:** Human takeover is already built. This is a single text field + one system prompt injection. High value, low effort.

---

### Custom Email Templates
All outbound emails (flag alerts, human reply notifications, invite emails, document delivery) use hardcoded Nomii branding. Tenants have no way to customise the sender name, tone, logo, or footer copy.

- Per-tenant `email_from_name` and `email_reply_to` fields in company settings
- Optional custom footer text (legal disclaimer, contact info, branding)
- Preview rendered in settings page before saving

**Why now:** Financial advisory firms are compliance-sensitive about anything that hits their clients' inboxes. A branded email from "Beacon at Covenant Trust" is far more professional than one from "Nomii AI."

---

## 🟢 Sprint 2 — Platform Depth (2–4 sessions out)

Features that deepen the product for existing customers and reduce churn.

### Agent Performance Metrics (Per-Conversation Scoring)
Currently there's no feedback loop on how well the AI is doing. Advisors can't tell if the agent is handling things well or making mistakes.

- Post-conversation quality score (1–5 stars) — advisor rates each conversation
- Flag rate per agent (how often does Beacon escalate vs. resolve independently?)
- Average conversation length vs. resolution rate correlation
- "Confusion signals" — detect exchanges where the agent said "I'm not sure" or asked a clarifying question more than twice
- Weekly digest email to tenant admins: top metrics + notable conversations

---

### Conversation Labels / Tags
Advisors need a way to categorise conversations for review, training, or compliance purposes.

- Per-tenant label library (e.g. "Needs Follow-Up", "Compliance Review", "Good Example", "Training Data")
- Apply labels from conversation list or detail view
- Filter conversations by label in the search/filter bar
- Labels visible in the concerns pane for flagged conversations

---

### Bulk Conversation Operations
Currently every action is per-conversation. High-volume advisors can't efficiently manage inboxes.

- Multi-select checkboxes in conversation list
- Bulk: mark read, bulk: apply label, bulk: archive (soft-close)
- "Select all unread" shortcut

---

### Widget Conversation History (Customer-Facing)
*Separate from the advisor view.* A customer who chatted 3 months ago should be able to open the widget and say "show me what we talked about last time."

- "Previous conversations" section in the widget (collapsed, expandable)
- Only shown to authenticated users
- Lists last 3–5 conversation summaries with date
- Customer can tap a summary to expand and read the original messages

---

### Scheduled Reports to Advisors
Advisors have no proactive digest — they only see data if they log in.

- Weekly email summary to each tenant admin: message volume, escalations, top flagged customers, new customers
- Configurable: weekly / monthly, day of week
- Built on `node-cron` (already in stack via `dataRetention.js`)

---

## 🔵 Sprint 3 — Scale & Distribution (1–2 months out)

Features that grow the customer base or enable the enterprise tier.

### Live Connector (Tier 3 Data Model)
Already marketed as a feature. Currently only stubbed out.

The agent calls the tenant's own API at query time to fetch live data — nothing stored in Nomii. This is the right architecture for regulated industries (financial firms that can't push client data to third-party clouds).

- Config fields: endpoint URL, auth type (bearer/API key), response mapping (field → label)
- Nomii calls the URL at tool-use time, passes customer `external_id` as a query param
- Response parsed and injected as tool result
- Timeout: 3s hard limit, graceful fallback message to customer

---

### Zapier / Webhook Consumer
Currently Nomii only *sends* webhooks (outbound). There's no way for external systems to trigger actions inside Nomii.

- Inbound webhook endpoint: `POST /api/v1/events`
- Supported triggers: customer.updated (re-sync), conversation.create (start a conversation from CRM), message.inject (push a message into an existing conversation)
- Useful for: CRM triggering a check-in after a financial event, nightly sync flagging customers with new activity

---

### Slack / Teams Notification Integration
Advisors currently get email notifications. Most advisory teams work in Slack or Teams all day.

- Per-tenant Slack webhook URL in settings (same UI pattern as existing outbound webhooks)
- Events: flag.created, human_reply (when in human mode), escalation
- Formatted Slack message with customer name, snippet, and deep link to dashboard conversation
- Microsoft Teams variant (same payload, different webhook format)

---

### Customer Self-Service Portal (Widget Add-On)
Right now the widget is purely conversational. Customers have no way to review their profile, see documents the agent has sent them, or update their own information.

- Authenticated-only "My Profile" tab in the widget (second tab alongside chat)
- Shows: name, email, recent conversation summaries, documents received via `send_document`
- "Update my details" form (name, phone) — writes to customer record via widget session
- Does NOT expose memory or soul — those remain advisor-only

---

### Production Infrastructure Migration
Still running on Proxmox. The plan is Hetzner CX22 (~$6/mo).

- Migrate containers to Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD — enough for current load)
- Set up automatic DB backups (Hetzner Volumes or S3-compatible)
- Point Cloudflare Tunnel to new host — zero downtime cutover
- Reference doc: `Nomii AI Phase 3 Plan.docx`

---

## ⚫ Strategic / Long-Horizon

These are not next sprints — they're 3–12 month items that depend on revenue or legal milestones.

### Legal Foundations (Required for EU + Enterprise)
- **Privacy Policy** — data collected, retention, sub-processors (Anthropic, SMTP host, Hetzner), GDPR rights. Use Termly or hire attorney.
- **Terms of Service** — acceptable use, liability limits, GLBA clauses for financial tenants
- **DPA template** — tenants sign as data controllers; Nomii is data processor
- **Sub-processor DPAs** — get DPAs from Anthropic (they have one), email provider, cloud host

### SOC 2 Type II
Required for enterprise financial firm onboarding. 6–12 month process. Start when first enterprise prospect is close to signing. Estimated cost: $15–40k (audit firm + tooling).

### BAA (Business Associate Agreement)
Required alongside SOC 2 for any tenant in financial services or healthcare. Nomii must sign individual BAAs per enterprise tenant.

### External CRM Connectors
Direct integrations with Orion, Envestnet, Redtail, Wealthbox — the dominant financial CRMs. Data fetched at query time via Live Connector. Enterprise tier unlock.

### On-Premise Deployment
✅ **Shipped 2026-04-09** — `docker-compose.selfhosted.yml` + `scripts/install.sh` + GHCR publish workflow. License enforcement (Option A) is the outstanding piece — tracked in Next Session above.

### Mobile Advisor App
React Native app for advisors: push notifications for flags + human replies, quick reply from phone, conversation list with triage indicators. Requires the existing REST API to be the source of truth (it is).

### Multi-Language Widget
The widget UI, greeting messages, and agent soul are all English-only. A Spanish-speaking customer gets an English interface. Requires: locale detection, translated widget UI strings, soul generation in the target language.

---

## Summary View

| Horizon | Items | What it unlocks |
|---------|-------|----------------|
| **Immediate** | 5 ops tasks | Demos work, Stripe billing works |
| **Sprint 1** | Analytics, widget history, handoff notes, email templates | First paying customer demos |
| **Sprint 2** | Scoring, labels, bulk ops, scheduled reports | Retention + advisor productivity |
| **Sprint 3** | Live Connector, Zapier, Slack, self-service portal, infra migration | Enterprise pipeline, distribution |
| **Strategic** | Legal, SOC 2, BAA, CRMs, on-premise, mobile | Enterprise contracts, EU market |
