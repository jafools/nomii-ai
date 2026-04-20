# Shenmay AI — Personalized AI Agent Platform

> *"Känn mej"* ("know me" in Swedish, pronounced *Shen-may*) — Industry-agnostic platform for deploying persistent, personalized AI agents that deeply understand each customer.

## What is Shenmay AI?

Shenmay AI is a B2B SaaS platform where companies (tenants) integrate personalized AI agents for their customers. Each customer gets an agent powered by two core files:

- **Soul** — *Who the agent is* for this customer (tone, complexity, communication style)
- **Memory** — *What the agent knows* (personal profile, data, conversation history, goals)

The first vertical is **retirement planning** with Covenant Trust as the demo tenant.

---

## 🚀 For Claude Code Sessions

**Read these first:**
1. `CLAUDE_CODE_SETUP.md` — Complete operations guide for Claude Code (server access, deployment, debugging)
2. `SESSION_HANDOFF.md` — Current system state and critical ops notes
3. `SPRINT_HANDOFF.md` — What shipped this sprint, migration status, bugs fixed

---

## Quick Start (Docker)

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Build and start all containers
docker compose build
docker compose up -d

# 3. Initialize the database
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh

# 4. Open http://localhost
```

## Quick Start (Local Development)

```bash
# Prerequisites: Node.js 18+, PostgreSQL 14+

# 1. Create database
createdb nomii_ai

# 2. Install dependencies
npm run install:all

# 3. Set up database
cd server && npm run db:migrate && npm run db:seed && cd ..

# 4. Start both server and client
npm run dev
```

- **App**: http://localhost:3000
- **API**: http://localhost:3001/api/health

## Project Structure

```
nomii-ai/
├── docker-compose.yml          # Docker orchestration (4 services: db, backend, frontend, cloudflared)
├── DEPLOYMENT.md               # Proxmox deployment guide
├── CLOUDFLARE_TUNNEL.md        # Public URL setup via Cloudflare Tunnel
├── SESSION_HANDOFF.md          # Current state, build history, errors log, what's next
├── server/                     # Express.js backend
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.js            # Server entry
│   │   ├── db.js               # PostgreSQL connection
│   │   ├── engine/
│   │   │   ├── promptBuilder.js    # Core: Soul + Memory + Data → system prompt
│   │   │   └── memoryUpdater.js    # Auto-updates Memory after sessions
│   │   └── routes/
│   │       ├── chat.js         # Chat endpoint (prompt → LLM → response)
│   │       ├── customers.js    # Customer CRUD + Soul/Memory
│   │       ├── advisors.js     # Advisor dashboard data
│   │       ├── conversations.js # Session management
│   │       ├── flags.js        # Escalation/alert system
│   │       └── tenants.js      # Multi-tenant config
│   ├── db/
│   │   ├── migrations/         # SQL schema (industry-agnostic)
│   │   └── seeds/              # Covenant Trust demo data
│   └── data/personas/          # Soul + Memory JSON files (3 personas)
├── client/                     # React + Tailwind frontend
│   ├── Dockerfile
│   ├── nginx.conf              # Reverse proxy + SPA config
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx            # Dashboard
│       │   ├── CustomerChat.jsx    # Chat interface
│       │   ├── AdvisorDashboard.jsx # Flags + oversight
│       │   └── CustomerProfile.jsx  # Soul/Memory/Data viewer
│       └── lib/api.js          # API client
└── scripts/
    └── setup-db.sh             # Docker DB initialization
```

## Architecture Highlights

- **Industry-agnostic**: `customer_data` table stores any structured data (financial accounts, insurance policies, medical records, etc.)
- **Tenant verticals**: Each tenant configures their industry, terminology, onboarding categories, and compliance rules
- **Soul + Memory**: Persistent per-customer agent identity and knowledge
- **Human-in-the-loop**: Flag system alerts advisors to escalations, confusion, exploitation concerns
- **LLM-configurable**: Claude API integrated via `llmService.js`; model switchable per tenant
- **Embeddable widget**: Drop-in `<script>` tag for any website; own JWT auth layer; live at `hub.hopeforthisnation.com`
- **Public API**: Exposed at `https://api.pontensolutions.com` via Cloudflare Tunnel (PoC infrastructure)

## Connecting Claude API

1. Edit `.env`: set `LLM_PROVIDER=claude` and `CLAUDE_API_KEY=sk-ant-...`
2. Install SDK: `cd server && npm install @anthropic-ai/sdk`
3. Uncomment Claude integration in `server/src/routes/chat.js`
4. Restart: `docker compose restart backend`

## Demo Personas (Covenant Trust)

| Name | Age | Profile |
|------|-----|---------|
| Margaret Chen | 67 | Conservative, moderate tech, healthcare anxiety, gardening metaphors |
| Jim Thompson | 72 | Very conservative, low tech, widower, simple language |
| Diana & Carlos Rivera | 62/64 | Moderate risk, tech-savvy, blended family, data-driven |

## Full Documentation

- `SESSION_HANDOFF.md` — Current system state, what's been built, errors & fixes, what's next
- `DEPLOYMENT.md` — Proxmox deployment guide
- `CLOUDFLARE_TUNNEL.md` — Cloudflare Tunnel setup guide (public URL via `cloudflared` Docker service)
- `Covenant Trust/SHENMAY_AI_ARCHITECTURE.md` — Full architecture blueprint
- `Covenant Trust/DECISIONS_LOG.md` — All product decisions (21 decisions logged)
