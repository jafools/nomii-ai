import { useState, useEffect } from "react";
import { Link, useSearchParams, useParams, useNavigate } from "react-router-dom";
import { verifyEmail, resendVerification } from "@/lib/shenmayApi";
import { CheckCircle, XCircle, Loader2, Send, ArrowLeft } from "lucide-react";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import {
  TOKENS as T,
  Kicker,
  Display,
  Lede,
  Field,
  Input,
  Button,
  Notice,
  PageShell,
} from "@/components/shenmay/ui/ShenmayUI";

const ShenmayVerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();

  // Support token from URL path (/shenmay/verify/:token) or query string (?token=...)
  const token = params.token || searchParams.get("token");

  const [status, setStatus] = useState(token ? "loading" : "no-token");
  const [errorMsg, setErrorMsg] = useState("");

  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setStatus("success");
        setTimeout(() => navigate("/shenmay/onboarding", { replace: true }), 1500);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err?.message || "This verification link has expired or is invalid. Please request a new one.");
      });
    return () => { cancelled = true; };
  }, [token, navigate]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    try { await resendVerification(resendEmail.trim()); setResent(true); }
    catch {}
    finally { setResending(false); }
  };

  return (
    <PageShell style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div style={{ marginBottom: 36, display: "flex", justifyContent: "center" }}>
          <ShenmayWordmark size={24} />
        </div>

        {status === "loading" && (
          <>
            <Loader2 size={42} color={T.teal} style={{ margin: "0 auto", animation: "spin 1.2s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <Lede style={{ marginTop: 20 }}>Verifying your email…</Lede>
          </>
        )}

        {status === "no-token" && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#F3E8E4", border: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <XCircle size={30} color={T.danger} />
            </div>
            <Kicker color={T.danger}>Invalid link</Kicker>
            <Display size={30} italic style={{ marginTop: 12 }}>Something's off.</Display>
            <Lede style={{ marginTop: 12 }}>
              This verification link has expired or is invalid. Please request a new one.
            </Lede>
            <div style={{ marginTop: 28 }}>
              <Link to="/shenmay/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.teal, textDecoration: "none", fontWeight: 500 }}>
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#EBF1E9", border: `1px solid #CDDCCA`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <CheckCircle size={30} color={T.success} />
            </div>
            <Kicker color={T.success}>Verified</Kicker>
            <Display size={32} italic style={{ marginTop: 12 }}>Your email is confirmed.</Display>
            <Lede style={{ marginTop: 12 }}>Your account is ready. Let's set up your agent.</Lede>
            <div style={{ marginTop: 20, fontSize: 12, color: T.mute, fontFamily: T.mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Redirecting to onboarding…
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#F3E8E4", border: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <XCircle size={30} color={T.danger} />
            </div>
            <Kicker color={T.danger}>Verification failed</Kicker>
            <Display size={30} italic style={{ marginTop: 12 }}>Link didn't work.</Display>
            <Lede style={{ marginTop: 12 }}>{errorMsg}</Lede>

            {resent ? (
              <div style={{ marginTop: 28 }}>
                <Notice tone="success" icon={CheckCircle}>
                  A new verification link has been sent. Check your inbox.
                </Notice>
              </div>
            ) : (
              <form onSubmit={handleResend} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16, textAlign: "left" }}>
                <div style={{ textAlign: "center" }}>
                  <Kicker color={T.mute}>Enter your email for a new link</Kicker>
                </div>
                <Input type="email" required value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} placeholder="you@company.com" />
                <Button type="submit" variant="primary" size="lg" disabled={resending}>
                  {resending ? "Sending…" : (<><Send size={14} /> Send new link</>)}
                </Button>
              </form>
            )}

            <div style={{ marginTop: 28 }}>
              <Link to="/shenmay/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.mute, textDecoration: "none" }}>
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
};

export default ShenmayVerifyEmail;
