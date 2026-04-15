import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeSetup, setToken } from "@/lib/nomiiApi";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";
import { Building2, User, Key, Eye, EyeOff, ArrowRight, CheckCircle, ExternalLink, Loader2 } from "lucide-react";

const STEPS = [
  { id: 1, label: "Your company",   icon: Building2 },
  { id: 2, label: "Admin account",  icon: User },
  { id: 3, label: "Connect AI",     icon: Key },
];

const inp      = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };
const labelCls = "block text-xs font-semibold mb-1.5 tracking-wide uppercase";
const labelStyle = { color: "rgba(255,255,255,0.45)" };

const NomiiSetup = () => {
  const navigate = useNavigate();
  const [step, setStep]               = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [apiKey, setApiKey]           = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [showApiKey, setShowApiKey]           = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const next = () => {
    setError("");
    if (step === 1) {
      if (!companyName.trim()) { setError("Please enter your company name."); return; }
    }
    if (step === 2) {
      if (!email.trim())    { setError("Please enter your email address."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Please enter a valid email address."); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!apiKey.trim().startsWith("sk-ant-")) {
      setError("Please enter a valid Anthropic API key. It starts with sk-ant-");
      return;
    }
    setLoading(true);
    try {
      const data = await completeSetup({
        companyName: companyName.trim(),
        email:       email.trim(),
        password,
        anthropicApiKey: apiKey.trim(),
      });
      setToken(data.token);
      // Self-hosted first-run: land on widget-install step of onboarding
      // (products/customers/api_key/tools are pre-marked complete server-side,
      // so /nomii/onboarding resumes at install_widget — fixes SH-1/SH-2).
      navigate("/nomii/onboarding", { replace: true });
    } catch (err) {
      setError(err.message || "Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left branding panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-center items-center p-12 xl:p-16"
        style={{ background: "linear-gradient(160deg, #1E3A5F 0%, #15294a 50%, #0f1e38 100%)" }}
      >
        <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)" }} />
        <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #5B9BD5, transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="relative z-10 max-w-sm space-y-10">
          <div>
            <img src={nomiiLogo} alt="Nomii AI" className="h-8 brightness-0 invert mb-2" />
            <p className="text-white/40 text-xs font-medium tracking-widest uppercase">Self-Hosted Setup</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight">
              Welcome to your{" "}
              <span style={{ color: "#C9A84C" }}>AI workspace</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed">
              You're just a few steps away from having Nomii AI running on your own server. This wizard sets everything up — it only takes a minute.
            </p>
          </div>

          {/* Step indicators */}
          <div className="space-y-4">
            {STEPS.map(s => {
              const done    = step > s.id;
              const current = step === s.id;
              return (
                <div key={s.id} className="flex items-center gap-4">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                    style={{
                      background: done ? "#C9A84C" : current ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)",
                      border: done ? "none" : current ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    {done
                      ? <CheckCircle size={16} style={{ color: "#0f1e38" }} />
                      : <s.icon size={15} style={{ color: current ? "#C9A84C" : "rgba(255,255,255,0.30)" }} />
                    }
                  </div>
                  <span
                    className="text-sm font-medium transition-colors duration-300"
                    style={{ color: done ? "rgba(255,255,255,0.80)" : current ? "#C9A84C" : "rgba(255,255,255,0.30)" }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ background: "#0B1222" }}>
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img src={nomiiLogo} alt="Nomii AI" className="h-7 mb-1 brightness-0 invert" />
            <p className="text-white/30 text-xs tracking-widest uppercase">Self-Hosted Setup</p>
          </div>

          {/* Mobile step dots */}
          <div className="lg:hidden flex justify-center gap-2 mb-8">
            {STEPS.map(s => (
              <div
                key={s.id}
                className="transition-all duration-300 rounded-full"
                style={{
                  width: step === s.id ? 20 : 8,
                  height: 8,
                  background: step > s.id ? "#C9A84C" : step === s.id ? "#C9A84C" : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>

          {/* ── Step 1: Company name ─────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#C9A84C" }}>Step 1 of 3</p>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>What's your company called?</h1>
              <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>This will be the name of your Nomii AI workspace.</p>

              <form onSubmit={(e) => { e.preventDefault(); next(); }} className="space-y-5">
                <div>
                  <label className={labelCls} style={labelStyle}>Company name</label>
                  <input
                    className={inp}
                    style={inpStyle}
                    type="text"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.10)", color: "rgba(252,165,165,0.90)", border: "1px solid rgba(239,68,68,0.20)" }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #b8943d)", color: "#0B1222" }}
                >
                  Continue <ArrowRight size={16} />
                </button>
              </form>
            </div>
          )}

          {/* ── Step 2: Admin account ─────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#C9A84C" }}>Step 2 of 3</p>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Create your admin account</h1>
              <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>You'll use these credentials to log in to your Nomii dashboard.</p>

              <form onSubmit={(e) => { e.preventDefault(); next(); }} className="space-y-5">
                <div>
                  <label className={labelCls} style={labelStyle}>Email address</label>
                  <input
                    className={inp}
                    style={inpStyle}
                    type="email"
                    placeholder="you@yourcompany.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className={labelCls} style={labelStyle}>Password</label>
                  <div className="relative">
                    <input
                      className={inp}
                      style={{ ...inpStyle, paddingRight: "2.75rem" }}
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className={labelCls} style={labelStyle}>Confirm password</label>
                  <div className="relative">
                    <input
                      className={inp}
                      style={{ ...inpStyle, paddingRight: "2.75rem" }}
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.10)", color: "rgba(252,165,165,0.90)", border: "1px solid rgba(239,68,68,0.20)" }}>
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setError(""); setStep(1); }}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-70"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.60)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-2 flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #C9A84C, #b8943d)", color: "#0B1222" }}
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Step 3: Anthropic API key ─────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#C9A84C" }}>Step 3 of 3</p>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Connect your AI</h1>
              <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.40)" }}>
                Nomii AI uses Claude by Anthropic. Paste your API key below — it's encrypted and stored securely on your server.
              </p>

              {/* Get a key link */}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-semibold mb-6 w-fit transition-opacity hover:opacity-70"
                style={{ color: "#C9A84C" }}
              >
                <ExternalLink size={13} />
                Get an API key at console.anthropic.com
              </a>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className={labelCls} style={labelStyle}>Anthropic API key</label>
                  <div className="relative">
                    <input
                      className={inp}
                      style={{ ...inpStyle, paddingRight: "2.75rem", fontFamily: showApiKey ? "inherit" : "monospace", letterSpacing: showApiKey ? "normal" : "0.05em" }}
                      type={showApiKey ? "text" : "password"}
                      placeholder="sk-ant-..."
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    Your key never leaves your server. It is encrypted with AES-256.
                  </p>
                </div>

                {error && (
                  <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.10)", color: "rgba(252,165,165,0.90)", border: "1px solid rgba(239,68,68,0.20)" }}>
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setError(""); setStep(2); }}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-70 disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.60)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-90 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #C9A84C, #b8943d)", color: "#0B1222" }}
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Setting up…</> : <>Finish setup <ArrowRight size={16} /></>}
                  </button>
                </div>
              </form>

              {/* Trial note */}
              <p className="text-xs mt-6 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
                Starting on the free trial — 20 messages/mo, 1 customer.{" "}
                <a href="https://pontensolutions.com/nomii/license" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70" style={{ color: "rgba(201,168,76,0.60)" }}>
                  Upgrade anytime
                </a>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default NomiiSetup;
