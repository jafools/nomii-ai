import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login as apiLogin, setToken, isLoggedIn, resendVerification, forgotPassword } from "@/lib/shenmayApi";
import { DEPLOYMENT_MODES } from "@/lib/constants";
import { ArrowRight, Mail, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import ShenmaySeal from "@/components/shenmay/ShenmaySeal";

// ── Direction B palette (matches pontensolutions.com/products/nomii-ai) ──
const INK = "#1A1D1A";
const INK_SOFT = "#3A3D39";
const PAPER = "#F5F1E8";
const PAPER_DEEP = "#EDE7D7";
const PAPER_EDGE = "#D8D0BD";
const MUTE = "#6B6B64";
const TEAL = "#0F5F5C";
const TEAL_DARK = "#083A38";
const DANGER = "#7A1F1A";

const MONO = "ui-monospace, Menlo, monospace";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const Input = ({ id, label, right, ...rest }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1.5">
      <label htmlFor={id} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>
        {label}
      </label>
      {right}
    </div>
    <input
      id={id}
      {...rest}
      style={{
        width: "100%",
        padding: "12px 14px",
        fontFamily: SANS,
        fontSize: 15,
        letterSpacing: "-0.01em",
        color: INK,
        background: "#FFFFFF",
        border: `1px solid ${PAPER_EDGE}`,
        borderRadius: 6,
        outline: "none",
        transition: "border-color 180ms ease, box-shadow 180ms ease",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = INK;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${TEAL}1F`;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = PAPER_EDGE;
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  </div>
);

const PrimaryButton = ({ children, ...rest }) => (
  <button
    {...rest}
    style={{
      width: "100%",
      padding: "14px 18px",
      background: INK,
      color: PAPER,
      fontFamily: SANS,
      fontWeight: 500,
      fontSize: 14,
      letterSpacing: "0.02em",
      border: "none",
      borderRadius: 6,
      cursor: rest.disabled ? "not-allowed" : "pointer",
      opacity: rest.disabled ? 0.55 : 1,
      transition: "background 180ms ease, transform 120ms ease",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    }}
    onMouseEnter={(e) => { if (!rest.disabled) e.currentTarget.style.background = TEAL_DARK; }}
    onMouseLeave={(e) => { if (!rest.disabled) e.currentTarget.style.background = INK; }}
  >
    {children}
  </button>
);

const ShenmayLogin = () => {
  const [view, setView] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotState, setForgotState] = useState("idle"); // idle | sending | sent
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const navigate = useNavigate();

  // If the user already has a valid token, skip the login page entirely
  useEffect(() => {
    if (isLoggedIn()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  // Detect self-hosted mode — hides sign-up link (registration is disabled on self-hosted)
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { if (d.deployment === DEPLOYMENT_MODES.SELFHOSTED) setIsSelfHosted(true); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setUnverified(false);
    setResendState("idle");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const data = await apiLogin(trimmedEmail, password);
      if (data.code === "email_unverified") { setUnverified(true); return; }
      setToken(data.token);
      const steps = data.tenant?.onboarding_steps;
      const onboardingDone = steps?.install_widget === true || steps?.widget === true;
      navigate(onboardingDone ? "/dashboard" : "/onboarding", { replace: true });
    } catch (err) {
      if (err.code === "email_unverified") setUnverified(true);
      else setError(err.message || "Login failed. Please try again.");
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResendState("sending");
    try { await resendVerification(email.trim()); setResendState("sent"); }
    catch { setResendState("error"); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    const trimmed = forgotEmail.trim();
    if (!trimmed) return;
    setForgotState("sending");
    try { await forgotPassword(trimmed); } catch { /* always show success to prevent enumeration */ }
    setForgotState("sent");
  };

  return (
    <div className="shenmay-scope" style={{ minHeight: "100vh", background: PAPER, color: INK, fontFamily: SANS, display: "flex" }}>
      {/* ── LEFT · editorial panel ──────────────────────────── */}
      <aside
        style={{
          display: "none",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "45%",
          background: PAPER_DEEP,
          borderRight: `1px solid ${PAPER_EDGE}`,
          padding: "56px 64px",
          position: "relative",
          overflow: "hidden",
        }}
        className="shenmay-login-aside"
      >
        {/* top: wordmark + back-to-corp */}
        <div>
          <a href="https://pontensolutions.com" style={{ display: "inline-flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <ShenmayWordmark size={28} ink={INK} teal={TEAL} mute={MUTE} />
          </a>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: MUTE, marginTop: 10 }}>
            by Pontén Solutions
          </div>
        </div>

        {/* middle: editorial pull quote */}
        <div style={{ maxWidth: 460 }}>
          <div className="shenmay-kicker" style={{ marginBottom: 20 }}>Figure 01 · What you sign in to</div>
          <p className="shenmay-display" style={{ fontSize: 44, fontStyle: "italic", lineHeight: 1.08, margin: 0 }}>
            An agent that remembers.
          </p>
          <p style={{ fontFamily: SANS, fontWeight: 500, fontStyle: "normal", fontSize: 44, letterSpacing: "-0.045em", color: INK, lineHeight: 1.08, margin: 0 }}>
            One customer at a time.
          </p>
          <div style={{ marginTop: 28, fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTE }}>
            /ʃɛn.meɪ/ &nbsp;·&nbsp; Känn mig &nbsp;·&nbsp; Know me
          </div>
        </div>

        {/* bottom: rhythm strip (tiny editorial footer nod) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, borderTop: `1px solid ${PAPER_EDGE}`, paddingTop: 20 }}>
          {[
            { k: "Soul", v: "Personality + policy" },
            { k: "Memory", v: "Every interaction kept" },
            { k: "Control", v: "Human-in-the-loop" },
          ].map((o) => (
            <div key={o.k}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>{o.k}</div>
              <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 4, letterSpacing: "-0.005em" }}>{o.v}</div>
            </div>
          ))}
        </div>

        {/* editorial seal, decorative */}
        <div style={{ position: "absolute", top: 40, right: 40, opacity: 0.9 }}>
          <ShenmaySeal size={96} ink={INK} paper={PAPER_DEEP} teal={TEAL} />
        </div>
      </aside>

      {/* responsive reveal of the aside at ≥lg */}
      <style>{`
        @media (min-width: 1024px) {
          .shenmay-login-aside { display: flex !important; }
        }
      `}</style>

      {/* ── RIGHT · form ──────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* mobile wordmark */}
          <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }} className="shenmay-login-mobile-mark">
            <ShenmayWordmark size={28} ink={INK} teal={TEAL} mute={MUTE} />
          </div>
          <style>{`
            @media (min-width: 1024px) {
              .shenmay-login-mobile-mark { display: none !important; }
            }
          `}</style>

          {view === "forgot" ? (
            /* ─── Forgot password ─── */
            <>
              <div className="shenmay-kicker" style={{ marginBottom: 14 }}>Reset access</div>
              <h1 style={{ fontFamily: SANS, fontWeight: 300, fontStyle: "italic", fontSize: 36, letterSpacing: "-0.04em", color: INK, lineHeight: 1.05, margin: 0 }}>
                Forgot your password.
              </h1>
              <p style={{ fontSize: 15, color: MUTE, marginTop: 12, lineHeight: 1.5 }}>
                Enter the email on your account and we'll send you a reset link.
              </p>

              {forgotState === "sent" ? (
                <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ padding: "14px 16px", background: "#F1EEDF", border: `1px solid ${PAPER_EDGE}`, borderRadius: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <CheckCircle size={18} color={TEAL} style={{ marginTop: 1, flexShrink: 0 }} />
                    <p style={{ margin: 0, fontSize: 14, color: INK_SOFT, lineHeight: 1.5 }}>
                      If that email is registered, a reset link is on its way. Check your inbox.
                    </p>
                  </div>
                  <button
                    onClick={() => { setView("login"); setForgotState("idle"); setForgotEmail(""); }}
                    style={{ background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 6, color: INK, fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: "-0.005em" }}
                  >
                    <ArrowLeft size={14} /> Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 20 }}>
                  <Input id="forgot-email" label="Email" type="email" required maxLength={255} autoComplete="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@company.com" />
                  <PrimaryButton type="submit" disabled={forgotState === "sending"}>
                    {forgotState === "sending" ? "Sending…" : (<>Send reset link <ArrowRight size={15} /></>)}
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => { setView("login"); setForgotState("idle"); }}
                    style={{ background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 6, color: MUTE, fontSize: 13, fontWeight: 500, cursor: "pointer", alignSelf: "flex-start", letterSpacing: "-0.005em" }}
                  >
                    <ArrowLeft size={14} /> Back to sign in
                  </button>
                </form>
              )}
            </>
          ) : (
            /* ─── Sign in ─── */
            <>
              <div className="shenmay-kicker" style={{ marginBottom: 14 }}>Sign in</div>
              <h1 style={{ fontFamily: SANS, fontWeight: 300, fontStyle: "italic", fontSize: 36, letterSpacing: "-0.04em", color: INK, lineHeight: 1.05, margin: 0 }}>
                Welcome back.
              </h1>
              <p style={{ fontSize: 15, color: MUTE, marginTop: 12, lineHeight: 1.5 }}>
                Your conversations, customers, and agents — picked up where you left them.
              </p>

              <form onSubmit={handleSubmit} style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 20 }}>
                <Input id="email" label="Email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />

                <Input
                  id="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••••••"
                  right={
                    <button type="button" onClick={() => setView("forgot")} style={{ background: "none", border: "none", padding: 0, fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, cursor: "pointer" }}>
                      Forgot?
                    </button>
                  }
                />

                {unverified && (
                  <div style={{ padding: "14px 16px", background: "#F1EEDF", border: `1px solid ${PAPER_EDGE}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <AlertTriangle size={16} color={TEAL_DARK} style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: 13, color: INK_SOFT, lineHeight: 1.5 }}>
                        Your email hasn't been verified yet. Check your inbox for the verification link.
                      </p>
                    </div>
                    {resendState === "sent" ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: TEAL_DARK, fontSize: 13, fontWeight: 500 }}>
                        <CheckCircle size={14} /> Verification email sent — check your inbox.
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendState === "sending"}
                        style={{ background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 8, color: TEAL, fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                      >
                        <Mail size={14} />
                        {resendState === "sending" ? "Sending…" : resendState === "error" ? "Couldn't send — try again" : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}

                {error && !unverified && (
                  <div data-testid="login-error" style={{ padding: "12px 14px", background: "#F3E8E4", border: `1px solid ${DANGER}40`, borderRadius: 8, color: DANGER, fontSize: 13, lineHeight: 1.5 }}>
                    {error}
                  </div>
                )}

                <PrimaryButton type="submit" disabled={loading}>
                  {loading ? "Signing in…" : (<>Sign in <ArrowRight size={15} /></>)}
                </PrimaryButton>
              </form>

              {!isSelfHosted && (
                <p style={{ marginTop: 32, fontSize: 14, color: MUTE, textAlign: "center" }}>
                  New to Shenmay?&nbsp;{" "}
                  <Link to="/signup" style={{ color: TEAL, textDecoration: "none", fontWeight: 500, borderBottom: `1px solid ${TEAL}40` }}>
                    Create an account →
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ShenmayLogin;
