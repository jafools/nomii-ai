# Shenmay AI — Decisions Log

> Running record of product and technical decisions.

---

## Decision 001 — Business Model
**Date:** 2026-03-05
**Decision:** B2B model. Sell to financial advisory firms (banks, trust companies) who offer the AI agent to their retirement clients.
**Rationale:** Firms already have the customer data and client relationships. We provide the personalization layer.

## Decision 002 — Product Name
**Date:** 2026-03-05
**Decision:** "Shenmay AI" — plays on "Know Me." Overarching brand for all tenants.
**Rationale:** Captures the core value proposition of personalized, persistent AI agents.

## Decision 003 — Agent Identity
**Date:** 2026-03-05
**Decision:** Consistent brand identity per tenant (e.g., "Covenant Advisor"), not unique agent names per customer. The agent *knows* you deeply, but represents the firm's brand.
**Rationale:** More sellable to B2B customers — they want their brand front and center.

## Decision 004 — Soul.md Generation
**Date:** 2026-03-05
**Decision:** Auto-generated from a combination of tenant baseline + customer demographics (age, tech comfort, literacy) + onboarding interview responses. Evolves over time based on interactions.
**Rationale:** Ensures personalization from day one while improving over time.

## Decision 005 — Onboarding Approach
**Date:** 2026-03-05
**Decision:** Agent-led freeform conversation (not forms). Agent has an internal checklist but approaches topics naturally.
**Rationale:** Core differentiator — "no forms, just a warm conversation." Better experience for retirees.

## Decision 006 — Human-in-the-Loop
**Date:** 2026-03-05
**Decision:** Human advisors are always in the loop. AI handles daily interactions; humans handle high-stakes decisions. Flagging system alerts advisors when needed.
**Rationale:** Regulatory safety + trust + better outcomes for complex decisions.

## Decision 007 — Advice Framing
**Date:** 2026-03-05
**Decision:** Educational/informational only. Never prescriptive. "Many people consider..." not "You should..."
**Rationale:** Regulatory safety — avoid SEC/FINRA compliance issues in MVP.

## Decision 008 — LLM Provider
**Date:** 2026-03-05
**Decision:** Start with Claude. Architecture supports future model switching (configurable per tenant).
**Rationale:** Best for nuanced, empathetic conversations. Flexibility built in for future.

## Decision 009 — Database
**Date:** 2026-03-05
**Decision:** PostgreSQL (real database, not file-based).
**Rationale:** Financial data needs relational integrity. Multi-tenancy requires proper isolation.

## Decision 010 — Demo Personas
**Date:** 2026-03-05
**Decision:** 3 customer personas for Covenant Trust demo.
**Personas:**
1. **Margaret Chen** (67) — Conservative, moderate tech, married, worried about healthcare. Former teacher.
2. **Jim Thompson** (72) — Very conservative, low tech, widower, simple needs. Former machinist.
3. **Diana & Carlos Rivera** (62/64) — Moderate risk, tech-savvy, early retirees, blended family. Complex finances.
**Rationale:** Diverse profiles showcase the agent's ability to adapt personality and approach.

## Decision 011 — MVP API
**Date:** 2026-03-05
**Decision:** Build with mock agent responses initially. Wire in Claude API key when available.
**Rationale:** Unblocks development while API key is pending.

## Decision 012 — First Customer Target
**Date:** 2026-03-05
**Decision:** Covenant Trust is the target demo customer.
**Rationale:** Existing relationship / potential customer.

## Decision 013 — Platform Scope: Industry-Agnostic
**Date:** 2026-03-05
**Decision:** Shenmay AI is an industry-agnostic personalized agent platform. Retirement planning (Covenant Trust) is the first vertical, but the Soul/Memory architecture should work for any industry — healthcare, insurance, wealth management, education, etc.
**Impact:** Database schema generalizes "financial_accounts" into flexible "customer_data". Prompt builder becomes template-driven per vertical. Tenant config includes industry/vertical type.
**Rationale:** Dramatically increases TAM. The core insight (persistent, personalized AI agents with Soul + Memory) is valuable across any domain where deep customer knowledge matters.

## Decision 014 — Infrastructure: Docker on Proxmox
**Date:** 2026-03-05
**Decision:** Deploy PoC using Docker containers on Proxmox. Industry-standard containerized setup from day one — no shortcuts.
**Stack:** Docker Compose with PostgreSQL, Node.js backend, React frontend (nginx), and Traefik reverse proxy.
**Rationale:** Do it right from the start so there's no migration pain later. Proxmox is ready and available.

## Decision 015 — Shenmay AI Brand Hierarchy
**Date:** 2026-03-05
**Decision:** Shenmay AI is the root platform company. Tenants (like Covenant Trust) are customers who integrate Shenmay agents into their own platforms. Each tenant operates in a specific "vertical" (retirement, healthcare, etc.) which configures the agent's domain knowledge and onboarding flows.
**Rationale:** Clean separation between platform (Shenmay) and customers (tenants). Enables different verticals with shared infrastructure.

## Decision 016 — Dual Deployment Model (Platform-First)
**Date:** 2026-03-09
**Decision:** Shenmay AI supports two deployment models:
- **Model A: White-Label Platform (PRIMARY FOCUS)** — Full branded web application hosted by Shenmay AI. Tenants' customers log in directly to a Shenmay-hosted app styled with the tenant's branding. This is the primary model and the focus of the Covenant Trust PoC.
- **Model B: Embeddable Widget/SDK (FUTURE)** — A JavaScript widget that companies drop into their existing customer portals. Shares the same backend/API as Model A but with a lightweight embeddable frontend.
Both models share the same core backend: Soul/Memory engine, prompt builder, conversation management, flag system, and Claude integration.
**Rationale:** Platform-first (Model A) lets us deliver a complete, polished PoC for Covenant Trust without requiring them to have existing web infrastructure. Embeddable widget (Model B) opens the market to companies with established portals who want to "add AI" without rebuilding. Building Model A first naturally creates the API layer that Model B needs.

## Decision 017 — Authentication: JWT + bcrypt, Three Roles
**Date:** 2026-03-09
**Decision:** JWT-based stateless authentication with bcrypt password hashing. Three user roles:
- **Customer** — Logs in to chat with their personalized agent, can only access own data
- **Advisor** — Logs in to monitor flags, review conversations, view assigned customers
- **Tenant Admin** — Advisor with role='admin', full access to tenant settings, branding, user management
All API routes enforce tenant isolation via JWT claims (tenant_id). Cross-tenant data access is blocked at middleware level.
**Stack:** jsonwebtoken (HS256), bcrypt (10 salt rounds), Express middleware chain
**Rationale:** Stateless JWT scales for multi-tenant SaaS. Three roles cover the PoC needs (customers, advisors, admins). Admin is implemented as an advisor role variant rather than a separate table, keeping the schema simple. Tenant isolation at the middleware level ensures security by default.

## Decision 018 — Embed Widget System (Model B Implemented)
**Date:** 2026-03-10
**Decision:** Built the full embeddable widget system (Model B from Decision 016) as a drop-in `<script>` tag integration.
**Components built:**
- `server/src/routes/widget.js` — Two public API endpoints: `POST /api/widget/session` (validates widget key + user email, auto-creates unknown customers, returns 15-min widget JWT) and `POST /api/widget/chat` (widget-authed chat endpoint, full prompt pipeline, saves messages to DB)
- `server/public/embed.js` — Drop-in script. Reads `data-*` attributes, injects floating chat bubble + iframe. Mobile responsive.
- `server/public/widget.html` — Self-contained chat UI in the iframe. No framework, no external deps. Animated typing indicator, auto-resize textarea, error/loading states.
- `server/db/migrations/004_widget_api_key.sql` — Adds `widget_api_key VARCHAR(64) UNIQUE` to tenants table.
**Auth model:** Widget key → identifies tenant. User email → passed by host page. Widget JWT → 15-min token issued by `/session`, consumed by `/chat`. Separate from main app JWT layer.
**Rationale:** Enables any tenant with an existing web app to embed Shenmay agents without adopting the full platform frontend. Required for Hope for This Nation (Decision 019).

## Decision 019 — Hope for This Nation as First External Tenant
**Date:** 2026-03-10
**Decision:** Hope for This Nation (HFTN) is the first real-world tenant outside of Covenant Trust, operating in the ministry vertical.
**Details:**
- Tenant ID: `22222222-2222-2222-2222-222222222222`
- Slug: `hope-for-this-nation`
- Agent name: Beacon
- Colors: `#4A2C8F` (purple) / `#F5A623` (gold)
- Widget key: `4e8bb9c05b6ffc22004a4edc65f1e9e43b291014d5803384722e5c7fe001c907`
- Admin: `ajaces@gmail.com`
- Host site: `hub.hopeforthisnation.com` (built in Lovable, backed by Supabase)
**Rationale:** Real-world validation of the widget embed model with an actual website (Lovable/Supabase stack). Ministry is a new vertical, demonstrating industry-agnostic architecture.

## Decision 020 — Cloudflare Tunnel for PoC Public Access
**Date:** 2026-03-11
**Decision:** Use Cloudflare Tunnel (`cloudflared` as a Docker Compose service) to expose the Proxmox-hosted backend publicly, rather than port forwarding or moving to a VPS.
**Implementation:**
- `cloudflared` added as a 4th service in `docker-compose.yml`
- Tunnel token stored as `CLOUDFLARE_TUNNEL_TOKEN` in `.env`
- Public routes: `api.pontensolutions.com` → `backend:3001`, `app.pontensolutions.com` → `frontend:80`
- Full setup documented in `CLOUDFLARE_TUNNEL.md`
**This is explicitly a PoC/temporary infrastructure decision.** The long-term production path is a proper VPS (DigitalOcean/Hetzner) or cloud provider with managed infrastructure, not a home Proxmox server behind a tunnel.
**Rationale:** Fastest path to a publicly reachable API for widget integration testing. Free, permanent URL, no port forwarding. Zero code changes to the backend. Easy to tear down when migrating to real infrastructure.

## Decision 021 — Widget Conversation Status: 'active' not 'open'
**Date:** 2026-03-11
**Decision:** Widget routes use `status = 'active'` when creating or querying conversations, consistent with the DB check constraint `('active', 'ended', 'escalated')`.
**Bug fixed:** Initial widget implementation used `status = 'open'` which violated the `conversations_status_check` constraint and caused widget session creation to fail with a DB error.
**Root cause:** The widget was written independently from the main app routes and used an intuitive but incorrect status value. The constraint was defined in `001_initial_schema.sql` with `'active'` as the live-conversation status.
**Lesson:** Always check schema constraints when writing new DB insert paths. The allowed values are `active` (ongoing), `ended` (completed), `escalated` (flagged for human review).

## Decision 022 — Phase 3: Self-Serve Tenant Portal at pontensolutions.com
**Date:** 2026-03-11
**Decision:** Phase 3 is a self-serve tenant onboarding and management portal hosted at `pontensolutions.com`. Tenants sign up, configure their agent, install the widget, upload data, and monitor everything — without any manual Shenmay backend work.
**Architecture:** pontensolutions.com (Lovable frontend) calls `api.pontensolutions.com` directly. All business logic stays in the Shenmay API.
**Proof of success:** Re-onboard Hope for This Nation entirely through the portal, replacing all manual seeding.

## Decision 023 — Tenant Admin Auth is Separate from Customer/Advisor Auth
**Date:** 2026-03-11
**Decision:** Tenant portal users get their own `tenant_admins` table and portal JWT, separate from the customer/advisor/admin JWT used in the main app. Allows multi-user portal accounts in the future.
**Rationale:** Clean separation prevents auth model complexity and makes it easy to add SSO or API key auth later.

## Decision 024 — Widget Verification via Phone-Home
**Date:** 2026-03-11
**Decision:** When `embed.js` loads on a tenant's website, it silently calls `POST /api/widget/verify` with the widget key, setting `widget_verified_at` on the tenant record. The wizard polls this and flips Step 4 to ✅ automatically — no manual confirmation needed.
**Rationale:** Eliminates "did it work?" uncertainty for non-technical users. They install, refresh their site, and watch the connector turn green in real time.

## Decision 025 — WordPress Plugin as Primary Widget Install Method
**Date:** 2026-03-11
**Decision:** Build a downloadable Shenmay WordPress plugin (.zip) as the primary installation method. WordPress powers ~43% of websites. Plugin handles script injection automatically — tenant installs, activates, enters widget key in settings.
**Rationale:** Highest-value single deliverable for reach. Eliminates need for WordPress owners to touch code. ~50 lines of PHP.

## Decision 026 — Products/Services Table for Agent Context
**Date:** 2026-03-11
**Decision:** Add a `tenant_products` table. Tenants upload products/services (CSV or manual) during onboarding. `promptBuilder.js` is updated to include this data in the system prompt.
**Rationale:** Without product/service knowledge the agent can't discuss what the company actually does — essential for any real-world tenant.

## Decision 027 — Legal: ToS Acceptance + Right-to-Erasure
**Date:** 2026-03-11
**Decision:** Tenants must accept Terms of Service at signup (two required checkboxes — ToS + data consent). Acceptance timestamp and IP recorded in DB. Customer deletion via the portal anonymises PII (overwrites email/name/soul/memory, deletes customer_data rows, preserves conversation structure) rather than hard-deleting, creating a GDPR/CCPA-compliant audit trail.
**Rationale:** Shenmay AI is a data processor; tenants are data controllers. Recording ToS acceptance with timestamp+IP is the standard minimum for SaaS legal protection. Anonymisation on deletion satisfies right-to-erasure while preserving conversation history integrity.

## Decision 028 — Portal Route Base is /nomii (not /nomii-ai)
**Date:** 2026-03-11
**Decision:** All tenant portal routes live under `/nomii/*` on pontensolutions.com. The marketing/product page lives at `/products/nomii-ai`. The `/nomii` base is intentionally short for the authenticated app.
**Rationale:** This is what Lovable built. Shorter path is cleaner for authenticated app URLs.

---

*Add new decisions as they are made.*
