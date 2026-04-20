import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as apiRegister, setToken, resendVerification } from "@/lib/nomiiApi";
import { DEPLOYMENT_MODES } from "@/lib/constants";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";
import { Check, ArrowRight, Brain, Shield, Sparkles, Mail, ArrowLeft } from "lucide-react";

const INDUSTRIES = [
  { value: "financial", label: "Financial" },
  { value: "retirement", label: "Retirement" },
  { value: "ministry", label: "Ministry" },
  { value: "healthcare", label: "Healthcare" },
  { value: "insurance", label: "Insurance" },
  { value: "education", label: "Education" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "other", label: "Other" },
];

const getStrength = (pw) => {
  if (pw.length < 8) return { text: "Min. 8 characters", color: "#F87171", pct: 15 };
  let s = 0;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (s <= 1) return { text: "Weak — try adding symbols", color: "#FBBF24", pct: 40 };
  if (s <= 2) return { text: "Getting stronger", color: "#C9A84C", pct: 70 };
  return { text: "Strong password", color: "#4ADE80", pct: 100 };
};

const PERKS = [
  { icon: Brain, text: "AI agent that remembers every customer interaction" },
  { icon: Sparkles, text: "Adapts tone and personality per customer" },
  { icon: Shield, text: "Human-in-the-loop oversight & escalation" },
];

// Dark-themed shared input styles
const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

const BrandingPanel = () => (
  <div className="hidden lg:flex lg:w-[42%] relative overflow-hidden flex-col justify-between p-12 xl:p-16" style={{ background: "linear-gradient(160deg, #1E3A5F 0%, #15294a 50%, #0f1e38 100%)" }}>
    <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.08]" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)" }} />
    <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #5B9BD5, transparent 70%)" }} />
    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

    <div className="relative z-10">
      <a href="https://pontensolutions.com" className="inline-block hover:opacity-80 transition-opacity" title="Back to Pontén Solutions">
        <img src={nomiiLogo} alt="Nomii AI" className="h-8 brightness-0 invert mb-2" />
        <p className="text-white/40 text-xs font-medium tracking-widest uppercase">by Pontén Solutions</p>
      </a>
    </div>

    <div className="relative z-10 space-y-8">
      <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight">
        Deploy an AI agent that actually{" "}
        <span style={{ color: "#C9A84C" }}>knows</span> your customers
      </h2>
      <div className="space-y-6">
        {PERKS.map((p) => (
          <div key={p.text} className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(201,168,76,0.12)" }}>
              <p.icon size={20} style={{ color: "#C9A84C" }} />
            </div>
            <p className="text-white/70 text-sm leading-relaxed">{p.text}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="relative z-10 flex items-center gap-3">
      <div className="flex -space-x-1.5">
        {["#3B82F6", "#22C55E", "#C9A84C"].map((c) => (
          <div key={c} className="w-7 h-7 rounded-full border-2 border-[#1E3A5F] flex items-center justify-center" style={{ background: c }}>
            <Check size={11} className="text-white" />
          </div>
        ))}
      </div>
      <p className="text-white/40 text-xs">Trusted by teams in finance, healthcare & education</p>
    </div>
  </div>
);

const CheckEmailState = ({ email }) => {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch {}
    finally { setResending(false); }
  };

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center" style={{ background: "rgba(201,168,76,0.12)" }}>
        <Mail size={36} style={{ color: "#C9A84C" }} />
      </div>
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "rgba(255,255,255,0.90)" }}>Check your email</h1>
        <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
          We've sent a verification link to <strong style={{ color: "rgba(255,255,255,0.70)" }}>{email}</strong>. Click the link in the email to activate your account.
        </p>
      </div>
      <div className="space-y-3">
        <button
          onClick={handleResend}
          disabled={resending || resent}
          className="text-sm font-semibold hover:opacity-70 transition-opacity disabled:opacity-50"
          style={{ color: "#C9A84C" }}
        >
          {resent ? "✓ Sent!" : resending ? "Sending…" : "Resend verification email"}
        </button>
        <div>
          <Link to="/nomii/login" className="inline-flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.40)" }}>
            <ArrowLeft size={14} /> Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

const NomiiSignup = () => {
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

  // Self-hosted installs are single-tenant and registration is disabled server-side.
  // Redirect to the login page so operators don't fill out a form that will 403.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.deployment === DEPLOYMENT_MODES.SELFHOSTED) navigate("/nomii/login", { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === "companyName") setCompanyError("");
    if (k === "confirmPassword" && !confirmTouched) setConfirmTouched(true);
  };
  const strength = getStrength(form.password);
  const passwordTooShort = form.password.length > 0 && form.password.length < 8;
  const passwordsMismatch = confirmTouched && form.confirmPassword.length > 0 && form.password !== form.confirmPassword;
  const canSubmit = !loading && form.password.length >= 8 && form.confirmPassword.length > 0 && form.password === form.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setCompanyError("");
    const t = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), password: form.password, companyName: form.companyName.trim(), vertical: form.vertical };
    if (!t.firstName || !t.lastName || !t.email || !t.password || !t.companyName || !t.vertical) { setError("Please fill in all fields."); return; }
    if (t.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!form.tosAccepted || !form.dataRightsConfirmed) { setError("Please accept the terms and confirm your data rights before continuing."); return; }
    setLoading(true);
    try {
      const data = await apiRegister(t.email, t.password, t.firstName, t.lastName, t.companyName, t.vertical, true, form.newsletterOptIn);
      if (data.pending_verification) {
        setPendingEmail(data.email || t.email);
      } else if (data.token) {
        setToken(data.token);
        navigate("/nomii/onboarding");
      }
    } catch (err) {
      const msg = err.message || "Registration failed.";
      if (msg.toLowerCase().includes("company") && msg.toLowerCase().includes("taken") || err.code === "company_name_taken") {
        setCompanyError("This company name is already registered. Please use a different name.");
      } else {
        setError(msg);
      }
    }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      <BrandingPanel />

      {/* Right — form (dark-themed) */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto" style={{ background: "#0B1222" }}>
        <div className="w-full max-w-lg">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <img src={nomiiLogo} alt="Nomii AI" className="h-7 mb-3 brightness-0 invert" />
          </div>

          {pendingEmail ? (
            <CheckEmailState email={pendingEmail} />
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Create your account</h1>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>Get your AI agent live in under 5 minutes — no credit card needed.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left column */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.25)" }}>Your details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="firstName" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>First name</label>
                        <input id="firstName" type="text" required maxLength={100} value={form.firstName} onChange={set("firstName")} placeholder="Jane" className={inp} style={inpStyle} />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>Last name</label>
                        <input id="lastName" type="text" required maxLength={100} value={form.lastName} onChange={set("lastName")} placeholder="Smith" className={inp} style={inpStyle} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>Work email</label>
                      <input id="email" type="email" autoComplete="email" required maxLength={255} value={form.email} onChange={set("email")} placeholder="jane@yourcompany.com" className={inp} style={inpStyle} />
                    </div>
                    <div>
                      <label htmlFor="password" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>Password</label>
                      <input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={form.password} onChange={set("password")} placeholder="Min. 8 characters" className={inp} style={inpStyle} />
                      {form.password.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          <div className="flex gap-1">
                            {[25, 50, 75, 100].map((t) => (
                              <div key={t} className="h-1 flex-1 rounded-full transition-all duration-300" style={{ backgroundColor: strength.pct >= t ? strength.color : "rgba(255,255,255,0.10)" }} />
                            ))}
                          </div>
                          <p className="text-[11px] font-medium" style={{ color: strength.color }}>{strength.text}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>Confirm password</label>
                      <input
                        id="confirmPassword" type="password" autoComplete="new-password" required
                        maxLength={128} value={form.confirmPassword} onChange={set("confirmPassword")}
                        placeholder="Re-enter your password"
                        className={inp + (passwordsMismatch ? " border-red-500/50 focus:ring-red-500/20 focus:border-red-500/50" : "")}
                        style={inpStyle}
                      />
                      {passwordsMismatch && (
                        <p className="text-[11px] mt-1 font-medium" style={{ color: "#F87171" }}>Passwords don't match</p>
                      )}
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.25)" }}>Company info</p>
                    <div>
                      <label htmlFor="companyName" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>Company name</label>
                      <input
                        id="companyName" type="text" required maxLength={200}
                        value={form.companyName} onChange={set("companyName")}
                        placeholder="Acme Financial"
                        className={inp + (companyError ? " border-red-500/50 focus:ring-red-500/20 focus:border-red-500/50" : "")}
                        style={inpStyle}
                      />
                      {companyError ? (
                        <p className="text-[11px] mt-1 font-medium" style={{ color: "#F87171" }}>{companyError}</p>
                      ) : (
                        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>Shown to customers in the chat widget.</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="vertical" className="block text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>Industry</label>
                      <select id="vertical" required value={form.vertical} onChange={set("vertical")} className={inp + " cursor-pointer"} style={inpStyle}>
                        <option value="" disabled style={{ background: "#0F1A2E" }}>Select your industry…</option>
                        {INDUSTRIES.map((v) => <option key={v.value} value={v.value} style={{ background: "#0F1A2E" }}>{v.label}</option>)}
                      </select>
                      <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>Tailors your agent's default tone.</p>
                    </div>
                  </div>
                </div>

                {/* Consent checkboxes */}
                <div className="space-y-2.5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={form.tosAccepted} onChange={(e) => setForm(f => ({ ...f, tosAccepted: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded cursor-pointer accent-[#C9A84C]" style={{ borderColor: "rgba(255,255,255,0.20)" }} />
                    <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                      I agree to the{" "}
                      <a href="/nomii/terms" target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:opacity-80 transition-opacity" style={{ color: "#C9A84C" }}>Nomii AI Terms of Service</a>{" "}
                      (opens in new tab).
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={form.dataRightsConfirmed} onChange={(e) => setForm(f => ({ ...f, dataRightsConfirmed: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded cursor-pointer accent-[#C9A84C]" style={{ borderColor: "rgba(255,255,255,0.20)" }} />
                    <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                      I confirm that I have obtained the necessary rights and consents to upload my customers' personal data to Nomii AI, and that my use complies with applicable privacy laws (GDPR, CCPA, etc.).
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={form.newsletterOptIn} onChange={(e) => setForm(f => ({ ...f, newsletterOptIn: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded cursor-pointer accent-[#C9A84C]" style={{ borderColor: "rgba(255,255,255,0.20)" }} />
                    <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.50)" }}>
                      I'd like to receive product updates and occasional tips from Nomii AI.
                    </span>
                  </label>
                </div>

                {error && (
                  <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ background: "rgba(239,68,68,0.12)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)" }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-[#C9A84C]/20 flex items-center justify-center gap-2 group"
                  style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
                >
                  {loading ? "Creating your account…" : (
                    <>
                      Create account & set up agent
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-sm mt-6" style={{ color: "rgba(255,255,255,0.35)" }}>
                Already have an account?{" "}
                <Link to="/nomii/login" className="font-semibold hover:opacity-80 transition-opacity" style={{ color: "#C9A84C" }}>
                  Sign in →
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NomiiSignup;
