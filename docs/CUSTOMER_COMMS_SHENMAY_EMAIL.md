# Shenmay rebrand — customer comms email

**Status:** READY TO SEND. Version 1, polished 2026-04-23 morning after v2.4.0 deployment.
**Superseded by:** nothing — this is the canonical text.
**Do NOT edit the body without Austin's sign-off** — it's the public-facing explanation for the rebrand.

Originally drafted in `docs/SHENMAY_MIGRATION_PLAN.md` §425. That template
was written BEFORE any Phase 5 code shipped; this document is the
post-v2.4.0 polish, updated to reflect what's actually live and what's
still pending (5c/5e/5f).

---

## TL;DR

Send one email + enable a dashboard banner. Informational, no call-to-action
for most customers. Self-hosted operators get one optional to-do
("rename `NOMII_*` → `SHENMAY_*` before Oct") with a 6-month runway.

---

## Send list (33 customers as of 2026-04-23)

```sql
-- Run on Hetzner:
-- ssh nomii@204.168.232.24 "docker exec -i nomii-db psql -U nomii -d nomii_ai"
SELECT
  a.email,
  a.first_name,
  t.name  AS company_name,
  t.slug  AS tenant_slug,
  s.plan
FROM tenant_admins a
JOIN tenants       t ON t.id = a.tenant_id
LEFT JOIN subscriptions s ON s.tenant_id = t.id
WHERE a.email_verified     = TRUE
  AND a.password_hash IS NOT NULL
  AND a.invite_token  IS NULL           -- exclude pending invites
  AND t.is_active          = TRUE
ORDER BY a.email;
```

**Expected size:** ~33 rows (verified as of 2026-04-23 morning).
**Who's excluded:** pending invites (not-yet-activated), soft-deleted tenants, invited-but-not-accepted seats. All correct — we only want customers with a working login.

**Before sending:** spot-check the list for
- Internal test accounts (e.g. `pii-e2e-*@example.test`, `austin@*`) — filter OUT
- Any historical Austin/dev emails you want to receive the email for yourself — leave IN (useful for sanity-check reply rate)
- Duplicates (shouldn't exist due to UNIQUE constraint, but check)

---

## Subject + preheader

**Primary subject:**

> Nomii AI is now Shenmay AI

**Alternate (if A/B testing — but with 33 recipients, don't bother):**

> A new name, same product: we're Shenmay AI now

**Preheader (first-line inbox preview):**

> Same product, same login, same API keys. We're just called Shenmay AI from today.

---

## From identity

- **From name:** `Austin at Shenmay AI`  (personal = higher open rate on a 33-person list)
- **From address:** `hello@shenmay.ai`  (set via `SMTP_FROM` override — requires DNS MX for shenmay.ai to be configured or an SMTP forwarder. If not yet set up, fall back to `hello@pontensolutions.com` which is the current `SMTP_FROM` default per [server/src/services/emailService.js:44](server/src/services/emailService.js:44))
- **Reply-To:** `austin@shenmay.ai` or `austin@pontensolutions.com` — replies should land in Austin's inbox, not /dev/null

**Pre-flight check:** send a test to `austin+test@...` and verify:
1. From name + address render correctly in Gmail web, Outlook desktop, Apple Mail iOS
2. Reply button populates the Reply-To, not From
3. SPF + DKIM pass (Gmail shows "Signed by" in the tiny details panel)

---

## Email body — HTML version

Tone: Scandinavian-editorial. No exclamation marks. No urgency words. Personal first-name-basis. Short paragraphs.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Nomii AI is now Shenmay AI</title>
</head>
<body style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #1A1D1A; background: #F5F1E8; margin: 0; padding: 40px 20px; line-height: 1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background: #FFFFFF; border: 1px solid #D8D0BD; border-radius: 8px; max-width: 560px;">
        <tr><td style="padding: 36px 36px 24px 36px;">
          <!-- Wordmark -->
          <div style="font-size: 20px; font-weight: 500; letter-spacing: -0.5px; color: #1A1D1A; margin-bottom: 28px;">
            Shenmay<span style="color: #0F5F5C;"> ·</span>
          </div>

          <p style="margin: 0 0 16px; font-size: 15px;">Hi {first_name},</p>

          <p style="margin: 0 0 16px; font-size: 15px;">
            A short note: <strong>Nomii AI is now Shenmay AI</strong>. Same product, same team, same login — new name.
          </p>

          <!-- Why -->
          <p style="margin: 20px 0 8px; font-size: 11px; font-weight: 500; letter-spacing: 2px; color: #0F5F5C; text-transform: uppercase; font-family: ui-monospace, Menlo, monospace;">WHY</p>
          <p style="margin: 0 0 16px; font-size: 15px;">
            Our previous name was too close to an existing AI product (<a href="https://nomi.ai" style="color: #0F5F5C;">Nomi.ai</a>), so we moved to something uniquely ours. <em>Shenmay</em> is how <em>"Känn mej"</em> sounds when spoken — Swedish for "know me." That's the idea behind the product.
          </p>

          <!-- What this means -->
          <p style="margin: 20px 0 8px; font-size: 11px; font-weight: 500; letter-spacing: 2px; color: #0F5F5C; text-transform: uppercase; font-family: ui-monospace, Menlo, monospace;">WHAT THIS MEANS FOR YOU</p>
          <p style="margin: 0 0 12px; font-size: 15px;">Everything you already use keeps working. No action required today.</p>
          <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 15px;">
            <li style="margin-bottom: 6px;">Your dashboard now lives at <a href="https://shenmay.ai" style="color: #0F5F5C;">https://shenmay.ai</a>. Your old URL redirects automatically; bookmarks and email links keep working.</li>
            <li style="margin-bottom: 6px;">Your widget embed code is unchanged.</li>
            <li style="margin-bottom: 6px;">Your API keys and webhook signatures keep authenticating.</li>
            <li style="margin-bottom: 6px;">Self-hosted: your <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">.env</code> file keeps working. You'll see one-time deprecation warnings in your backend logs encouraging you to rename <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">NOMII_*</code> to <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">SHENMAY_*</code> at your next maintenance window.</li>
          </ul>

          <!-- Timeline -->
          <p style="margin: 20px 0 8px; font-size: 11px; font-weight: 500; letter-spacing: 2px; color: #0F5F5C; text-transform: uppercase; font-family: ui-monospace, Menlo, monospace;">TIMELINE</p>
          <p style="margin: 0 0 12px; font-size: 15px;">
            The old identifiers will stop being accepted on <strong>2026-10-20</strong> (six months from today). Between now and then, both old and new forms work side by side. Specifically:
          </p>
          <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 15px;">
            <li style="margin-bottom: 6px;">Outbound webhooks now send both <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">X-Nomii-Signature</code> and <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">X-Shenmay-Signature</code> headers with the identical HMAC value. Your receiver can verify on either.</li>
            <li style="margin-bottom: 6px;">New API keys are issued with the <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">shenmay_da_</code> prefix. Existing keys keep authenticating.</li>
            <li style="margin-bottom: 6px;">Self-hosted <code style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #EDE7D7; padding: 1px 4px; border-radius: 3px;">NOMII_*</code> env vars still work but print deprecation warnings. Rename them on your next quiet maintenance window.</li>
          </ul>

          <p style="margin: 20px 0 0; font-size: 15px;">
            Questions — just reply to this email.
          </p>

          <p style="margin: 28px 0 0; font-size: 15px;">
            — Austin
          </p>

          <!-- Footer -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 36px; padding-top: 20px; border-top: 1px solid #D8D0BD;">
            <tr>
              <td style="font-family: ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: 1.5px; color: #6B6B64;">
                SHENMAY AI · A PONTEN SOLUTIONS PRODUCT · <a href="https://shenmay.ai" style="color: #6B6B64; text-decoration: none;">SHENMAY.AI</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## Email body — plain-text fallback

```
Hi {first_name},

A short note: Nomii AI is now Shenmay AI. Same product, same team, same
login — new name.

WHY

Our previous name was too close to an existing AI product (Nomi.ai), so
we moved to something uniquely ours. "Shenmay" is how "Känn mej" sounds
when spoken — Swedish for "know me." That's the idea behind the product.

WHAT THIS MEANS FOR YOU

Everything you already use keeps working. No action required today.

- Your dashboard now lives at https://shenmay.ai. Your old URL redirects
  automatically; bookmarks and email links keep working.
- Your widget embed code is unchanged.
- Your API keys and webhook signatures keep authenticating.
- Self-hosted: your .env file keeps working. You'll see one-time
  deprecation warnings in your backend logs encouraging you to rename
  NOMII_* to SHENMAY_* at your next maintenance window.

TIMELINE

The old identifiers will stop being accepted on 2026-10-20 (six months
from today). Between now and then, both old and new forms work side by
side. Specifically:

- Outbound webhooks now send both X-Nomii-Signature and
  X-Shenmay-Signature headers with the identical HMAC value. Your
  receiver can verify on either.
- New API keys are issued with the shenmay_da_ prefix. Existing keys
  keep authenticating.
- Self-hosted NOMII_* env vars still work but print deprecation
  warnings. Rename them on your next quiet maintenance window.

Questions — just reply to this email.

— Austin

---
Shenmay AI · a Ponten Solutions product · https://shenmay.ai
```

---

## In-portal dashboard banner (reinforcement, post-email)

Show for ~30 days on first login per user (dismissible). Copy:

> **Nomii AI is now Shenmay AI.** Same product, new name. Your integrations keep working. [Read the announcement →](mailto:austin@shenmay.ai?subject=Shenmay+rebrand+question)

Palette: teal background (`#0F5F5C` at 6% opacity), ink text, paper-edge border. Implementation note: piggyback on the existing `ShenmayDashboardLayout` notification-panel pattern — look for the ink-trial banner for reference.

---

## Delivery channel

**Use the existing One.com SMTP path in `server/src/services/emailService.js`** — no new vendor needed. Write a one-off script:

```bash
# scripts/send-shenmay-rebrand-email.js  (don't commit — ad-hoc)
# Pulls the send-list via the SQL above, loops, sends via the existing
# nodemailer transporter. Throttle to 1/sec to keep One.com happy.
```

Or (simpler) hand-deliver: 33 is small enough that BCC-ing them in one message from Austin's own inbox also works, but personalisation (first-name merge) won't happen — the greeting will read "Hi there,".

**Recommendation:** script it. The first-name merge is worth the 20 minutes of setup on 33 recipients.

**Rate limiting:** One.com allows ~60 emails/min on standard plans. 33 recipients at 1/sec → 33 seconds. Well under any threshold.

---

## Pre-send checklist

- [ ] Pull the send-list — confirm row count (~33) matches expectation
- [ ] Spot-check the list: remove internal `@example.test` addresses, keep Austin's own inbox as a recipient
- [ ] Test-send to Austin's personal Gmail + a secondary inbox (Outlook or ProtonMail for rendering diff)
- [ ] Verify in the test: From name + address, Reply-To, subject, preheader, all links clickable
- [ ] Verify SPF + DKIM pass in the test (Gmail → "View original" → look for "PASS")
- [ ] Dry-run the sending script with `DRY_RUN=true` — prints to-addresses but doesn't send
- [ ] Flip the switch
- [ ] Watch the inbox for replies + bounces for the next 24h

---

## Timing

- **Best windows:** Tuesday–Thursday, 10am–2pm customer's local time. The customer list is small enough that we don't need to segment by timezone.
- **Avoid:** Fridays (replies won't get actioned till Monday), weekends, holidays.
- **Earliest acceptable send:** immediately after v2.4.0 Hetzner deploy is verified stable for 24h (= 2026-04-24 morning).
- **Latest acceptable send:** before Phase 5c (localStorage migration) or 5f (WP plugin URL change) merges — both of those make the rebrand more visible and customers deserve the heads-up first.

---

## Why this email is NOT gated behind Phase 5c/5f

The template in `docs/SHENMAY_MIGRATION_PLAN.md` originally said "send
BEFORE Phase 5 merges." That advice was written before any Phase 5
sub-PR had shipped. Since v2.4.0 went live this morning, the
customer-visible surface of Phase 5a+5b+5d+5g is *zero* — it's all
silent backend dual-emit. Customers won't notice until:

1. They log into the portal and see the Direction B visual redesign (already
   shipped at v2.3.0)
2. They notice the new `@visitor.shenmay` addresses in their anon-customer
   list (cosmetic only)
3. They see the `shenmay_da_` prefix on any newly-generated API key (new
   issuance only)

None of those require the email to land first. The email should land
BEFORE 5c + 5f because those DO change something customer-facing
(localStorage migration may cause a one-time re-login; WP plugin URL
change could briefly be caught by an over-zealous auto-updater).

---

## Post-send follow-ups

- **Monitor replies for 48h.** Bucket into: acknowledgement / question / bug-report / opt-out. Bug-reports take priority.
- **Add the FAQ to the product page.** If >3 customers ask the same question, it's the first entry on a future `shenmay.ai/rebrand` page.
- **Update this doc.** Mark `Status: SENT on YYYY-MM-DD` at the top, note bounce rate, summarise common replies.
- **Kick off Phase 5c.** Once the email is out and 48h have passed with no blocking questions, merge Phase 5c (localStorage migration).

---

## Changelog

- **2026-04-23 (morning):** polished from rough template in `docs/SHENMAY_MIGRATION_PLAN.md:425`. Added HTML email, plain-text fallback, send-list query, delivery script sketch, pre-send checklist, timing + post-send follow-ups, portal banner copy.
