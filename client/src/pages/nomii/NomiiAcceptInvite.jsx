import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { getInviteInfo, acceptInvite, setToken } from "@/lib/nomiiApi";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";
import { Eye, EyeOff, CheckCircle, AlertTriangle } from "lucide-react";

const NomiiAcceptInvite = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [inviteInfo, setInviteInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (!token) {
      setInfoError("No invite token found. Please use the link from your invitation email.");
      setLoadingInfo(false);
      return;
    }
    getInviteInfo(token)
      .then((data) => {
        if (data.error) {
          setInfoError(data.error);
        } else {
          setInviteInfo(data);
          setFirstName(data.first_name || "");
          setLastName(data.last_name || "");
        }
      })
      .catch(() => setInfoError("Failed to load invite. Please try again."))
      .finally(() => setLoadingInfo(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const data = await acceptInvite(token, password, firstName, lastName);
    setSubmitting(false);
    if (data.error) {
      setSubmitError(data.error);
      return;
    }
    if (data.token) {
      setToken(data.token);
      navigate("/nomii/dashboard", { replace: true });
    }
  };

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    outline: "none",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "linear-gradient(180deg, #0F1A2E 0%, #0B1222 100%)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={nomiiLogo} alt="Nomii AI" className="h-6 brightness-0 invert opacity-80" />
        </div>

        <div className="rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {loadingInfo ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#C9A84C" }} />
              <p className="text-sm text-white/30">Loading invitation…</p>
            </div>
          ) : infoError ? (
            <div className="flex flex-col items-center py-8 gap-4 text-center">
              <AlertTriangle size={28} style={{ color: "#F87171" }} />
              <p className="text-sm text-white/50">{infoError}</p>
              <Link to="/nomii/login" className="text-sm underline" style={{ color: "#C9A84C" }}>
                Go to login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-[13px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#C9A84C" }}>
                  You're invited
                </p>
                <h1 className="text-xl font-bold text-white/90">Join {inviteInfo?.company_name}</h1>
                <p className="text-sm text-white/35 mt-1">
                  Set up your account for <span className="text-white/55">{inviteInfo?.email}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/30 mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/30 mb-1.5">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-white/30 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Choose a password (min. 8 characters)"
                      className="w-full px-3 py-2.5 rounded-xl text-sm pr-10"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "rgba(255,255,255,0.25)" }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-white/30 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={inputStyle}
                  />
                </div>

                {submitError && (
                  <p className="text-sm" style={{ color: "#F87171" }}>{submitError}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
                >
                  {submitting ? "Setting up your account…" : "Accept Invitation & Sign In"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.2)" }}>
          Already have an account?{" "}
          <Link to="/nomii/login" style={{ color: "#C9A84C" }} className="hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default NomiiAcceptInvite;
