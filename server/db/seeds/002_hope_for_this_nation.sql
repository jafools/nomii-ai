-- ============================================================
-- NOMII AI — Seed Data: Hope for This Nation
-- Vertical: Ministry / Traveling Mission Team
-- Test tenant for embed widget PoC
-- Run after migrations 001–004
-- ============================================================


-- ============================================================
-- TENANT: Hope for This Nation
-- ============================================================
INSERT INTO tenants (
    id, name, slug, vertical, vertical_config,
    agent_name, primary_color, secondary_color,
    compliance_config, base_soul_template, onboarding_config,
    llm_provider, llm_model
)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'Hope for This Nation',
    'hope-for-this-nation',
    'ministry',
    '{
        "domain_label": "Ministry & Mission",
        "customer_label": "Team Member",
        "advisor_label": "Team Leader",
        "data_categories": ["travel", "schedule", "prayer_requests", "spiritual_growth", "team_notes", "logistics", "support"],
        "terminology": {
            "data_section_title": "Ministry Profile",
            "primary_value_label": "Details",
            "monthly_value_label": "Frequency"
        },
        "agent_role_description": "A warm, faith-based companion for Hope for This Nation ministry team members traveling and serving in Sweden. Provides support, encouragement, scheduling help, and spiritual care.",
        "framing_rules": "Be warm, encouraging, and faith-affirming. You support and walk alongside team members — never prescribe or push. Speak with care and respect for each person''s journey. Acknowledge both the challenges and the joy of mission work. When appropriate, offer prayer or reflection prompts."
    }'::jsonb,
    'Beacon',
    '#4A2C8F',
    '#F5A623',
    '{
        "disclaimers": [
            "Beacon is a supportive AI companion for Hope for This Nation team members. It is not a licensed counselor or spiritual director."
        ],
        "restricted_topics": [
            "Medical or mental health diagnosis",
            "Legal advice",
            "Specific financial or tax guidance",
            "Doctrinal disputes or denominational debate"
        ],
        "escalation_triggers": [
            "Team member expresses crisis, burnout, or serious emotional distress",
            "Safety concerns while traveling",
            "Team member requests to speak with a team leader",
            "Urgent logistics or emergency situations"
        ]
    }'::jsonb,
    '{
        "tone": "warm, encouraging & faith-affirming",
        "complexity_level": 2,
        "pace": "relaxed",
        "emotional_awareness": "high",
        "language": "conversational English"
    }'::jsonb,
    '{
        "categories": ["agent_naming", "personal_background", "current_assignment", "prayer_life", "spiritual_gifts", "travel_experience", "team_role", "support_needs", "communication_preferences"],
        "optional_categories": ["language_skills", "music_ministry", "previous_missions"],
        "interview_style": "freeform"
    }'::jsonb,
    'claude',
    'claude-sonnet-4-20250514'
)
ON CONFLICT (id) DO UPDATE
    SET name              = EXCLUDED.name,
        slug              = EXCLUDED.slug,
        vertical_config   = EXCLUDED.vertical_config,
        agent_name        = EXCLUDED.agent_name,
        base_soul_template = EXCLUDED.base_soul_template;


-- ============================================================
-- TEAM LEADERS (advisors table)
-- ============================================================
INSERT INTO advisors (id, tenant_id, name, email, role)
VALUES
    ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Admin User',        'ajaces@gmail.com',          'admin'),
    ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Team Leader',       'leader@hopeforthisnation.com', 'senior_advisor')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SEED widget_api_key if not already set
-- (migration 004 may have already generated one)
-- ============================================================
UPDATE tenants
SET widget_api_key = encode(gen_random_bytes(32), 'hex')
WHERE id = '22222222-2222-2222-2222-222222222222'
  AND widget_api_key IS NULL;
