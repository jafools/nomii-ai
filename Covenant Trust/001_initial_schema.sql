-- ============================================================
-- NOMII AI — Initial Database Schema
-- Migration 001: Core tables for multi-tenant agent platform
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS — Financial firms using Nomii AI
-- ============================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,  -- URL-safe identifier
    
    -- Branding
    agent_name      VARCHAR(100) NOT NULL DEFAULT 'Financial Advisor',
    logo_url        TEXT,
    primary_color   VARCHAR(7) DEFAULT '#1E3A5F',   -- hex color
    secondary_color VARCHAR(7) DEFAULT '#4A90D9',
    
    -- Compliance & Configuration
    compliance_config JSONB NOT NULL DEFAULT '{
        "disclaimers": ["This is educational information, not financial advice. Please consult your advisor for personalized recommendations."],
        "restricted_topics": ["specific tax advice", "legal counsel", "insurance product sales"],
        "escalation_triggers": ["large withdrawal", "account closure", "beneficiary changes"]
    }'::jsonb,
    
    -- Base Soul Template (default agent personality for this tenant)
    base_soul_template JSONB NOT NULL DEFAULT '{
        "tone": "warm & reassuring",
        "complexity_level": 3,
        "pace": "moderate",
        "emotional_awareness": "high",
        "language": "plain English"
    }'::jsonb,
    
    -- LLM Configuration
    llm_provider    VARCHAR(50) NOT NULL DEFAULT 'claude',
    llm_model       VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
    
    -- Metadata
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ADVISORS — Human financial advisors at tenant firms
-- ============================================================
CREATE TABLE advisors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'advisor'
                    CHECK (role IN ('advisor', 'senior_advisor', 'admin')),
    
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, email)
);

-- ============================================================
-- CUSTOMERS — Retirees / end-users of the AI agent
-- ============================================================
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_advisor_id UUID REFERENCES advisors(id) ON DELETE SET NULL,
    
    -- Personal Info
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(20),
    date_of_birth   DATE,
    location        VARCHAR(255),
    
    -- Onboarding Status
    onboarding_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (onboarding_status IN ('pending', 'in_progress', 'complete')),
    onboarding_categories_completed JSONB DEFAULT '[]'::jsonb,
    
    -- The Core: Soul & Memory (stored as structured JSON)
    soul_file       JSONB NOT NULL DEFAULT '{}'::jsonb,
    memory_file     JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Metadata
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_interaction_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_advisor ON customers(assigned_advisor_id);
CREATE INDEX idx_customers_onboarding ON customers(tenant_id, onboarding_status);

-- ============================================================
-- FINANCIAL_ACCOUNTS — Customer assets, income, debts
-- ============================================================
CREATE TABLE financial_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    account_type    VARCHAR(50) NOT NULL
                    CHECK (account_type IN (
                        '401k', 'ira', 'roth_ira', 'pension', 
                        'social_security', 'savings', 'checking',
                        'brokerage', 'real_estate', 'annuity',
                        'debt', 'other'
                    )),
    account_name    VARCHAR(255) NOT NULL,
    institution     VARCHAR(255),
    
    -- Financial Data
    balance         DECIMAL(15, 2),
    monthly_income  DECIMAL(10, 2),      -- for income-producing accounts
    monthly_payment DECIMAL(10, 2),      -- for debts
    
    -- Flexible details per account type
    details         JSONB DEFAULT '{}'::jsonb,
    
    -- Data Source
    source          VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'csv_import', 'api_sync', 'advisor_entry')),
    
    last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_financial_accounts_customer ON financial_accounts(customer_id);

-- ============================================================
-- CONVERSATIONS — Chat sessions between customer and agent
-- ============================================================
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Session Info
    session_type    VARCHAR(20) NOT NULL DEFAULT 'chat'
                    CHECK (session_type IN ('onboarding', 'chat', 'review', 'escalation')),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'ended', 'escalated')),
    
    -- Post-Session Data
    summary         TEXT,                 -- AI-generated session summary
    topics_covered  JSONB DEFAULT '[]'::jsonb,
    sentiment       VARCHAR(20),          -- overall session sentiment
    
    -- Advisor Review
    advisor_reviewed    BOOLEAN NOT NULL DEFAULT false,
    advisor_notes       TEXT,
    reviewed_at         TIMESTAMPTZ,
    reviewed_by         UUID REFERENCES advisors(id),
    
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_customer ON conversations(customer_id);
CREATE INDEX idx_conversations_status ON conversations(customer_id, status);

-- ============================================================
-- MESSAGES — Individual messages within conversations
-- ============================================================
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    role            VARCHAR(20) NOT NULL
                    CHECK (role IN ('customer', 'agent', 'system')),
    content         TEXT NOT NULL,
    
    -- Metadata
    metadata        JSONB DEFAULT '{}'::jsonb,  -- sentiment, topics, etc.
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_conversation_time ON messages(conversation_id, created_at);

-- ============================================================
-- FLAGS — Escalations, alerts, and concerns
-- ============================================================
CREATE TABLE flags (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    flag_type       VARCHAR(30) NOT NULL
                    CHECK (flag_type IN (
                        'escalation', 'confusion', 'risk_alert',
                        'exploitation_concern', 'compliance',
                        'advisor_requested', 'high_emotion'
                    )),
    severity        VARCHAR(10) NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    description     TEXT NOT NULL,
    
    -- Resolution
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
    assigned_advisor_id UUID REFERENCES advisors(id),
    resolution_notes    TEXT,
    resolved_at         TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flags_customer ON flags(customer_id);
CREATE INDEX idx_flags_status ON flags(status);
CREATE INDEX idx_flags_advisor ON flags(assigned_advisor_id, status);

-- ============================================================
-- ADVISOR-CUSTOMER ASSIGNMENTS (many-to-many)
-- ============================================================
CREATE TABLE advisor_customers (
    advisor_id      UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (advisor_id, customer_id)
);

-- ============================================================
-- UPDATED_AT TRIGGER — Auto-update timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_advisors_updated_at
    BEFORE UPDATE ON advisors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_financial_accounts_updated_at
    BEFORE UPDATE ON financial_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_flags_updated_at
    BEFORE UPDATE ON flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
