-- ============================================================
-- NOMII AI — Seed Data: Covenant Trust Demo
-- Vertical: Retirement Planning
-- Run after 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- TENANT: Covenant Trust (Retirement Planning vertical)
-- ============================================================
INSERT INTO tenants (id, name, slug, vertical, vertical_config, agent_name, primary_color, secondary_color, compliance_config, base_soul_template, onboarding_config, llm_provider, llm_model)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Covenant Trust',
    'covenant-trust',
    'retirement',
    '{
        "domain_label": "Retirement Planning",
        "customer_label": "Client",
        "advisor_label": "Financial Advisor",
        "data_categories": ["401k", "ira", "roth_ira", "pension", "social_security", "savings", "checking", "brokerage", "real_estate", "annuity", "debt"],
        "terminology": {
            "data_section_title": "Financial Picture",
            "primary_value_label": "Balance",
            "monthly_value_label": "Monthly Income/Payment"
        },
        "agent_role_description": "Retirement planning assistant providing educational and informational guidance about finances, lifestyle planning, and retirement readiness.",
        "framing_rules": "You provide EDUCATIONAL and INFORMATIONAL guidance only. Frame everything as \"here is what many people consider\" or \"one approach worth exploring is\" — never \"you should\" or \"I recommend.\""
    }'::jsonb,
    'Covenant Advisor',
    '#1B4332',
    '#40916C',
    '{
        "disclaimers": [
            "This is educational information provided by Covenant Trust. It is not personalized financial advice. Please consult your assigned advisor for specific recommendations.",
            "Covenant Trust and its AI assistant do not provide tax, legal, or insurance advice."
        ],
        "restricted_topics": [
            "Specific tax filing advice",
            "Legal counsel or document preparation",
            "Insurance product sales or endorsements",
            "Specific stock, fund, or security recommendations",
            "Guaranteed returns or performance promises"
        ],
        "escalation_triggers": [
            "Large withdrawal requests (over $10,000)",
            "Account closure requests",
            "Beneficiary changes",
            "Signs of financial exploitation",
            "Customer requests human advisor",
            "Customer expresses significant distress"
        ]
    }'::jsonb,
    '{
        "tone": "warm & reassuring",
        "complexity_level": 3,
        "pace": "moderate",
        "emotional_awareness": "high",
        "language": "plain English"
    }'::jsonb,
    '{
        "categories": ["agent_naming", "personal_background", "financial_overview", "retirement_dreams", "travel", "healthcare", "housing", "legacy", "hobbies", "risk_tolerance", "communication_preferences"],
        "optional_categories": ["charitable_giving", "part_time_work", "bucket_list"],
        "interview_style": "freeform"
    }'::jsonb,
    'claude',
    'claude-sonnet-4-20250514'
);

-- ============================================================
-- ADVISORS
-- ============================================================
INSERT INTO advisors (id, tenant_id, name, email, role) VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'James Rodriguez', 'james.rodriguez@covenanttrust.com', 'senior_advisor'),
    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Sarah Kim', 'sarah.kim@covenanttrust.com', 'advisor'),
    ('aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Michael Torres', 'michael.torres@covenanttrust.com', 'admin');

-- ============================================================
-- CUSTOMER 1: Margaret Chen
-- ============================================================
INSERT INTO customers (id, tenant_id, assigned_advisor_id, first_name, last_name, email, phone, date_of_birth, location, onboarding_status, onboarding_categories_completed, last_interaction_at)
VALUES (
    'cccc1111-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Margaret', 'Chen',
    'margaret.chen@email.com', '503-555-0101',
    '1958-09-14', 'Portland, OR',
    'complete',
    '["agent_naming", "personal_background", "financial_overview", "retirement_dreams", "travel", "healthcare", "housing", "legacy", "hobbies", "risk_tolerance", "communication_preferences"]'::jsonb,
    '2026-03-01T10:30:00Z'
);

-- Margaret's data (retirement vertical)
INSERT INTO customer_data (customer_id, data_category, data_type, label, institution, value_primary, value_monthly, details, source) VALUES
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', '401k', 'account', '401(k) — Vanguard Target 2025', 'Vanguard', 485000, NULL, '{"fund": "Vanguard Target Retirement 2025", "employer": "Portland Public Schools"}'::jsonb, 'advisor_entry'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'ira', 'account', 'Traditional IRA', 'Fidelity', 120000, NULL, '{"allocation": "60% bonds, 40% equities"}'::jsonb, 'advisor_entry'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'social_security', 'income_source', 'Social Security', NULL, NULL, 2400, '{"started_age": 66, "full_retirement_age": 67}'::jsonb, 'manual'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'pension', 'income_source', 'Portland Public Schools Pension', 'PERS Oregon', NULL, 1800, '{"type": "defined_benefit", "employer": "Portland Public Schools"}'::jsonb, 'advisor_entry'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'savings', 'account', 'High-Yield Savings', 'Ally Bank', 45000, NULL, '{"apy": "4.25%"}'::jsonb, 'manual'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'real_estate', 'property', 'Primary Residence', NULL, 380000, NULL, '{"type": "primary_residence", "mortgage": "none", "address": "Portland, OR"}'::jsonb, 'advisor_entry');

-- ============================================================
-- CUSTOMER 2: Jim Thompson
-- ============================================================
INSERT INTO customers (id, tenant_id, assigned_advisor_id, first_name, last_name, email, phone, date_of_birth, location, onboarding_status, onboarding_categories_completed, last_interaction_at)
VALUES (
    'cccc2222-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'James', 'Thompson',
    'jim.thompson@email.com', '503-555-0202',
    '1953-11-02', 'Beaverton, OR',
    'in_progress',
    '["personal_background", "financial_overview", "housing", "retirement_dreams", "healthcare", "legacy", "risk_tolerance"]'::jsonb,
    '2026-02-25T14:15:00Z'
);

INSERT INTO customer_data (customer_id, data_category, data_type, label, institution, value_primary, value_monthly, details, source) VALUES
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'pension', 'income_source', 'Boeing/IAM Union Pension', 'Boeing', NULL, 2200, '{"type": "single_life_annuity", "employer": "Boeing", "years_of_service": 40}'::jsonb, 'advisor_entry'),
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'social_security', 'income_source', 'Social Security', NULL, NULL, 1900, '{"started_age": 67}'::jsonb, 'manual'),
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'savings', 'account', 'Savings Account', 'US Bank', 85000, NULL, '{"notes": "Includes Dorothy life insurance payout"}'::jsonb, 'advisor_entry'),
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'ira', 'account', 'Traditional IRA', 'Fidelity', 155000, NULL, '{"allocation": "Mostly bonds", "notes": "Dorothy set this up. Jim has never actively managed it."}'::jsonb, 'advisor_entry'),
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'checking', 'account', 'Checking Account', 'US Bank', 12000, NULL, '{}'::jsonb, 'manual'),
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'real_estate', 'property', 'Primary Residence', NULL, 340000, NULL, '{"type": "primary_residence", "mortgage": "none", "bedrooms": 3, "notes": "More space than Jim needs. Roof needs replacing in 2-3 years (~$15k)."}'::jsonb, 'advisor_entry');

-- ============================================================
-- CUSTOMER 3: Diana & Carlos Rivera
-- ============================================================
INSERT INTO customers (id, tenant_id, assigned_advisor_id, first_name, last_name, email, phone, date_of_birth, location, onboarding_status, onboarding_categories_completed, last_interaction_at)
VALUES (
    'cccc3333-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Diana', 'Rivera',
    'diana.rivera@email.com', '503-555-0303',
    '1963-06-22', 'Lake Oswego, OR',
    'complete',
    '["agent_naming", "personal_background", "financial_overview", "retirement_dreams", "travel", "healthcare", "housing", "legacy", "hobbies", "risk_tolerance", "communication_preferences"]'::jsonb,
    '2026-02-28T16:00:00Z'
);

INSERT INTO customer_data (customer_id, data_category, data_type, label, institution, value_primary, value_monthly, details, source) VALUES
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', '401k', 'account', 'Diana 401(k)', 'Fidelity', 680000, NULL, '{"allocation": "S&P 500 index, total bond, international", "management": "Diana manages actively"}'::jsonb, 'advisor_entry'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'ira', 'account', 'Carlos Traditional IRA', 'Schwab', 320000, NULL, '{"fund": "Target Date 2030", "notes": "Rolled over from old employer"}'::jsonb, 'advisor_entry'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'roth_ira', 'account', 'Diana Roth IRA', 'Fidelity', 185000, NULL, '{"strategy": "Growth-oriented", "contributions": "Max for 10+ years"}'::jsonb, 'advisor_entry'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'brokerage', 'account', 'Joint Taxable Brokerage', 'Schwab', 250000, NULL, '{"allocation": "Mix of ETFs and individual stocks"}'::jsonb, 'advisor_entry'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'pension', 'income_source', 'Diana Pension', 'Former Employer', NULL, 1200, '{"type": "defined_benefit", "started": "at retirement"}'::jsonb, 'advisor_entry'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'other', 'income_source', 'Carlos Consulting Income', NULL, NULL, 3500, '{"type": "consulting", "hours_per_week": "10-15", "variable_range": "3000-5000/month", "end_date": "age 66"}'::jsonb, 'manual'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'savings', 'account', 'High-Yield Savings', 'Marcus by Goldman Sachs', 95000, NULL, '{"apy": "4.40%"}'::jsonb, 'manual'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'real_estate', 'property', 'Primary Residence — Lake Oswego', NULL, 620000, NULL, '{"type": "primary_residence", "mortgage_remaining": 140000, "monthly_payment": 1800, "payoff_years": 7}'::jsonb, 'advisor_entry'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'real_estate', 'property', 'Rental Condo — SE Portland', NULL, 310000, NULL, '{"type": "rental", "mortgage_remaining": 95000, "monthly_income": 2100, "monthly_costs": 1300, "net_monthly": 800, "considering_sale": "3-5 years"}'::jsonb, 'advisor_entry');

-- ============================================================
-- ADVISOR-CUSTOMER ASSIGNMENTS
-- ============================================================
INSERT INTO advisor_customers (advisor_id, customer_id, is_primary) VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccc1111-cccc-cccc-cccc-cccccccccccc', true),
    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccc2222-cccc-cccc-cccc-cccccccccccc', true),
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccc3333-cccc-cccc-cccc-cccccccccccc', true),
    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccc1111-cccc-cccc-cccc-cccccccccccc', false);

-- ============================================================
-- SAMPLE FLAGS
-- ============================================================
INSERT INTO flags (customer_id, flag_type, severity, description, status, assigned_advisor_id) VALUES
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'confusion', 'low', 'Margaret confused RMDs with early withdrawal penalties during Session 2. Simplify language on tax-related withdrawal topics in future sessions.', 'resolved', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'escalation', 'medium', 'LTC insurance exploration — Margaret wants guidance after Robert''s medical scare. Needs advisor consultation.', 'open', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'high_emotion', 'medium', 'Margaret very anxious about Robert''s health and financial implications. Agent provided emotional support and pivoted to emergency fund discussion.', 'resolved', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('cccc2222-cccc-cccc-cccc-cccccccccccc', 'escalation', 'medium', 'Jim wants to help with grandson Tyler''s college — needs advisor guidance on 529 vs. UTMA options.', 'open', 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'escalation', 'high', 'Roth conversion ladder strategy — needs advisor analysis with tax implications and ACA subsidy impact.', 'open', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    ('cccc3333-cccc-cccc-cccc-cccccccccccc', 'escalation', 'medium', 'Blended family estate planning — needs legal review and advisor guidance.', 'open', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
