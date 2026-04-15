import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "@/lib/nomiiApi";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";
import { ArrowRight, CheckCircle, AlertTriangle, ArrowLeft, Lock } from "lucide-react";

const NomiiResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const valid = password.length >= 8 && password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!token) { setError("Missing reset token. Please use the link from your email."); return; }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
  const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-center items-center p-12 xl:p-16" style={{ background: "linear-gradient(160deg, #1E3A5F 0%, #15294a 50%, #0f1e38 100%)" }}>
        <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.08]" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)" }} />
        <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.06]" style={{ background: "radial-gradient(circle, #5B9BD5, transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="relative z-10 max-w-sm space-y-10">
          <div>
            <img src={nomiiLogo} alt="Nomii AI" className="h-8 brightness-0 invert mb-2" />
            <p className="text-white/40 text-xs font-medium tracking-widest uppercase">by Pontén Solutions</p>
          </div>

          <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight">
            Set a new{" "}
            <span style={{ color: "#C9A84C" }}>password</span>
          </h2>

          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(201,168,76,0.12)" }}>
              <Lock size={20} style={{ color: "#C9A84C" }} />
            </div>
            <p className="text-white/70 text-sm leading-relaxed">Choose a strong password to keep your account secure.</p>
          </div>
        </div>
      </div>

      {/* Right — form (dark-themed) */}
      <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ background: "#0B1222" }}>
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img src={nomiiLogo} alt="Nomii AI" className="h-7 mb-3 brightness-0 invert" />
          </div>

          {success ? (
            <div className="space-y-6">
              <div className="rounded-lg px-4 py-4 flex items-start gap-3" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <CheckCircle size={18} className="shrink-0 mt-0.5" style={{ color: "#4ADE80" }} />
                <p className="text-sm leading-relaxed" style={{ color: "rgba(74,222,128,0.90)" }}>
                  Your password has been reset! You can now sign in with your new password.
                </p>
              </div>
              <Link
                to="/nomii/login"
                className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
              >
                Go to Login <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Reset your password</h1>
              <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>Enter your new password below.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="new-password" className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>New Password</label>
                  <input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inp} style={inpStyle} />
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs mt-1" style={{ color: "#F87171" }}>Must be at least 8 characters</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Confirm Password</label>
                  <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" className={inp} style={inpStyle} />
                  {confirm.length > 0 && password !== confirm && (
                    <p className="text-xs mt-1" style={{ color: "#F87171" }}>Passwords do not match</p>
                  )}
                </div>

                {error && (
                  <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ background: "rgba(239,68,68,0.12)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <p>{error}</p>
                        {error.toLowerCase().includes("expired") || error.toLowerCase().includes("invalid") ? (
                          <Link to="/nomii/login" className="inline-flex items-center gap-1 mt-2 text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.60)" }}>
                            Request a new link →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                <button type="submit" disabled={loading || !valid} className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-[#C9A84C]/20 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
                  {loading ? "Resetting…" : "Reset Password"}
                </button>
              </form>

              <p className="text-center text-sm mt-8">
                <Link to="/nomii/login" className="flex items-center justify-center gap-1.5 font-semibold hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.45)" }}>
                  <ArrowLeft size={15} /> Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NomiiResetPassword;
