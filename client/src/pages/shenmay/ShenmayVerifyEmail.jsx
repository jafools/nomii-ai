import { useState, useEffect } from "react";
import { Link, useSearchParams, useParams, useNavigate } from "react-router-dom";
import { verifyEmail, resendVerification } from "@/lib/shenmayApi";
import shenmayLogo from "@/assets/shenmay-full-light.svg";
import { CheckCircle, XCircle, Loader2, Send } from "lucide-react";

const ShenmayVerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();

  // Support token from URL path (/nomii/verify/:token) or query string (?token=...)
  const token = params.token || searchParams.get("token");

  const [status, setStatus] = useState(token ? "loading" : "no-token");
  const [errorMsg, setErrorMsg] = useState("");

  // Resend state
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    verifyEmail(token)
      .then((data) => {
        if (cancelled) return;
        // Token is stored by verifyEmail — navigate immediately
        setStatus("success");
        setTimeout(() => navigate("/nomii/onboarding", { replace: true }), 1500);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(
          err?.message ||
          "This verification link has expired or is invalid. Please request a new one."
        );
      });

    return () => { cancelled = true; };
  }, [token, navigate]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try {
      await resendVerification(resendEmail.trim());
      setResent(true);
    } catch {
      /* silently handled */
    } finally {
      setResending(false);
    }
  };

  const inp =
    "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border border-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/25 focus:border-[#1E3A5F]";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] px-6">
      <div className="w-full max-w-md text-center space-y-6">
        <img src={shenmayLogo} alt="Shenmay AI" className="h-7 mx-auto mb-8" />

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 size={48} className="mx-auto animate-spin" style={{ color: "#1E3A5F" }} />
            <p className="text-gray-500 text-sm">Verifying your email…</p>
          </div>
        )}

        {status === "no-token" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "#FEF2F2" }}>
              <XCircle size={32} style={{ color: "#DC2626" }} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "#1E3A5F" }}>Invalid verification link</h1>
            <p className="text-gray-500 text-sm">
              This verification link has expired or is invalid. Please request a new one.
            </p>
            <Link to="/nomii/login" className="inline-block text-sm font-semibold hover:underline" style={{ color: "#C9A84C" }}>
              ← Back to login
            </Link>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "#F0FDF4" }}>
              <CheckCircle size={32} style={{ color: "#22C55E" }} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "#1E3A5F" }}>Email verified!</h1>
            <p className="text-gray-500 text-sm">Your account is ready. Let's set up your AI agent.</p>
            <p className="text-xs text-gray-400">Redirecting to onboarding…</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "#FEF2F2" }}>
              <XCircle size={32} style={{ color: "#DC2626" }} />
            </div>
            <div>
              <h1 className="text-xl font-bold mb-2" style={{ color: "#1E3A5F" }}>Verification failed</h1>
              <p className="text-gray-500 text-sm">{errorMsg}</p>
            </div>

            {resent ? (
              <div
                className="rounded-lg px-4 py-3 text-sm font-medium"
                style={{ background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}
              >
                ✓ A new verification link has been sent. Check your inbox.
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <p className="text-xs font-semibold text-gray-500 text-center">
                  Enter your email to receive a new link:
                </p>
                <input
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inp}
                  style={{ backgroundColor: "#ffffff", color: "#111827" }}
                />
                <button
                  type="submit"
                  disabled={resending}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7a 100%)" }}
                >
                  {resending ? "Sending…" : <><Send size={14} /> Send new link</>}
                </button>
              </form>
            )}

            <Link to="/nomii/login" className="inline-block text-sm font-semibold hover:underline" style={{ color: "#C9A84C" }}>
              ← Back to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShenmayVerifyEmail;
