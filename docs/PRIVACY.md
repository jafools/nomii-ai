# Privacy Policy — Shenmay AI

**Effective Date:** 2026-04-19
**Last Updated:** 2026-04-19
**Version:** 1.0

> **Attorney review notice** — This Privacy Policy was drafted with AI assistance against the current state of the Shenmay AI codebase (April 2026). Items marked **`[ATTORNEY REVIEW]`** below require sign-off from qualified privacy counsel before publication. Items marked **`[FILL IN]`** require information only the business can provide (legal name, address, registration number, DPO details).

---

## 1. Introduction and Who We Are

This Privacy Policy explains how **`[FILL IN: Legal Company Name]`** (operating as "Shenmay AI", "we", "us", or "our") collects, uses, stores, shares, and protects personal information when you use the Shenmay AI platform — including our web application at `nomii.pontensolutions.com`, our embedded chat widget, our self-hosted software, and associated services (collectively, the "**Service**").

| | |
|---|---|
| **Data Controller / Business** | `[FILL IN: Legal Company Name]` (trading as Shenmay AI) |
| **Registered Address** | `[FILL IN: Full registered address]` |
| **Company Registration Number** | `[FILL IN: Swedish organisationsnummer or equivalent]` |
| **Data Protection Officer** | `[FILL IN: DPO name and contact, or "Not applicable — organisation below the GDPR Art. 37 threshold"]` |
| **Privacy Contact Email** | `privacy@pontensolutions.com` `[CONFIRM alias exists]` |
| **Postal Contact** | `[FILL IN: Same as registered address or separate privacy mailbox]` |

If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us using the details above.

## 2. Scope and Who This Policy Applies To

This Privacy Policy applies to:

- **End customers of businesses using Shenmay AI** — individuals who interact with an AI agent embedded on a Tenant's website or application
- **Tenant users** — advisors, administrators, and employees of businesses ("**Tenants**") who use the Shenmay AI portal to manage their AI agent deployment
- **Self-hosted customers** — businesses that run Shenmay AI on their own infrastructure under a self-hosted licence
- **Visitors to `pontensolutions.com`, `nomii.pontensolutions.com`, and related marketing properties**

If you are an employee or contractor of a Tenant business accessing the Shenmay AI portal, your employer's own privacy policy may also apply. In that context, your employer is the data controller for their customer data, and Shenmay AI acts as a data processor on their behalf (see Section 10).

## 3. Personal Data We Collect

### 3.1 End Customer Data (collected through the chat widget)

When an individual interacts with an AI agent powered by Shenmay AI, we may collect:

- **Identity data:** first name, last name, email address, phone number, date of birth, location
- **Conversation data:** all messages exchanged with the AI agent, including questions, answers, and any personal details shared during the conversation
- **AI memory data:** structured information the AI extracts during conversations — including personal profile, stated goals, concerns, life plans, financial information, and health information where relevant to the Tenant's service (stored encrypted at rest as `memory_file` and `soul_file`)
- **Communication preferences:** how the individual prefers to communicate, agent nicknames
- **Technical data:** IP address at time of consent, session timestamps, browser information
- **Consent records:** timestamp and IP address when consent was provided

Some Tenants may also provide us with customer data uploaded via CSV import or our Data API, which may include additional fields depending on the Tenant's business.

### 3.2 Tenant User Data (collected through the portal)

When advisors or administrators use the Shenmay AI portal, we collect:

- **Account data:** name, email address, role, password (hashed with bcrypt — never stored in plaintext)
- **Authentication data:** login timestamps, IP addresses, session tokens
- **Activity data:** actions taken in the portal (customer record accesses, data exports, settings changes) — recorded in our audit log
- **Business data:** company name, website, logo, AI agent configuration, subscription details
- **LLM API keys (BYOK customers only):** encrypted at rest using AES-256-GCM; see Section 6.1

### 3.3 Self-Hosted Customer Data

For businesses running Shenmay AI under a self-hosted licence, the Tenant operates their own database and is the data controller for all end-customer data. We collect only:

- **Licence holder data:** billing contact, company name, licence key
- **Licence validation telemetry:** periodic online check-ins confirming the licence is valid (no end-customer data transmitted)
- **Support data:** anything the licence holder voluntarily shares when contacting support

### 3.4 Data We Do Not Collect

- We **do not** collect payment card numbers directly — all payments are processed by Stripe, Inc.
- We **do not** use advertising trackers or sell personal data
- We **do not** knowingly collect data from children under 16 years of age
- We **do not** read or log the *content* of BYOK customers' conversations beyond what is necessary to route a single API call (see Section 6.1)

## 4. How We Use Personal Data and Our Legal Basis

Under the EU General Data Protection Regulation (GDPR Article 6), we rely on the following legal bases for processing:

| Purpose | Legal Basis |
|---|---|
| Providing the AI agent chat service to end customers | Contract (Art. 6(1)(b)) / Legitimate Interests (Art. 6(1)(f)) |
| Building and updating AI memory to personalise the service | Consent (Art. 6(1)(a)) or Contract (Art. 6(1)(b)) `[ATTORNEY REVIEW]` |
| Authenticating users and securing accounts | Contract / Legitimate Interests |
| Audit logging for security and legal compliance | Legal Obligation (Art. 6(1)(c)) / Legitimate Interests |
| Sending transactional email (verification, notifications, invoices) | Contract / Legitimate Interests |
| Billing and subscription management | Contract (Art. 6(1)(b)) |
| Fraud prevention and platform security | Legitimate Interests (Art. 6(1)(f)) |
| Responding to legal requests or regulatory obligations | Legal Obligation (Art. 6(1)(c)) |

**Special category data (GDPR Article 9)** — health, financial, religious, or other sensitive information — may be shared during AI conversations when the Tenant operates in a regulated vertical. Where this occurs, an explicit consent mechanism or another Article 9(2) basis must be documented per Tenant. `[ATTORNEY REVIEW — Tenant-by-Tenant basis identification]`

## 5. Data Retention

We retain personal data only as long as necessary for the purposes described in this policy, or as required by law. Retention periods are stored per-Tenant in our database and can be customised within the limits below.

| Data Type | Default Retention | Notes |
|---|---|---|
| Conversation message content | 730 days (2 years) | Tenant-configurable; **minimum 90 days** |
| Conversation metadata (timestamps, summary) | Duration of Tenant's active subscription + 6 months | Retained in pseudonymised form for analytics after message purge |
| AI memory and profile data (`memory_file`, `soul_file`) | Duration of Tenant's subscription | Deleted on erasure request |
| Anonymous visitor sessions | 30 days from last interaction | Tenant-configurable; minimum 7 days |
| Audit logs | 7 years | Retained for security and regulatory compliance; never purged by automatic retention jobs |
| Tenant account data | Duration of subscription + 6 months after termination | |
| Authentication logs | 12 months | |
| Backups (encrypted) | 30 days rolling window | Daily off-site encrypted backups of the production database |

When retention periods expire, message bodies are automatically deleted by the retention cron job. Conversation metadata (dates, summary) may be retained longer for analytics in pseudonymised form — this approach is endorsed by GDPR Recital 26.

## 6. Who We Share Data With

**We do not sell personal data.** We share data only in the following circumstances.

### 6.1 AI Language Model Processing — Anthropic, Inc.

Shenmay AI uses Claude models operated by **Anthropic, Inc.** (San Francisco, California, USA) to generate AI agent responses. This is the most important subprocessor relationship in the Service, so we describe it in detail.

**What is sent to Anthropic on each chat turn:**

1. A system prompt containing the AI agent's configuration, the end customer's AI memory blob (`memory_file`), stored customer data records relevant to the conversation, and the agent's product knowledge
2. The conversation message history
3. Any tool-call inputs and results when the agent retrieves data on the end customer's behalf

Before any of the above leaves our servers, it passes through the PII tokenization layer described immediately below.

**PII tokenization layer — what Anthropic actually sees (since v1.1.0, April 2026):**

Shenmay AI applies an in-process PII tokenization layer to every outbound call to Anthropic. The effect is that regulated personal identifiers are replaced with opaque placeholders *before* the request leaves our server, and Anthropic never receives the raw values. The substitution is reversed locally on Claude's response so the end user still sees coherent text.

*What is tokenized:*

- **Government and financial identifiers:** Social Security Numbers (US), Swedish personnummer and samordningsnummer, payment card numbers (Luhn-validated), IBANs (mod-97-validated), generic bank account and routing numbers
- **Contact identifiers:** email addresses, phone numbers (international and domestic formats), postal codes
- **Dates of birth** (multiple regional formats)
- **Names** of the end customer, their family members, and other individuals referenced in the stored memory blob — pseudonymized using structural hints from the encrypted `memory_file` and `soul_file` (no NLP is run on free text)

Each identifier is replaced with a type-tagged, per-request token such as `[SSN_1]`, `[EMAIL_1]`, `[PHONE_1]`, `[PERSON_1]`. Claude reasons about the tokens as opaque references; our server substitutes the original values back into its response before it is stored or shown to the end customer.

*Second-pass breach detector (defense-in-depth):*

After tokenization, the outbound payload is re-scanned with an independent pattern matcher. If any residual regulated identifier is detected — for example, a novel PII format the tokenizer did not cover — **the request is not sent to Anthropic**. The end user receives a safe retry message, and the incident is recorded in our `pii_breach_log` table (tenant ID, call site, finding types; *no raw values are logged*) for security review.

*Scope and limits:*

- The tokenizer runs on every Anthropic call, in both Managed AI and BYOK modes, whether the tenant holds their own Anthropic agreement or Shenmay AI does.
- The tokenizer is enabled by default for every tenant (`tenants.pii_tokenization_enabled = true`, set by migration 031). A super-administrator can opt a specific tenant out, and a platform-wide kill-switch (`PII_TOKENIZER_ENABLED=false`) is available for emergencies. Either override is recorded.
- The tokenizer is a **reduction**, not an elimination, of PII exposure. A determined user may still type unstructured personal information into the chat that no regex or structured hint can recognize (for example, free-text narrative disclosures). Tenants deploying Shenmay AI in sensitive verticals should continue to configure their agent and end-user consent flows accordingly.
- **Deliberately not tokenized** because doing so would break legitimate agent reasoning: currency amounts, ages expressed as a number, city and country names, and generic medical or life-event terms. The full list is documented internally under change control.

**What Anthropic does with it (per Anthropic's Commercial Terms of Service, current as of April 2026):**

- **Anthropic does not use API inputs or outputs to train their models.** This is a contractual commitment in Anthropic's Commercial Terms — see `https://www.anthropic.com/legal/commercial-terms`.
- Anthropic retains API inputs and outputs for up to **30 days** for trust and safety purposes.
- Anthropic may store flagged content longer (up to 2 years) if it is flagged by automated safety systems.
- **Zero Data Retention (ZDR)** is available under Anthropic's enterprise agreements, which eliminates the 30-day retention window entirely. `[ATTORNEY REVIEW — confirm current ZDR status for the Managed AI plan]`

**Two data-flow modes — BYOK vs Managed AI:**

Shenmay AI offers two ways for Tenants to access Claude. The distinction materially changes which parties act as data controller and processor for the LLM processing step, so it is stated explicitly here:

| Mode | Who holds the Anthropic agreement | Who is controller for the Claude API call |
|---|---|---|
| **BYOK (Bring Your Own Key)** — Starter plan and most self-hosted deployments | The Tenant has their own direct agreement with Anthropic | The **Tenant** is the data controller for their data processed by Anthropic under their own Anthropic account. Shenmay AI routes the request using the Tenant's encrypted API key but has no Anthropic agreement covering the content. |
| **Managed AI** — Growth / Professional plans | Shenmay AI holds the agreement with Anthropic | Shenmay AI is a data processor for the Tenant, and Anthropic is our sub-processor. Our DPA with Anthropic covers the processing. |

In both modes, the end customer's data is transmitted to Anthropic's servers (currently located in the United States) for inference. In BYOK mode, Tenants are responsible for ensuring their end customers have been informed about processing by Anthropic under their Anthropic account terms.

### 6.2 Other Sub-Processors

We use the following third-party services to operate our platform. Each has been assessed for compliance with applicable privacy laws and, where required, has a Data Processing Agreement or equivalent in place.

| Sub-Processor | Purpose | Location | Transfer Mechanism (EEA data) |
|---|---|---|---|
| **Anthropic, Inc.** | AI language model inference (see Section 6.1) | United States | Standard Contractual Clauses (SCCs) `[ATTORNEY REVIEW — confirm]` |
| **Stripe, Inc.** | Payment processing, subscription billing, checkout | United States + Ireland | SCCs / EU-US Data Privacy Framework |
| **Cloudflare, Inc.** | CDN, DDoS protection, DNS, TLS termination, tunnel for staging | Global edge; primary data centre for our zones: EU | SCCs / EU-US Data Privacy Framework |
| **One.com A/S** | Transactional email delivery (SMTP) for verification, notifications, invoices | Denmark (EU) | No transfer mechanism required (EU-to-EU) |
| **Hetzner Online GmbH** | Primary production server infrastructure (SaaS) | Helsinki, Finland (EU) | No transfer mechanism required (EU-to-EU) |
| **GitHub, Inc. (GHCR)** | Container image distribution for self-hosted software updates | United States | SCCs (no end-customer personal data transmitted — image metadata only) |

We maintain an up-to-date list of sub-processors and will notify Tenants of material changes with reasonable advance notice. `[FILL IN: Notification period — standard is 30 days]`

### 6.3 Tenant Businesses

If you are an end customer of a business using Shenmay AI, your data is shared with and managed by that business (the Tenant). The Tenant is the data controller for how they use and display your information within their own operations. Please review the Tenant's own privacy policy for more information about their practices.

### 6.4 Legal Requirements

We may disclose personal data where required by law, court order, or regulatory authority, or where necessary to protect the safety of individuals or the security of our platform. We will contest overly broad requests where appropriate and will notify the affected Tenant (where legally permitted to do so) before disclosing.

## 7. Data Security

We implement appropriate technical and organisational measures to protect personal data:

- All data in transit is encrypted using **TLS 1.2 or higher** (Cloudflare Full (Strict) origin-to-edge; Origin CA certificate from Cloudflare protecting origin-to-Cloudflare traffic)
- Sensitive values (tenant LLM API keys, portal passwords) are encrypted at rest using **AES-256-GCM**
- Portal passwords are hashed with **bcrypt** and never stored in plaintext
- Access to customer data is restricted by **role-based access control** and tenant-scoped isolation
- Every access to sensitive data is recorded in our **audit log**
- Authentication includes brute-force protection and rate limiting
- Standard HTTP security headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and a Content Security Policy) are applied on all portal responses
- Production database backups are encrypted and stored off-host; backup cron runs daily at 03:00 UTC
- Infrastructure is hosted in an EU data centre (Hetzner Helsinki) behind a restrictive firewall (ingress: SSH, HTTP, HTTPS only)

Despite our security measures, no system is 100% secure. In the event of a personal data breach likely to result in a risk to the rights and freedoms of individuals, we will notify affected Tenants without undue delay and, where required by applicable law, the competent supervisory authority within **72 hours** of becoming aware.

`[ATTORNEY REVIEW]` — Consider whether additional controls or certifications should be described for specific Tenant verticals (e.g., GLBA for financial services, HIPAA BAA for US healthcare, SOC 2 Type II where in scope).

## 8. Your Data Rights

Depending on your location, you may have the following rights regarding your personal data:

| Right | What It Means |
|---|---|
| **Right of Access** (GDPR Art. 15 / CCPA §1798.100) | Receive a copy of the personal data we hold about you |
| **Right to Rectification** (GDPR Art. 16) | Correct inaccurate or incomplete data |
| **Right to Erasure** (GDPR Art. 17 / CCPA §1798.105) | Request deletion of your personal data (subject to legal retention obligations) |
| **Right to Restrict Processing** (GDPR Art. 18) | Limit how we use your data in certain circumstances |
| **Right to Data Portability** (GDPR Art. 20 / CCPA §1798.100) | Receive your data in a structured, machine-readable format |
| **Right to Object** (GDPR Art. 21) | Object to processing based on legitimate interests or direct marketing |
| **Right to Withdraw Consent** | Where processing is based on consent, withdraw at any time (without affecting the lawfulness of prior processing) |
| **Right Not to Be Discriminated Against** (CCPA §1798.125) | Exercising your rights will not result in reduced service quality |
| **Right to Lodge a Complaint** (GDPR Art. 77) | Contact your national supervisory authority if you believe we have violated your rights |

We will respond to verified requests **within 30 days** (GDPR) or **45 days** (CCPA). We may need to verify your identity before processing your request. There is no charge for exercising your rights, except where requests are manifestly unfounded or excessive.

**For end customers:** if your data was collected through a Tenant's deployment of Shenmay AI, your primary point of contact for data requests is that Tenant. We will assist the Tenant in fulfilling your request and, where directly required, will respond to you in our capacity as processor.

**Supervisory authority:** If you are located in the EU/EEA, you may lodge a complaint with your national data protection authority. In Sweden this is the **Integritetsskyddsmyndigheten (IMY)** at `imy.se`. `[ATTORNEY REVIEW — confirm relevant authority for primary market]`

## 9. International Data Transfers

Shenmay AI operates primarily from **`[FILL IN: Sweden / primary operating country]`** with production infrastructure hosted in the **European Union (Helsinki, Finland)**.

Some of our sub-processors are located in the **United States** (Anthropic, Stripe, Cloudflare edge, GitHub). When we transfer personal data from the European Economic Area (EEA), UK, or Switzerland to countries not recognised as providing adequate data protection, we rely on:

- **Standard Contractual Clauses (SCCs)** approved by the European Commission
- The **EU-US Data Privacy Framework**, where the sub-processor is certified
- Supplementary technical and organisational measures as described in Section 7

A full list of transfer mechanisms per sub-processor is maintained internally and available on request.

## 10. Our Role as a Data Processor for Tenant Businesses

Where we process personal data on behalf of a Tenant business (for example, operating an AI agent for their end customers), we act as a **data processor** under GDPR Article 28. The Tenant is the **data controller** and is responsible for:

- Ensuring they have a valid lawful basis for processing their end customers' data
- Providing appropriate privacy notices to their end customers
- Configuring Shenmay AI in a way that reflects their lawful-basis choice (e.g., explicit consent capture in the widget)

Shenmay AI and each Tenant enter into a **Data Processing Agreement (DPA)** that sets out our respective obligations, including security measures, sub-processor arrangements, data subject rights assistance, audit rights, and breach notification procedures. Tenants processing EEA personal data at scale, or processing special category data, should request our standard DPA before onboarding. `[FILL IN: Link or contact for obtaining the DPA]`

## 11. Cookies and Tracking Technologies

Our platform uses only strictly necessary cookies and similar technologies:

| Cookie / Technology | Purpose | Duration |
|---|---|---|
| Session JWT | Authenticates your login session | Session (httpOnly) |
| CSRF token | Prevents cross-site request forgery attacks | Session |
| Widget `nomii-conv-id` (localStorage) | Maintains conversation continuity across page loads | Persistent until cleared |

We **do not** use advertising or behavioural tracking cookies. We **do not** embed third-party analytics trackers (Google Analytics, Facebook Pixel, etc.) in the portal or widget. `[ATTORNEY REVIEW — confirm before publication]`

## 12. Children's Privacy

Shenmay AI is not directed at children under the age of **16** (or the applicable minimum age in your jurisdiction — 13 under US COPPA, varying elsewhere under GDPR Article 8). We do not knowingly collect personal data from children. If you believe we have inadvertently collected data from a child, please contact us immediately at the address in Section 1 so we can delete it.

## 13. Changes to This Policy

We may update this Privacy Policy from time to time to reflect changes in our practices, our sub-processor list, or applicable law.

- **Material changes** — we will notify Tenants at least 30 days in advance by email and update the "Last Updated" date
- **Non-material changes** (typos, clarifications) — we will simply update the "Last Updated" date

A version history of this Policy is maintained in our public git repository.

We encourage you to review this Policy periodically. Continued use of the Service after changes constitutes acceptance of the updated Policy.

## 14. Contact and Complaints

To exercise your data rights, make a complaint, or ask questions about this Privacy Policy:

- **Email:** `privacy@pontensolutions.com` `[CONFIRM alias exists]`
- **Post:** `[FILL IN: Full postal address]`

We will acknowledge your request **within 72 hours** and respond in full within 30 days (45 days under CCPA where additional time is required and you are notified).

If you are located in the EU/EEA and are not satisfied with our response, you have the right to contact your national data protection authority. In Sweden: **Integritetsskyddsmyndigheten (IMY)**, `imy.se`.

---

**This document is a working draft pending attorney review. It does not constitute legal advice. Do not publish without sign-off from qualified privacy counsel.**
