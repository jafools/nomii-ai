import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login as apiLogin, setToken, isLoggedIn, resendVerification, forgotPassword } from "@/lib/nomiiApi";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";
import { ArrowRight, Brain, Shield, MessageSquare, Mail, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";

const PERKS = [
  { icon: MessageSquare, text: "Pick up every conversation exactly where it left off" },
  { icon: Brain, text: "AI agent that remembers every customer interaction" },
  { icon: Shield, text: "Human-in-the-loop oversight & escalation" },
];

// Dark-themed shared input styles
const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

const NomiiLogin = () => {
  const [view, setView] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotState, setForgotState] = useState("idle"); // idle | sending | sent
  const navigate = useNavigate();

  // If the user already has a valid token, skip the login page entirely
  useEffect(() => {
    if (isLoggedIn()) {
      navigate("/nomii/dashboard", { replace: true });
    }
  }, [navigate]);

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
      if (data.code === "email_unverified") {
        setUnverified(true);
        return;
      }
      setToken(data.token);
      // If onboarding isn't complete yet, send them there first
      const steps = data.tenant?.onboarding_steps;
      const onboardingDone = steps && typeof steps === "object" && Object.keys(steps).length > 0;
      navigate(onboardingDone ? "/nomii/dashboard" : "/nomii/onboarding", { replace: true });
    } catch (err) {
      if (err.code === "email_unverified") {
        setUnverified(true);
      } else {
        setError(err.message || "Login failed. Please try again.");
      }
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      await resendVerification(email.trim());
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    const trimmed = forgotEmail.trim();
    if (!trimmed) return;
    setForgotState("sending");
    try {
      await forgotPassword(trimmed);
    } catch {
      // Always show success to prevent email enumeration
    }
    setForgotState("sent");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-center items-center p-12 xl:p-16" style={{ background: "linear-gradient(160deg, #1E3A5F 0%, #15294a 50%, #0f1e38 100%)" }}>
        <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.08]" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)" }} />
        <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #5B9BD5, transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="relative z-10 max-w-sm space-y-10">
          <div>
            <a href="https://pontensolutions.com">
              <img src={nomiiLogo} alt="Nomii AI" className="h-8 brightness-0 invert mb-2" />
            </a>
            <p className="text-white/40 text-xs font-medium tracking-widest uppercase">by Pontén Solutions</p>
          </div>

          <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight">
            Welcome back to your{" "}
            <span style={{ color: "#C9A84C" }}>AI command center</span>
          </h2>

          <div className="space-y-5">
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
      </div>

      {/* Right — form (dark-themed to match dashboard) */}
      <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ background: "#0B1222" }}>
          {view === "forgot" ? (
            /* ---- Forgot Password Form ---- */
            <div className="w-full max-w-md">
              <div className="lg:hidden flex flex-col items-center mb-8">
                <a href="https://pontensolutions.com">
                  <img src={nomiiLogo} alt="Nomii AI" className="h-7 mb-3 brightness-0 invert" />
                </a>
              </div>

              <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Reset your password</h1>
              <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>Enter your email and we'll send you a reset link.</p>

              {forgotState === "sent" ? (
                <div className="space-y-6">
                  <div className="rounded-lg px-4 py-4 flex items-start gap-3" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)" }}>
                    <CheckCircle size={18} className="shrink-0 mt-0.5" style={{ color: "#4ADE80" }} />
                    <p className="text-sm leading-relaxed" style={{ color: "rgba(74,222,128,0.90)" }}>
                      If that email is registered, a password reset link has been sent. Check your inbox.
                    </p>
                  </div>
                  <button onClick={() => { setView("login"); setForgotState("idle"); setForgotEmail(""); }} className="flex items-center gap-2 text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.50)" }}>
                    <ArrowLeft size={15} /> Back to login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-5">
                  <div>
                    <label htmlFor="forgot-email" className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Email</label>
                    <input id="forgot-email" type="email" required maxLength={255} autoComplete="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="jane@yourcompany.com" className={inp} style={inpStyle} />
                  </div>
                  <button type="submit" disabled={forgotState === "sending"} className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-[#C9A84C]/20 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
                    {forgotState === "sending" ? "Sending…" : "Send Reset Link"}
                  </button>
                  <button type="button" onClick={() => { setView("login"); setForgotState("idle"); }} className="flex items-center gap-2 text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.50)" }}>
                    <ArrowLeft size={15} /> Back to login
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ---- Login Form ---- */
            <div className="w-full max-w-md">
              <div className="lg:hidden flex flex-col items-center mb-8">
                <a href="https://pontensolutions.com">
                  <img src={nomiiLogo} alt="Nomii AI" className="h-7 mb-3 brightness-0 invert" />
                </a>
              </div>

              <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Sign in to Nomii AI</h1>
              <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>Access your dashboard, conversations & analytics.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Email</label>
                  <input id="email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@yourcompany.com" className={inp} style={inpStyle} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-xs font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>Password</label>
                    <button type="button" onClick={() => setView("forgot")} className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: "#C9A84C" }}>Forgot password?</button>
                  </div>
                  <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className={inp} style={inpStyle} />
                </div>

                {unverified && (
                  <div className="rounded-lg px-4 py-3.5 space-y-3" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.20)" }}>
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: "#C9A84C" }} />
                      <p className="text-sm leading-relaxed" style={{ color: "rgba(201,168,76,0.90)" }}>
                        Your email address hasn't been verified yet. Please check your inbox for a verification link.
                      </p>
                    </div>
                    {resendState === "sent" ? (
                      <div className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)" }}>
                        <CheckCircle size={15} style={{ color: "#4ADE80" }} />
                        <span className="text-sm font-medium" style={{ color: "rgba(74,222,128,0.90)" }}>Verification email sent — please check your inbox.</span>
                      </div>
                    ) : (
                      <button type="button" onClick={handleResend} disabled={resendState === "sending"} className="flex items-center gap-2 text-sm font-semibold transition-colors disabled:opacity-50" style={{ color: "#C9A84C" }}>
                        <Mail size={15} />
                        {resendState === "sending" ? "Sending…" : resendState === "error" ? "Couldn't send the email. Please try again." : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}

                {error && !unverified && (
                  <div data-testid="login-error" className="rounded-lg px-4 py-3 text-sm font-medium" style={{ background: "rgba(239,68,68,0.12)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)" }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-[#C9A84C]/20 flex items-center justify-center gap-2 group" style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
                  {loading ? "Signing in…" : (
                    <>
                      Sign in to dashboard
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-sm mt-8" style={{ color: "rgba(255,255,255,0.35)" }}>
                Don't have an account?{" "}
                <Link to="/nomii/signup" className="font-semibold hover:opacity-80 transition-opacity" style={{ color: "#C9A84C" }}>
                  Get started →
                </Link>
              </p>
            </div>
          )}
      </div>
    </div>
  );
};

export default NomiiLogin;
