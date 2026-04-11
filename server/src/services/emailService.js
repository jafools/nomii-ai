/**
 * NOMII AI — Email Service
 *
 * Sends transactional emails via One.com SMTP (nodemailer).
 *
 * Required env vars:
 *   SMTP_HOST     — e.g. send.one.com
 *   SMTP_PORT     — 465 (SSL) or 587 (STARTTLS)
 *   SMTP_SECURE   — "true" for port 465, "false" for 587
 *   SMTP_USER     — your One.com email address
 *   SMTP_PASS     — your One.com email password
 *   SMTP_FROM     — From address, e.g. "Nomii AI <hello@pontensolutions.com>"
 *   APP_URL       — Base URL for links, e.g. https://pontensolutions.com
 */

const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'send.one.com',
    port:   parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false', // true by default (SSL)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.SMTP_FROM || 'Nomii AI <hello@pontensolutions.com>';
const APP_URL = (process.env.APP_URL || 'https://app.pontensolutions.com').replace(/\/$/, '');
const SMTP_USER = process.env.SMTP_USER;
// Derive the public domain from APP_URL for use in email footers
const APP_DOMAIN = APP_URL.replace(/^https?:\/\//, '').split('/')[0];
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || `support@${APP_DOMAIN}`;
const CONTACT_URL = process.env.CONTACT_URL || `${APP_URL}/contact`;

// Build tenant-customized From / Reply-To / footer for outgoing emails
function tenantFrom(tenantEmail) {
  if (!tenantEmail || !tenantEmail.email_from_name) return FROM;
  // Keep the actual sending address the same (SMTP requirement) but change display name
  const smtpAddr = SMTP_USER || FROM.match(/<(.+)>/)?.[1] || `noreply@${APP_DOMAIN}`;
  return `${tenantEmail.email_from_name} <${smtpAddr}>`;
}
function tenantReplyTo(tenantEmail) {
  return (tenantEmail && tenantEmail.email_reply_to) || undefined;
}
function tenantFooterHtml(tenantEmail) {
  if (!tenantEmail || !tenantEmail.email_footer) return `Nomii AI &middot; ${APP_DOMAIN}`;
  // Escape HTML entities for safety
  const safe = tenantEmail.email_footer.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return safe;
}
function tenantFooterText(tenantEmail) {
  if (!tenantEmail || !tenantEmail.email_footer) return `Nomii AI · ${APP_DOMAIN}`;
  return tenantEmail.email_footer;
}


// ── Send verification email ────────────────────────────────────────────────

async function sendVerificationEmail({ to, token, firstName }) {
  const verifyUrl = `${APP_URL}/nomii/verify-email?token=${token}`;
  const name = firstName || 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1E3A5F;border-radius:12px;padding:10px 18px;font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
    </div>
    <h1 style="font-size:22px;color:#1a2332;margin:0 0 12px;">Confirm your email address</h1>
    <p style="color:#4a5568;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Hi ${name}, thanks for signing up for Nomii AI. Click the button below to verify your email and get started.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${verifyUrl}"
         style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Verify Email Address
      </a>
    </div>
    <p style="color:#718096;font-size:13px;line-height:1.6;margin:0;">
      This link expires in 24 hours. If you didn't sign up for Nomii AI, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #e4e7ed;margin:32px 0;">
    <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
      Nomii AI · ${APP_DOMAIN}
    </p>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nThanks for signing up for Nomii AI.\n\nVerify your email address by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nNomii AI`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    // Dev mode: log instead of sending
    console.log(`[Email] SMTP not configured — verification link for ${to}:`);
    console.log(`[Email] ${verifyUrl}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Verify your Nomii AI account',
    text,
    html,
  });

  console.log(`[Email] Verification email sent to ${to}`);
}


// ── Send welcome email (after verification) ────────────────────────────────

async function sendWelcomeEmail({ to, firstName, companyName }) {
  const dashboardUrl = `${APP_URL}/nomii/onboarding`;
  const name = firstName || 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1E3A5F;border-radius:12px;padding:10px 18px;font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
    </div>
    <h1 style="font-size:22px;color:#1a2332;margin:0 0 12px;">Welcome to Nomii AI, ${name}! 🎉</h1>
    <p style="color:#4a5568;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Your account for <strong>${companyName}</strong> is ready. Let's get your AI agent set up — it only takes a few minutes.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${dashboardUrl}"
         style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Set Up My Agent
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #e4e7ed;margin:32px 0;">
    <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
      Nomii AI · ${APP_DOMAIN}
    </p>
  </div>
</body>
</html>`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] Welcome email would be sent to ${to} (SMTP not configured)`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `Welcome to Nomii AI — let's set up ${companyName}`,
    text:    `Hi ${name},\n\nWelcome to Nomii AI! Your account for ${companyName} is ready.\n\nSet up your agent: ${dashboardUrl}\n\nNomii AI`,
    html,
  });

  console.log(`[Email] Welcome email sent to ${to}`);
}


// ── Send password-reset email ───────────────────────────────────────────────

async function sendPasswordResetEmail({ to, token, firstName }) {
  const resetUrl = `${APP_URL}/nomii/reset-password?token=${token}`;
  const name = firstName || 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:#1E3A5F;border-radius:12px;padding:10px 18px;font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
    </div>
    <h1 style="font-size:22px;color:#1a2332;margin:0 0 12px;">Reset your password</h1>
    <p style="color:#4a5568;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Hi ${name}, we received a request to reset your password. Click the button below to choose a new one.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Reset Password
      </a>
    </div>
    <p style="color:#718096;font-size:13px;line-height:1.6;margin:0;">
      This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
    </p>
    <hr style="border:none;border-top:1px solid #e4e7ed;margin:32px 0;">
    <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
      Nomii AI &middot; ${APP_DOMAIN}
    </p>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nWe received a request to reset your Nomii AI password.\n\nReset your password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.\n\nNomii AI`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] SMTP not configured — password reset link for ${to}:`);
    console.log(`[Email] ${resetUrl}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Reset your Nomii AI password',
    text,
    html,
  });

  console.log(`[Email] Password reset email sent to ${to}`);
}


// ── Send trial limit reached email ─────────────────────────────────────────

async function sendTrialLimitEmail({ to, firstName, tenantName }) {
  const pricingUrl = `${APP_URL}/nomii/dashboard/plans`;
  const contactUrl = CONTACT_URL;
  const name = firstName || 'there';
  const company = tenantName || 'your account';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">

    <!-- Header -->
    <div style="background:#1E3A5F;padding:28px 40px;">
      <div style="font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px;">
      <h1 style="font-size:21px;color:#1a2332;margin:0 0 14px;">Your trial has reached its limit</h1>
      <p style="color:#4a5568;font-size:15px;line-height:1.65;margin:0 0 20px;">
        Hi ${name}, your Nomii AI trial for <strong>${company}</strong> has used up all of its included
        messages or customers. Your AI agents are currently paused until you upgrade to a paid plan.
      </p>

      <!-- Limit summary box -->
      <div style="background:#fff8f0;border:1px solid #fde8c8;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">Trial Plan Limits</p>
        <ul style="margin:8px 0 0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.7;">
          <li>1 customer</li>
          <li>20 AI messages per month</li>
        </ul>
      </div>

      <p style="color:#4a5568;font-size:15px;line-height:1.65;margin:0 0 28px;">
        Upgrade now to restore your agents instantly and unlock more customers, more messages,
        and full AI capabilities for your business.
      </p>

      <!-- CTAs -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <a href="${pricingUrl}"
           style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin-bottom:10px;">
          View Pricing Plans
        </a>
        <a href="${contactUrl}"
           style="display:inline-block;background:#fff;color:#1E3A5F;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;border:1.5px solid #1E3A5F;margin-bottom:10px;">
          Talk to Sales
        </a>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid #e4e7ed;margin:0;">
    <div style="padding:20px 40px;">
      <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
        Nomii AI &middot; ${APP_DOMAIN}
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nYour Nomii AI trial for ${company} has reached its limit (1 customer, 20 messages).\n\nYour AI agents are paused until you upgrade.\n\nView pricing: ${pricingUrl}\nTalk to sales: ${contactUrl}\n\nNomii AI`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] SMTP not configured — trial limit email would be sent to ${to}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Your Nomii AI trial has reached its limit — upgrade to continue',
    text,
    html,
  });

  console.log(`[Email] Trial limit email sent to ${to}`);
}


// ── Send concern raised notification email ─────────────────────────────────

async function sendConcernEmail({ to, firstName, customerName, customerEmail, description, conversationId, tenantEmail }) {
  const concernUrl = `${APP_URL}/nomii/dashboard/concerns`;
  const name = firstName || 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">

    <!-- Header -->
    <div style="background:#1E3A5F;padding:28px 40px;">
      <div style="font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
    </div>

    <!-- Alert bar -->
    <div style="background:#FEF3C7;border-bottom:1px solid #FDE68A;padding:12px 40px;">
      <p style="margin:0;color:#92400E;font-size:13px;font-weight:600;">⚠ New concern raised by a customer</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <h1 style="font-size:20px;color:#1a2332;margin:0 0 20px;">A customer needs human support</h1>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="border-bottom:1px solid #E5E7EB;">
          <td style="padding:10px 0;color:#6B7280;font-size:13px;width:120px;">Customer</td>
          <td style="padding:10px 0;color:#1a2332;font-size:13px;font-weight:600;">${customerName || 'Unknown'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E5E7EB;">
          <td style="padding:10px 0;color:#6B7280;font-size:13px;">Email</td>
          <td style="padding:10px 0;color:#1a2332;font-size:13px;">${customerEmail || '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6B7280;font-size:13px;vertical-align:top;">Message</td>
          <td style="padding:10px 0;color:#1a2332;font-size:13px;line-height:1.6;">${description || 'Customer requested human support via chat widget.'}</td>
        </tr>
      </table>

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${concernUrl}"
           style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
          View in Dashboard
        </a>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid #e4e7ed;margin:0;">
    <div style="padding:20px 40px;">
      <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
        ${tenantFooterHtml(tenantEmail)}
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nA customer has raised a concern and needs human support.\n\nCustomer: ${customerName}\nEmail: ${customerEmail}\nMessage: ${description}\n\nView it in your dashboard: ${concernUrl}\n\n${tenantFooterText(tenantEmail)}`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] SMTP not configured — concern email would be sent to ${to}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    tenantFrom(tenantEmail),
    replyTo: tenantReplyTo(tenantEmail),
    to,
    subject: `⚠ Concern raised by ${customerName || 'a customer'} — action needed`,
    text,
    html,
  });

  console.log(`[Email] Concern email sent to ${to}`);
}


// ── Send agent invite email ─────────────────────────────────────────────────

async function sendAgentInviteEmail({ to, firstName, inviterName, tenantName, inviteUrl }) {
  const name    = firstName || null;
  const invited = inviterName || 'Your team';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">

    <!-- Header -->
    <div style="background:#1E3A5F;padding:28px 40px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px;">
      <h1 style="font-size:22px;color:#1a2332;margin:0 0 14px;">
        You're invited to join ${tenantName}
      </h1>
      <p style="color:#4a5568;font-size:15px;line-height:1.65;margin:0 0 24px;">
        ${invited} has invited ${name ? `<strong>${name}</strong>` : 'you'} to join
        <strong>${tenantName}</strong> as a support agent on Nomii AI — the personalised AI
        assistant platform.
      </p>

      <!-- What to expect box -->
      <div style="background:#f0f4ff;border:1px solid #d4deff;border-radius:8px;padding:18px 22px;margin-bottom:28px;">
        <p style="margin:0 0 8px;color:#3730a3;font-size:13px;font-weight:600;">What you'll be able to do</p>
        <ul style="margin:0;padding-left:18px;color:#4338ca;font-size:13px;line-height:1.8;">
          <li>Monitor and reply to customer conversations</li>
          <li>Take over chats from the AI when a human touch is needed</li>
          <li>View customer profiles and history</li>
        </ul>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${inviteUrl}"
           style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
          Accept Invitation
        </a>
      </div>

      <p style="color:#718096;font-size:13px;line-height:1.6;margin:16px 0 0;text-align:center;">
        This invitation expires in 7&nbsp;days. If you weren't expecting this, you can safely ignore it.
      </p>
    </div>

    <hr style="border:none;border-top:1px solid #e4e7ed;margin:0;">
    <div style="padding:20px 40px;">
      <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
        Nomii AI &middot; ${APP_DOMAIN}
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi${name ? ` ${name}` : ''},\n\n${invited} has invited you to join ${tenantName} as a support agent on Nomii AI.\n\nAccept your invitation:\n${inviteUrl}\n\nThis invitation expires in 7 days.\n\nNomii AI`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] SMTP not configured — invite link for ${to}:`);
    console.log(`[Email] ${inviteUrl}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `You've been invited to join ${tenantName} on Nomii AI`,
    text,
    html,
  });

  console.log(`[Email] Agent invite email sent to ${to}`);
}


// ── Send flag notification email (to advisor when agent raises a flag) ───────

async function sendFlagNotificationEmail({
  to, advisorName, customerName, flagType, severity, description,
  conversationId, tenantName, dashboardUrl: customDashboardUrl, tenantEmail,
}) {
  const name        = advisorName || 'Advisor';
  const cust        = customerName || 'A customer';
  const type        = (flagType || 'general').replace(/_/g, ' ');
  const dashUrl     = customDashboardUrl || `${APP_URL}/nomii/dashboard/conversations`;

  const severityColors = {
    critical: { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', badge: '#EF4444' },
    high:     { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', badge: '#F97316' },
    medium:   { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', badge: '#F59E0B' },
    low:      { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', badge: '#22C55E' },
  };
  const sc = severityColors[severity] || severityColors.medium;
  const sevLabel = (severity || 'medium').charAt(0).toUpperCase() + (severity || 'medium').slice(1);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <!-- Header -->
    <div style="background:#1E3A5F;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;">Nomii AI</div>
      <div style="background:${sc.badge};color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">
        ${sevLabel} Alert
      </div>
    </div>

    <div style="padding:32px;">
      <h1 style="font-size:20px;color:#1a2332;margin:0 0 8px;">Flag Raised During Conversation</h1>
      <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Hi ${name}, your AI agent flagged a conversation that needs your attention.
      </p>

      <!-- Flag details card -->
      <div style="background:${sc.bg};border:1px solid ${sc.border};border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding:0 0 12px;width:110px;vertical-align:top;">Customer</td>
            <td style="color:#1a2332;font-size:14px;font-weight:600;padding:0 0 12px;">${cust}</td>
          </tr>
          <tr>
            <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding:0 0 12px;vertical-align:top;">Flag Type</td>
            <td style="color:${sc.text};font-size:14px;font-weight:600;padding:0 0 12px;text-transform:capitalize;">${type}</td>
          </tr>
          <tr>
            <td style="color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding:0;vertical-align:top;">Details</td>
            <td style="color:#4a5568;font-size:14px;line-height:1.5;padding:0;">${description}</td>
          </tr>
        </table>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${dashUrl}"
           style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
          Review Conversation
        </a>
      </div>

      <p style="color:#718096;font-size:13px;line-height:1.6;margin:16px 0 0;text-align:center;">
        This is an automated alert from ${tenantName || 'your Nomii AI agent'}. Review and resolve this flag in your dashboard.
      </p>
    </div>

    <hr style="border:none;border-top:1px solid #e4e7ed;margin:0;">
    <div style="padding:16px 32px;">
      <p style="color:#a0aec0;font-size:12px;margin:0;text-align:center;">
        ${tenantFooterHtml(tenantEmail)}
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nYour AI agent raised a ${sevLabel} flag for customer ${cust}.\n\nType: ${type}\nDetails: ${description}\n\nReview the conversation: ${dashUrl}\n\n${tenantFooterText(tenantEmail)}`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] Flag notification (SMTP not configured) — ${sevLabel} flag for ${cust} → ${to}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    tenantFrom(tenantEmail),
    replyTo: tenantReplyTo(tenantEmail),
    to,
    subject: `[${sevLabel}] Flag raised for ${cust} — ${tenantName || 'Nomii AI'}`,
    text,
    html,
  });

  console.log(`[Email] Flag notification sent to ${to} (${sevLabel} — ${cust})`);
}


// ── Send document / report email ───────────────────────────────────────────
// Called by the send_document universal tool.
// Formats the agent-assembled report as a clean branded HTML email.

async function sendDocumentEmail({
  to,
  customerName,
  agentName,
  tenantName,
  subject,
  summary,
  sections,    // [{ heading, content }]
  nextSteps,   // string[] | null
  disclaimer,
}) {
  const name       = customerName || 'there';
  const sender     = agentName    || tenantName || 'Nomii AI';
  const org        = tenantName   || 'Nomii AI';
  const today      = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const sectionsHtml = (sections || []).map(s => `
    <div style="margin-bottom:24px;">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1E3A5F;">${s.heading}</h3>
      <p style="margin:0;font-size:14px;color:#3d4f66;line-height:1.7;">${(s.content || '').replace(/\n/g, '<br>')}</p>
    </div>`).join('');

  const nextStepsHtml = nextSteps && nextSteps.length > 0 ? `
    <div style="background:#f0f6ff;border-left:4px solid #1E3A5F;border-radius:6px;padding:16px 20px;margin-top:24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:.5px;">Next Steps</p>
      <ul style="margin:0;padding-left:18px;">
        ${nextSteps.map(s => `<li style="font-size:14px;color:#3d4f66;line-height:1.7;margin-bottom:4px;">${s}</li>`).join('')}
      </ul>
    </div>` : '';

  const disclaimerHtml = disclaimer
    ? `<p style="font-size:11px;color:#9ba8b8;line-height:1.6;margin-top:24px;padding-top:16px;border-top:1px solid #eef0f4;">${disclaimer}</p>`
    : `<p style="font-size:11px;color:#9ba8b8;line-height:1.6;margin-top:24px;padding-top:16px;border-top:1px solid #eef0f4;">This document is for informational and educational purposes only. It does not constitute professional, legal, or financial advice. Please consult a qualified professional before making decisions based on this information.</p>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.07);">

    <!-- Header -->
    <div style="background:#1E3A5F;padding:28px 36px;">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,.6);font-weight:600;text-transform:uppercase;letter-spacing:.8px;">${org}</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#fff;">${subject}</h1>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px;">
      <p style="margin:0 0 6px;font-size:14px;color:#6b7585;">Prepared for <strong style="color:#1a2332;">${name}</strong></p>
      <p style="margin:0 0 24px;font-size:13px;color:#9ba8b8;">${today} · Prepared by ${sender}</p>

      <!-- Summary -->
      <div style="background:#f8f9fb;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0;font-size:15px;color:#1a2332;line-height:1.7;">${summary}</p>
      </div>

      <!-- Sections -->
      ${sectionsHtml}

      <!-- Next Steps -->
      ${nextStepsHtml}

      ${disclaimerHtml}
    </div>

    <!-- Footer -->
    <div style="background:#f8f9fb;padding:18px 36px;text-align:center;border-top:1px solid #eef0f4;">
      <p style="margin:0;font-size:12px;color:#9ba8b8;">Sent by ${sender} via <strong style="color:#6b7585;">Nomii AI</strong> · ${APP_DOMAIN}</p>
    </div>
  </div>
</body>
</html>`;

  const text = `${subject}\n\nPrepared for: ${name}\nDate: ${today}\n\n${summary}\n\n${
    (sections || []).map(s => `${s.heading}\n${s.content}`).join('\n\n')
  }\n\n${nextSteps?.length ? 'Next Steps:\n' + nextSteps.map(s => `• ${s}`).join('\n') : ''}\n\n${
    disclaimer || 'This document is for informational purposes only.'
  }`;

  const transporter = createTransporter();
  await transporter.sendMail({ from: FROM, to, subject, text, html });

  console.log(`[Email] Document sent to ${to}: "${subject}"`);
}


// ── Send human-mode reply notification (customer replied while agent has taken over) ──

async function sendHumanModeReplyEmail({ to, agentName, customerName, customerEmail, messageSnippet, conversationId, tenantEmail }) {
  const name    = agentName   || 'Agent';
  const cust    = customerName || 'A customer';
  const dashUrl = `${APP_URL}/nomii/dashboard/conversations/${conversationId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <div style="background:#1E3A5F;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:18px;color:#fff;font-weight:700;">Nomii AI</div>
      <div style="background:rgba(16,185,129,0.25);color:#10B981;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;">HUMAN MODE</div>
    </div>
    <div style="padding:28px 32px;">
      <h1 style="font-size:19px;color:#1a2332;margin:0 0 12px;">Customer replied — they're waiting for you</h1>
      <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Hi ${name}, <strong>${cust}</strong>${customerEmail ? ` (${customerEmail})` : ''} sent a message in the conversation you've taken over.
      </p>
      ${messageSnippet ? `
      <div style="background:#f8f9fb;border-left:3px solid #1E3A5F;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#374151;font-style:italic;">"${messageSnippet.slice(0, 200)}${messageSnippet.length > 200 ? '…' : ''}"</p>
      </div>` : ''}
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${dashUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;">Reply Now</a>
      </div>
    </div>
    <hr style="border:none;border-top:1px solid #e4e7ed;margin:0;">
    <div style="padding:16px 32px;text-align:center;">
      <p style="color:#a0aec0;font-size:12px;margin:0;">${tenantFooterHtml(tenantEmail)}</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\n${cust} replied in the conversation you've taken over.\n\n${messageSnippet ? `"${messageSnippet.slice(0, 200)}"\n\n` : ''}Reply now: ${dashUrl}\n\n${tenantFooterText(tenantEmail)}`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Email] Human mode reply (SMTP not configured) — ${cust} replied → would notify ${to}`);
    return;
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    tenantFrom(tenantEmail),
    replyTo: tenantReplyTo(tenantEmail),
    to,
    subject: `💬 ${cust} is waiting for your reply — Nomii AI`,
    text,
    html,
  });

  console.log(`[Email] Human mode reply notification sent to ${to} (customer: ${cust})`);
}


// ============================================================
// sendLicenseKeyEmail — deliver a self-hosted license key
// ============================================================
async function sendLicenseKeyEmail({ to, firstName, licenseKey, plan, expiresAt }) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[Email] SMTP not configured — skipping license key email');
    return;
  }

  const expiryLine = expiresAt
    ? `<p style="margin:0 0 12px">Your license is valid until <strong>${new Date(expiresAt).toDateString()}</strong>. Renew before it expires to avoid interruption.</p>`
    : `<p style="margin:0 0 12px">Your license has <strong>no expiry date</strong> — it will remain active until cancelled.</p>`;

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
  <div style="display:inline-block;background:#1E3A5F;border-radius:12px;padding:10px 18px;font-size:18px;color:#fff;font-weight:700;letter-spacing:0.5px;margin-bottom:24px;">Nomii AI</div>
  <h2 style="margin:0 0 16px;color:#111827">Your Nomii AI License Key</h2>
  <p style="margin:0 0 12px;color:#374151">Hi ${firstName},</p>
  <p style="margin:0 0 12px;color:#374151">Thanks for your Nomii AI self-hosted license. Here is your key:</p>
  <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:16px;margin:16px 0;text-align:center">
    <code style="font-size:18px;letter-spacing:2px;color:#111827;font-weight:700">${licenseKey}</code>
  </div>
  <p style="margin:0 0 8px;color:#374151"><strong>Plan:</strong> ${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
  ${expiryLine}
  <p style="margin:16px 0 8px;color:#374151"><strong>How to activate:</strong></p>
  <ol style="margin:0 0 16px;padding-left:20px;color:#374151">
    <li style="margin-bottom:6px">Open the <code>.env</code> file in your Nomii installation directory.</li>
    <li style="margin-bottom:6px">Add this line: <code>NOMII_LICENSE_KEY=${licenseKey}</code></li>
    <li style="margin-bottom:6px">Restart: <code>docker compose -f docker-compose.selfhosted.yml up -d</code></li>
  </ol>
  <p style="margin:0;color:#6b7280;font-size:13px">Keep this key private. Do not share it or commit it to version control. If you lose it, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
  ${tenantFooterHtml()}
</div>
</body></html>`;

  const text = `Your Nomii AI License Key\n\nHi ${firstName},\n\nYour license key is:\n\n  ${licenseKey}\n\nPlan: ${plan}\n${expiresAt ? `Expires: ${new Date(expiresAt).toDateString()}\n` : 'No expiry date.\n'}\nTo activate, add this to your .env file:\n  NOMII_LICENSE_KEY=${licenseKey}\n\nThen restart: docker compose -f docker-compose.selfhosted.yml up -d\n\nKeep this key private.\n`;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Your Nomii AI License Key',
    html,
    text,
  });
}

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendTrialLimitEmail,
  sendConcernEmail,
  sendAgentInviteEmail,
  sendFlagNotificationEmail,
  sendDocumentEmail,
  sendHumanModeReplyEmail,
  sendLicenseKeyEmail,
};
