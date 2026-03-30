# Nomii AI — Phase 1 Deliverables

> Foundation package: database, personas, and agent engine.

---

## Project Structure

```
nomii-ai/
├── db/
│   ├── migrations/
│   │   └── 001_initial_schema.sql      ← Full PostgreSQL schema
│   └── seeds/
│       └── 001_covenant_trust_demo.sql  ← Covenant Trust + 3 personas + accounts + flags
│
├── personas/
│   ├── souls/
│   │   ├── margaret_chen_soul.json      ← Warm, simple, gardening metaphors
│   │   ├── jim_thompson_soul.json       ← Patient, direct, mechanical metaphors
│   │   └── rivera_family_soul.json      ← Professional, data-driven, concise
│   └── memories/
│       ├── margaret_chen_memory.json    ← Full profile + 3 session history
│       ├── jim_thompson_memory.json     ← Full profile + 2 session history (onboarding incomplete)
│       └── rivera_family_memory.json    ← Dual-person profile + 2 session history
│
├── engine/
│   └── promptBuilder.js                 ← Core prompt assembly engine + mock responses
│
└── docs/
    └── DECISIONS_LOG.md                 ← All product decisions tracked
```

---

## What's Built

### Database Schema (001_initial_schema.sql)
7 tables with full relationships, indexes, and auto-updating timestamps:
- **tenants** — Multi-tenant firm configuration (branding, compliance, LLM settings)
- **advisors** — Human financial advisors per firm
- **customers** — Retirees with Soul + Memory stored as JSONB
- **financial_accounts** — Flexible account storage (401k, IRA, pension, real estate, etc.)
- **conversations** — Chat sessions with AI-generated summaries
- **messages** — Individual messages with metadata
- **flags** — Escalation and alert system

### Seed Data (001_covenant_trust_demo.sql)
- Covenant Trust as tenant (green branding, compliance rules configured)
- 3 human advisors (James Rodriguez, Sarah Kim, Michael Torres)
- 3 customer profiles with complete financial accounts
- Advisor-customer assignments
- 6 sample flags (confusion, escalation, high emotion)

### 3 Customer Personas

| Persona | Age | Risk | Tech | Unique Angle |
|---------|-----|------|------|-------------|
| Margaret Chen | 67 | Conservative | Moderate | Healthcare anxiety, gardening metaphors, husband with health issues |
| Jim Thompson | 72 | Very Conservative | Low | Widower, learning finances at 72, short sessions, exploitation-risk monitoring |
| Diana & Carlos Rivera | 62/64 | Moderate | High | Dual-person, blended family, early retirement, complex Roth/ACA questions |

### Prompt Builder Engine (promptBuilder.js)
Assembles the full system prompt from:
1. **Identity** — Agent name, role, organization, core framing rules
2. **Compliance** — Disclaimers, restricted topics, escalation triggers
3. **Communication** — Tone, complexity, pace, personality rules (from Soul)
4. **Personal Profile** — Who the customer is, family, career, preferences (from Memory)
5. **Financial Data** — All accounts, income, expenses, debts
6. **Life Plan** — Travel, healthcare, housing, legacy, hobbies
7. **Conversation History** — All past session summaries with flags
8. **Agent Notes** — Personal observations about communication patterns
9. **Session Rules** — Onboarding tracking, end-of-session behavior

Also includes mock response generator for development without an API key.

---

## Next Steps

### To use this foundation:
1. Set up a PostgreSQL database
2. Run `001_initial_schema.sql` to create tables
3. Run `001_covenant_trust_demo.sql` to seed demo data
4. The Soul/Memory JSON files correspond to the customer records in the seed data
5. The prompt builder can be imported into any Node.js backend

### What to build next (Phase 1 continued):
- [ ] Backend API (Express/Fastify) — CRUD endpoints for customers, conversations, messages
- [ ] Chat endpoint — loads Soul + Memory, builds prompt, calls LLM (or mock), streams response
- [ ] Customer chat frontend — React + Tailwind, accessible design
- [ ] Post-session memory updater — auto-summarize and append to Memory
- [ ] Basic advisor dashboard — view customers, read conversations, see flags
