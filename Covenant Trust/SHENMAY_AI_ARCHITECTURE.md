# Shenmay AI — Architecture & Product Blueprint

> *"Know Me"* — An industry-agnostic platform for deploying persistent, personalized AI agents that deeply understand each customer.

---

## 1. Vision

Shenmay AI is a B2B SaaS platform. Companies across any industry onboard their customers into Shenmay, and each customer gets a **persistent, personalized AI agent** that deeply understands who they are. The agent reads from two core files before every interaction:

- **Soul** — *Who the agent is* for this customer (tone, approach, personality calibration)
- **Memory** — *What the agent knows* about this customer (data, goals, conversation history, preferences)

The result: every conversation feels like picking up where you left off with someone who truly knows you.

**Shenmay AI is the platform company.** Tenants (like Covenant Trust) are customers who integrate Shenmay agents into their own businesses. Each tenant operates in a specific "vertical" (retirement planning, healthcare, insurance, wealth management, education, etc.) which configures the agent's domain knowledge, terminology, and onboarding flows.

---

## 2. Two Deployment Models

Shenmay AI offers two ways for companies to deploy personalized agents to their customers:

### Model A — White-Label Platform (Primary Focus)

Shenmay provides a **full branded web application** that the tenant's customers log into directly.

```
┌─────────────────────────────────────────────────┐
│            NOMII AI PLATFORM                     │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  TENANT: Covenant Trust                      │ │
│  │  Branding: Logo, Colors, Agent Name          │ │
│  │  Vertical: Retirement Planning               │ │
│  │  Domain: advisor.covenanttrust.com (optional) │ │
│  │                                               │ │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │ │
│  │  │Customer │ │ Advisor  │ │ Tenant Admin │  │ │
│  │  │ Login   │ │Dashboard │ │  Console     │  │ │
│  │  │ & Chat  │ │ & Flags  │ │ & Config     │  │ │
│  │  └─────────┘ └──────────┘ └──────────────┘  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  TENANT: Another Company                     │ │
│  │  Vertical: Healthcare                        │ │
│  │  ...                                          │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**How it works:**
- Tenant signs up for Shenmay AI, picks a vertical, configures branding and compliance
- Shenmay generates a white-labeled web app (tenant's logo, colors, agent name)
- Tenant's customers are imported or self-register
- Each customer logs in and gets their personalized AI agent
- Tenant admins and advisors monitor via dashboards
- Optional: custom domain (advisor.covenanttrust.com pointing to Shenmay)

**Best for:** Companies without an existing customer portal, companies who want a turnkey solution, PoC/demo scenarios (like Covenant Trust).

### Model B — Embeddable Widget/SDK (Future Phase)

For companies with an existing customer portal, Shenmay provides a **lightweight JavaScript SDK** that embeds a chat widget directly into their site.

```
┌─────────────────────────────────────────────────┐
│  TENANT'S EXISTING WEB APP                       │
│  (Covenant Trust's Customer Portal)              │
│                                                  │
│  ┌───────────────────────────────────┐           │
│  │  Their existing UI               │           │
│  │  Their existing features         │           │
│  │                                  │           │
│  │                    ┌─────────┐   │           │
│  │                    │ NOMII   │   │           │
│  │                    │ CHAT    │   │           │
│  │                    │ WIDGET  │   │           │
│  │                    │ ○ ○ ○   │   │           │
│  │                    └─────────┘   │           │
│  └───────────────────────────────────┘           │
│                        │                         │
│                        ▼ (API calls)             │
│              ┌─────────────────┐                 │
│              │  NOMII AI API   │                 │
│              │  Soul + Memory  │                 │
│              │  Prompt Builder │                 │
│              └─────────────────┘                 │
└─────────────────────────────────────────────────┘
```

**How it works:**
- Company adds `<script src="https://sdk.nomii.ai/v1/nomii.js"></script>` to their site
- When a user logs in to the company's portal, the company's backend sends a signed token to Shenmay identifying the user
- The Shenmay widget appears, loads the user's Soul + Memory, and spawns their personalized agent
- All agent logic lives on Shenmay's backend — the company's site just renders the chat UI

**Best for:** Companies with existing portals who want to add AI without rebuilding their app.

### Shared Core

Both deployment models share the same backend engine:

```
┌─────────────────────────────────────────────────┐
│                 NOMII AI CORE                     │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  Soul    │  │  Memory   │  │ Customer Data│  │
│  │  (per    │  │  (per     │  │ (flexible,   │  │
│  │ customer)│  │ customer) │  │ per vertical)│  │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘  │
│       └──────────────┼────────────────┘          │
│                      ▼                           │
│            ┌─────────────────┐                   │
│            │  PROMPT BUILDER │                   │
│            │  (tenant config │                   │
│            │  + soul + memory│                   │
│            │  + domain data) │                   │
│            └────────┬────────┘                   │
│                     ▼                            │
│            ┌─────────────────┐                   │
│            │   LLM LAYER     │                   │
│            │  Claude / GPT   │                   │
│            │  (per tenant)   │                   │
│            └────────┬────────┘                   │
│                     ▼                            │
│            ┌─────────────────┐                   │
│            │ RESPONSE ENGINE │                   │
│            │ • Answer user   │                   │
│            │ • Update memory │                   │
│            │ • Detect flags  │                   │
│            │ • Evolve soul   │                   │
│            └─────────────────┘                   │
├──────────────────────────────────────────────────┤
│              DELIVERY LAYER                       │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  White-Label App │  │  Embeddable Widget   │  │
│  │  (Model A)       │  │  (Model B / SDK)     │  │
│  │  Full branded    │  │  nomii.js script     │  │
│  │  web application │  │  drops into any site │  │
│  └──────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 3. Industry Verticals

Shenmay AI is **industry-agnostic**. The Soul/Memory architecture works for any domain where deep customer knowledge drives better outcomes. Each tenant configures a vertical that determines:

- **Terminology** — What things are called (accounts vs. policies vs. records)
- **Data categories** — What customer data is tracked (finances, health records, policies)
- **Onboarding categories** — What the agent needs to learn about each customer
- **Compliance rules** — Industry-specific restrictions and disclaimers
- **Escalation triggers** — When to involve a human specialist

### Example Verticals

| Vertical | Customer | Advisor | Data Types | Example Tenant |
|----------|----------|---------|------------|----------------|
| Retirement Planning | Retiree | Financial Advisor | 401k, IRA, pension, Social Security | Covenant Trust |
| Wealth Management | Investor | Portfolio Manager | Stocks, bonds, real estate, trusts | — |
| Health Insurance | Member | Care Navigator | Policies, claims, providers, medications | — |
| Life Insurance | Policyholder | Insurance Agent | Policies, beneficiaries, premiums | — |
| Education | Student | Academic Advisor | Courses, grades, financial aid, career goals | — |
| Real Estate | Buyer/Seller | Real Estate Agent | Listings, preferences, mortgage, inspections | — |

The first vertical is **retirement planning** with Covenant Trust as the pilot customer.

---

## 4. Soul — Agent Identity File

The Soul defines *how* the agent communicates with a specific customer. It is **auto-generated** during onboarding based on customer profile + tenant configuration, and evolves over time.

### Structure

```json
{
  "base_identity": {
    "agent_name": "Covenant Advisor",
    "role": "Retirement planning assistant",
    "organization": "Covenant Trust"
  },
  "communication_profile": {
    "tone": "warm & reassuring",
    "complexity_level": 2,
    "pace": "moderate with detailed explanations",
    "emotional_awareness": "high",
    "language": "plain English, avoid jargon"
  },
  "behavioral_rules": {
    "framing": "Always educational, never prescriptive",
    "personality_rules": [
      "Use gardening metaphors when explaining growth concepts",
      "Keep responses to 2-3 paragraphs maximum",
      "Always validate feelings before offering information"
    ],
    "escalation_rules": ["tax decisions", "legal questions", "large withdrawals"]
  }
}
```

### How It's Generated

1. **Tenant baseline** provides defaults (branding, compliance, tone range)
2. **Customer demographics** adjust complexity + tone (age, tech comfort, domain literacy)
3. **Onboarding interview** refines communication preferences
4. **Ongoing interactions** trigger soul updates (e.g., customer prefers shorter answers → pace shifts)

---

## 5. Memory — Customer Knowledge File

Memory is the agent's persistent knowledge about the customer. It grows with every interaction.

### Structure

```json
{
  "personal_profile": {
    "name": "Margaret Chen",
    "age": 67,
    "location": "Portland, OR",
    "career": "Retired teacher (Portland Public Schools, 30 years)",
    "tech_comfort": "moderate",
    "family": {
      "marital_status": "married",
      "spouse": { "name": "Robert", "age": 69, "health_notes": "Heart condition" },
      "children": [
        { "name": "Lisa", "age": 42, "location": "Seattle" },
        { "name": "David", "age": 38, "location": "Portland" }
      ]
    }
  },
  "data_snapshot": { ... },
  "risk_profile": { ... },
  "life_plan": { ... },
  "conversation_history": [ ... ],
  "agent_notes": [ ... ]
}
```

### Memory Update Rules

1. **After every session**: conversation summary is appended
2. **Domain data**: updated when new data is ingested from tenant systems
3. **Goals/plans**: updated when customer expresses new priorities
4. **Agent notes**: the agent writes observational notes (communication patterns, emotional cues)
5. **Human advisor annotations**: advisors can add notes visible to the agent

---

## 6. Data Model

### Core Entities

```
TENANTS
├── id (uuid)
├── name ("Covenant Trust")
├── slug ("covenant-trust")
├── vertical ("retirement" | "healthcare" | "insurance" | ...)
├── vertical_config (JSON — domain-specific settings, terminology, data schemas)
├── branding (logo, colors, agent name)
├── compliance_config (disclaimers, restricted topics, escalation triggers)
├── onboarding_config (categories, interview style)
├── base_soul_template (default soul settings)
├── llm_provider + llm_model (configurable per tenant)
└── created_at

CUSTOMERS
├── id (uuid)
├── tenant_id (FK → tenants)
├── name, email, location, date_of_birth
├── onboarding_status (pending | in_progress | complete)
├── onboarding_categories_completed (JSON array)
├── assigned_advisor_id (FK → advisors)
├── soul_file (JSON — the Soul content)
├── memory_file (JSON — the Memory content)
└── last_interaction_at

CUSTOMER_DATA (flexible, per-vertical)
├── id (uuid)
├── customer_id (FK → customers)
├── data_category (e.g. "401k", "insurance_policy", "medical_record")
├── data_type (e.g. "account", "income_source", "property", "policy")
├── label ("401(k) — Vanguard Target 2025")
├── institution
├── value_primary (main value: balance, coverage amount, etc.)
├── value_monthly (monthly amount: income, payment, premium, etc.)
├── details (JSON — flexible schema per type)
├── source (manual | csv_import | api_sync | advisor_entry)
└── last_synced_at

CONVERSATIONS
├── id (uuid)
├── customer_id (FK → customers)
├── session_type (onboarding | chat | review | escalation)
├── status (active | ended | escalated)
├── summary (AI-generated session summary)
├── topics_covered (JSON array)
├── sentiment
└── advisor_reviewed + advisor_notes

MESSAGES
├── id (uuid)
├── conversation_id (FK → conversations)
├── role (customer | agent | system)
├── content (text)
├── metadata (JSON — sentiment, topics)
└── created_at

ADVISORS (Human specialists)
├── id (uuid)
├── tenant_id (FK → tenants)
├── name, email
├── role (advisor | senior_advisor | admin | specialist | support)
└── customers (many-to-many via advisor_customers)

FLAGS
├── id (uuid)
├── customer_id + conversation_id (FKs)
├── flag_type (escalation | confusion | risk_alert | exploitation_concern | ...)
├── severity (low | medium | high | critical)
├── description
├── status (open | in_review | resolved | dismissed)
├── assigned_advisor_id
└── resolution_notes
```

---

## 7. Onboarding Flow — Conversational Interview

The onboarding is an **agent-led freeform conversation** that covers required categories naturally. Categories are configured per tenant vertical.

### Interview Framework

The agent has an internal checklist (from tenant's `onboarding_config`) but approaches topics conversationally:

```
RETIREMENT VERTICAL — REQUIRED CATEGORIES:
□ Personal background & family
□ Current financial overview
□ Retirement dreams & goals
□ Travel plans
□ Healthcare concerns
□ Housing plans
□ Legacy & family support goals
□ Risk tolerance & biggest fears
□ Communication preferences
□ Hobbies & lifestyle

OPTIONAL (explore if natural):
□ Charitable giving
□ Part-time work interest
□ Bucket list items
```

Other verticals define their own categories. The interview engine is generic — it just needs a list of categories to cover and approaches them through natural conversation.

### Completion Tracking

The system tracks which categories have been covered. If the customer ends early, the agent picks up remaining categories in future sessions naturally — never forcing a "you didn't finish your form" experience.

---

## 8. Agent Orchestration — How a Session Works

```
Customer opens chat (via platform or embedded widget)
        │
        ▼
┌─────────────────────┐
│ 1. AUTHENTICATE     │
│ • Identify customer │
│ • Load tenant config│
│ • Verify access     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 2. LOAD CONTEXT     │
│ • Read Soul         │
│ • Read Memory       │
│ • Load customer data│
│ • Load vertical cfg │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 3. BUILD PROMPT     │
│ System prompt:      │
│ identity + soul +   │
│ memory + data +     │
│ compliance + rules  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. CONVERSATION     │
│ Stream messages      │
│ back and forth       │
│ (detect flags live) │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 5. POST-SESSION     │
│ • Generate summary  │
│ • Update Memory     │
│ • Evolve Soul       │
│ • Process flags     │
│ • Notify advisors   │
└─────────────────────┘
```

---

## 9. Four Interfaces

### A. Customer Chat
- Clean, accessible chat interface (large text, high contrast)
- Personalized greeting that references past conversations
- Session history (past conversations)
- "Talk to my advisor" escalation button
- Compliance disclaimer footer
- Future: voice input for accessibility

### B. Advisor Dashboard
- List of assigned customers with status indicators
- Per-customer view: Memory summary, recent conversations, flags
- Ability to annotate Memory ("Customer called me directly about X")
- Flag management (review, resolve, add notes)
- Conversation transcripts with search

### C. Tenant Admin Console
- Branding settings (logo, colors, agent name, custom domain)
- Vertical configuration (data categories, terminology, onboarding)
- Compliance configuration (disclaimers, restricted topics)
- Base soul template customization
- Customer data import (CSV upload, future: API integrations)
- LLM provider selection
- Usage analytics

### D. Shenmay Platform Admin (Internal)
- Tenant management (create, configure, monitor)
- Vertical template library
- System-wide analytics
- LLM usage and cost tracking

---

## 10. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Tailwind CSS | Component-based, accessible, fast |
| Chat UI | Custom components | Full control over UX per deployment model |
| Backend | Node.js (Express) | JS across the stack, async-friendly |
| Database | PostgreSQL | Relational integrity, JSONB for flexible data |
| Soul/Memory | DB-stored JSON | Queryable + human-readable |
| LLM | Claude API (initial) | Best for nuanced, empathetic conversations |
| Auth | JWT + tenant scoping | Multi-tenant isolation |
| Deployment | Docker Compose on Proxmox | Production-grade from day one |
| Future: Widget SDK | Vanilla JS bundle | Embeddable in any site with a script tag |

---

## 11. Build Phases

### Phase 1: Foundation (COMPLETE)
- [x] Industry-agnostic database schema (customer_data table)
- [x] Soul + Memory JSON persistence
- [x] Prompt builder engine (vertical-aware)
- [x] 3 customer personas with full Soul + Memory files
- [x] Express API (CRUD for all entities + chat endpoint)
- [x] React frontend (chat, advisor dashboard, customer profiles)
- [x] Mock LLM responses
- [x] Docker Compose deployment
- [x] Git + GitHub version control

### Phase 2: Platform Polish (Current)
- [ ] Authentication system (JWT, login/signup, tenant-scoped)
- [ ] Dynamic tenant branding (colors, logo, agent name applied from config)
- [ ] Wire in Claude API (replace mock responses)
- [ ] Onboarding flow that auto-generates Soul + populates Memory
- [ ] Post-session Memory auto-updates (live, not just mock)
- [ ] Tenant admin console (basic: branding + compliance config)
- [ ] Deploy on Proxmox for live demo

### Phase 3: Demo-Ready for Covenant Trust
- [ ] Full demo flow with 3 personas showing different agent personalities
- [ ] Advisor dashboard with live flag management
- [ ] Realistic conversation experience with Claude
- [ ] Custom Covenant Trust branding applied
- [ ] Demo script / walkthrough preparation

### Phase 4: Embeddable Widget (Model B)
- [ ] `nomii.js` SDK — lightweight script for embedding
- [ ] Token-based auth flow (company backend → Shenmay API)
- [ ] Configurable widget UI (position, size, theme)
- [ ] Widget documentation for developer integration

### Phase 5: Production
- [ ] Real data integrations (CSV import, future: Plaid, APIs)
- [ ] User self-registration + onboarding
- [ ] Multiple LLM provider support
- [ ] Advanced analytics & reporting
- [ ] SOC 2 / security hardening
- [ ] Billing & subscription management
- [ ] Mobile responsive / PWA

---

## 12. Key Differentiators

1. **Persistent Personality** — Not just a chatbot. An agent that *knows* you and adapts over time.
2. **Soul + Memory Architecture** — Each customer gets a unique agent identity and a growing knowledge base.
3. **Industry-Agnostic** — Same core engine works for retirement, healthcare, insurance, education, and beyond.
4. **Dual Deployment** — White-label platform OR embeddable widget. Meet companies where they are.
5. **Human-in-the-Loop** — AI handles daily interactions; humans handle high-stakes decisions. Flag system keeps advisors in control.
6. **Conversational Onboarding** — No forms. Just a warm conversation that builds a complete customer profile.
7. **B2B White-Label** — Companies get *their* branded experience, powered by Shenmay.

---

*This document is the living blueprint for Shenmay AI. Update as decisions are made.*
