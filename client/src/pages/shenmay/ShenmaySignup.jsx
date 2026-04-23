import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as apiRegister, setToken, resendVerification } from "@/lib/shenmayApi";
import { DEPLOYMENT_MODES } from "@/lib/constants";
import { ArrowRight, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import ShenmaySeal from "@/components/shenmay/ShenmaySeal";
import {
  TOKENS as T,
  Kicker,
  Display,
  Lede,
  Field,
  Input,
  Select,
  Button,
  Notice,
  PageShell,
} from "@/components/shenmay/ui/ShenmayUI";

const INDUSTRIES = [
  { value: "financial",  label: "Financial" },
  { value: "retirement", label: "Retirement" },
  { value: "ministry",   label: "Ministry" },
  { value: "healthcare", label: "Healthcare" },
  { value: "insurance",  label: "Insurance" },
  { value: "education",  label: "Education" },
  { value: "ecommerce",  label: "E-commerce" },
  { value: "other",      label: "Other" },
];

const getStrength = (pw) => {
  if (pw.length === 0) return null;
  if (pw.length < 8) return { text: "Min. 8 characters", color: T.danger, pct: 20 };
  let s = 0;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (s <= 1) return { text: "Weak — try symbols", color: T.warning, pct: 40 };
  if (s <= 2) return { text: "Getting stronger",   color: T.teal,    pct: 70 };
  return                  { text: "Strong password",   color: T.tealDark,pct: 100 };
};

const CheckEmailState = ({ email }) => {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try { await resendVerification(email); setResent(true); setTimeout(() => setResent(false), 4000); }
    catch {} finally { setResending(false); }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: T.paperDeep, border: `1px solid ${T.paperEdge}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
        <Mail size={34} color={T.teal} />
      </div>
      <Kicker>Check your inbox</Kicker>
      <Display size={32} italic style={{ marginTop: 10 }}>One more step.</Display>
      <Lede style={{ marginTop: 12, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
        We've sent a verification link to <strong style={{ color: T.ink }}>{email}</strong>. Click it to activate your account.
      </Lede>
      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Button variant="linky" onClick={handleResend} disabled={resending || resent}>
          {resent ? "Sent — check your inbox" : resending ? "Sending…" : "Resend verification email"}
        </Button>
        <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.mute, textDecoration: "none" }}>
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </div>
    </div>
  );
};

const ShenmaySignup = () => {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "",
    password: "", confirmPassword: "", companyName: "", vertical: "",
    tosAccepted: false, dataRightsConfirmed: false, newsletterOptIn: false,
  });
  const [error, setError] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { if (d.deployment === DEPLOYMENT_MODES.SELFHOSTED) navigate("/login", { replace: true }); })
      .catch(() => {});
  }, [navigate]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === "companyName") setCompanyError("");
    if (k === "confirmPassword" && !confirmTouched) setConfirmTouched(true);
  };
  const strength = getStrength(form.password);
  const passwordsMismatch = confirmTouched && form.confirmPassword.length > 0 && form.password !== form.confirmPassword;
  const canSubmit = !loading && form.password.length >= 8 && form.confirmPassword.length > 0 && form.password === form.confirmPassword && form.tosAccepted && form.dataRightsConfirmed;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setCompanyError("");
    const t = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), password: form.password, companyName: form.companyName.trim(), vertical: form.vertical };
    if (!t.firstName || !t.lastName || !t.email || !t.password || !t.companyName || !t.vertical) { setError("Please fill in all fields."); return; }
    if (t.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!form.tosAccepted || !form.dataRightsConfirmed) { setError("Please accept the terms and confirm your data rights before continuing."); return; }
    setLoading(true);
    try {
      const data = await apiRegister(t.email, t.password, t.firstName, t.lastName, t.companyName, t.vertical, true, form.newsletterOptIn);
      if (data.pending_verification) setPendingEmail(data.email || t.email);
      else if (data.token) { setToken(data.token); navigate("/onboarding"); }
    } catch (err) {
      const msg = err.message || "Registration failed.";
      if ((msg.toLowerCase().includes("company") && msg.toLowerCase().includes("taken")) || err.code === "company_name_taken") {
        setCompanyError("This company name is already registered. Please use a different name.");
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  };

  return (
    <PageShell style={{ display: "flex" }}>
      {/* ── LEFT editorial panel ───────────────────────────── */}
      <aside
        className="shenmay-signup-aside"
        style={{
          display: "none",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "42%",
          background: T.paperDeep,
          borderRight: `1px solid ${T.paperEdge}`,
          padding: "52px 56px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div>
          <a href="https://pontensolutions.com" style={{ textDecoration: "none", display: "inline-block" }}>
            <ShenmayWordmark size={28} />
          </a>
          <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: T.mute, marginTop: 10 }}>
            by Pontén Solutions
          </div>
        </div>

        <div style={{ maxWidth: 480 }}>
          <Kicker style={{ marginBottom: 20 }}>Figure 01 · What you're about to deploy</Kicker>
          <Display size={40} italic>An agent that knows your</Display>
          <Display size={40} italic={false} style={{ fontWeight: 500 }}>customers — one by one.</Display>
          <Lede style={{ fontSize: 16, marginTop: 20, maxWidth: 440 }}>
            Not a generic chatbot. A persistent agent with Soul (personality + policy) and Memory (every interaction kept) — deployed to your site in minutes.
          </Lede>
          <div style={{ marginTop: 28, fontFamily: T.mono, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: T.mute }}>
            /ʃɛn.meɪ/ &nbsp;·&nbsp; Känn mig &nbsp;·&nbsp; Know me
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, borderTop: `1px solid ${T.paperEdge}`, paddingTop: 20 }}>
          {[
            { k: "Soul",    v: "Personality + policy" },
            { k: "Memory",  v: "Every interaction kept" },
            { k: "Control", v: "Human-in-the-loop" },
          ].map((o) => (
            <div key={o.k}>
              <Kicker style={{ fontSize: 10, letterSpacing: "0.18em" }}>{o.k}</Kicker>
              <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4 }}>{o.v}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", top: 40, right: 40, opacity: 0.9 }}>
          <ShenmaySeal size={90} paper={T.paperDeep} />
        </div>
      </aside>

      <style>{`
        @media (min-width: 1024px) {
          .shenmay-signup-aside { display: flex !important; }
        }
      `}</style>

      {/* ── RIGHT form ────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "52px 24px 64px", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          {/* mobile wordmark */}
          <div className="shenmay-signup-mobile-mark" style={{ marginBottom: 32, display: "flex", justifyContent: "center" }}>
            <ShenmayWordmark size={24} />
          </div>
          <style>{`@media (min-width: 1024px) { .shenmay-signup-mobile-mark { display: none !important; } }`}</style>

          {pendingEmail ? (
            <CheckEmailState email={pendingEmail} />
          ) : (
            <>
              <Kicker>Create your account</Kicker>
              <Display size={36} italic style={{ marginTop: 14 }}>Get your agent live.</Display>
              <Lede>Under five minutes. No credit card.</Lede>

              <form onSubmit={handleSubmit} style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Your details */}
                <div>
                  <Kicker color={T.mute} style={{ fontSize: 10, letterSpacing: "0.18em", display: "block", marginBottom: 14 }}>Your details</Kicker>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Field id="firstName" label="First name">
                      <Input id="firstName" type="text" required maxLength={100} value={form.firstName} onChange={set("firstName")} placeholder="Jane" />
                    </Field>
                    <Field id="lastName" label="Last name">
                      <Input id="lastName" type="text" required maxLength={100} value={form.lastName} onChange={set("lastName")} placeholder="Smith" />
                    </Field>
                  </div>
                </div>

                <Field id="email" label="Work email">
                  <Input id="email" type="email" autoComplete="email" required maxLength={255} value={form.email} onChange={set("email")} placeholder="jane@yourcompany.com" />
                </Field>

                <Field id="password" label="Password">
                  <Input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={form.password} onChange={set("password")} placeholder="Min. 8 characters" />
                  {strength && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        {[25, 50, 75, 100].map((p) => (
                          <div key={p} style={{ flex: 1, height: 3, borderRadius: 2, background: strength.pct >= p ? strength.color : T.paperEdge, transition: "background 200ms ease" }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: strength.color, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>{strength.text}</div>
                    </div>
                  )}
                </Field>

                <Field id="confirmPassword" label="Confirm password">
                  <Input id="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Re-enter your password" style={passwordsMismatch ? { borderColor: T.danger } : undefined} />
                  {passwordsMismatch && <div style={{ fontSize: 11, color: T.danger, marginTop: 6, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>Passwords don't match</div>}
                </Field>

                {/* Company info */}
                <div style={{ paddingTop: 12, borderTop: `1px solid ${T.paperEdge}`, marginTop: 8 }}>
                  <Kicker color={T.mute} style={{ fontSize: 10, letterSpacing: "0.18em", display: "block", margin: "14px 0" }}>Company info</Kicker>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Field id="companyName" label="Company" hint={companyError ? undefined : "Shown to customers in the chat widget."}>
                      <Input id="companyName" type="text" required maxLength={200} value={form.companyName} onChange={set("companyName")} placeholder="Acme Financial" style={companyError ? { borderColor: T.danger } : undefined} />
                      {companyError && <div style={{ fontSize: 12, color: T.danger, marginTop: 6 }}>{companyError}</div>}
                    </Field>
                    <Field id="vertical" label="Industry" hint="Tailors your agent's default tone.">
                      <Select id="vertical" required value={form.vertical} onChange={set("vertical")}>
                        <option value="" disabled>Select your industry…</option>
                        {INDUSTRIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </Select>
                    </Field>
                  </div>
                </div>

                {/* Consent */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16, borderTop: `1px solid ${T.paperEdge}` }}>
                  {[
                    { key: "tosAccepted", node: (
                      <>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: T.teal, borderBottom: `1px solid ${T.teal}40`, textDecoration: "none" }}>Shenmay AI Terms of Service</a> (opens in new tab).</>
                    )},
                    { key: "dataRightsConfirmed", node: <>I confirm that I have obtained the necessary rights and consents to upload my customers' personal data to Shenmay AI, and that my use complies with applicable privacy laws (GDPR, CCPA, etc.).</> },
                    { key: "newsletterOptIn",   node: <>I'd like to receive occasional product updates from Shenmay AI.</> },
                  ].map((c) => (
                    <label key={c.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>
                      <input type="checkbox" checked={form[c.key]} onChange={(e) => setForm(f => ({ ...f, [c.key]: e.target.checked }))} style={{ marginTop: 3, accentColor: T.teal }} />
                      <span>{c.node}</span>
                    </label>
                  ))}
                </div>

                {error && <Notice tone="danger">{error}</Notice>}

                <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
                  {loading ? "Creating your account…" : (<>Create account &nbsp;<ArrowRight size={16} /></>)}
                </Button>
              </form>

              <p style={{ textAlign: "center", fontSize: 14, color: T.mute, marginTop: 32 }}>
                Already have an account?&nbsp;{" "}
                <Link to="/login" style={{ color: T.teal, textDecoration: "none", fontWeight: 500, borderBottom: `1px solid ${T.teal}40` }}>
                  Sign in →
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </PageShell>
  );
};

export default ShenmaySignup;
