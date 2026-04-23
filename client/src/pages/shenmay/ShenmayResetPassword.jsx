import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "@/lib/shenmayApi";
import { ArrowRight, CheckCircle, AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import ShenmaySeal from "@/components/shenmay/ShenmaySeal";
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

const ShenmayResetPassword = () => {
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
    try { await resetPassword(token, password); setSuccess(true); }
    catch (err) { setError(err.message || "Reset failed. The link may have expired."); }
    finally { setLoading(false); }
  };

  const expiredHint = /expired|invalid/i.test(error);

  return (
    <PageShell style={{ display: "flex" }}>
      {/* ── LEFT editorial panel ───────────────────────────── */}
      <aside
        className="shenmay-reset-aside"
        style={{
          display: "none",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "45%",
          background: T.paperDeep,
          borderRight: `1px solid ${T.paperEdge}`,
          padding: "56px 64px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div>
          <ShenmayWordmark size={28} />
          <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: T.mute, marginTop: 10 }}>
            by Pontén Solutions
          </div>
        </div>
        <div style={{ maxWidth: 440 }}>
          <Kicker style={{ marginBottom: 20 }}>Figure 02 · Reset access</Kicker>
          <Display size={42} italic>Choose a strong password.</Display>
          <Lede style={{ fontSize: 16, marginTop: 16 }}>
            Eight characters minimum. Mix cases, numbers, and a symbol if you can — your agent's memory deserves it.
          </Lede>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: `1px solid ${T.paperEdge}`, paddingTop: 20 }}>
          <Lock size={16} color={T.teal} />
          <span style={{ fontSize: 13, color: T.inkSoft }}>End-to-end encryption. Nobody — including us — sees your password.</span>
        </div>
        <div style={{ position: "absolute", top: 40, right: 40, opacity: 0.9 }}>
          <ShenmaySeal size={90} paper={T.paperDeep} />
        </div>
      </aside>

      <style>{`@media (min-width: 1024px) { .shenmay-reset-aside { display: flex !important; } }`}</style>

      {/* ── RIGHT form ───────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div className="shenmay-reset-mobile-mark" style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
            <ShenmayWordmark size={24} />
          </div>
          <style>{`@media (min-width: 1024px) { .shenmay-reset-mobile-mark { display: none !important; } }`}</style>

          {success ? (
            <>
              <Kicker color={T.success}>Reset complete</Kicker>
              <Display size={34} italic style={{ marginTop: 14 }}>You're all set.</Display>
              <Lede style={{ marginTop: 12 }}>Your password has been updated. Sign in with your new password below.</Lede>
              <div style={{ marginTop: 28 }}>
                <Notice tone="success" icon={CheckCircle}>
                  Password reset — ready to sign in.
                </Notice>
              </div>
              <div style={{ marginTop: 24 }}>
                <Link to="/login" style={{ width: "100%", textDecoration: "none" }}>
                  <Button variant="primary" size="lg" style={{ width: "100%" }}>
                    Go to sign in <ArrowRight size={15} />
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <Kicker>Reset your password</Kicker>
              <Display size={34} italic style={{ marginTop: 14 }}>Pick a new one.</Display>
              <Lede>Choose something you haven't used before.</Lede>

              <form onSubmit={handleSubmit} style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 20 }}>
                <Field id="new-password" label="New password">
                  <Input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
                  {password.length > 0 && password.length < 8 && (
                    <div style={{ fontSize: 11, color: T.danger, marginTop: 6, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Must be at least 8 characters
                    </div>
                  )}
                </Field>

                <Field id="confirm-password" label="Confirm password">
                  <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" style={confirm.length > 0 && password !== confirm ? { borderColor: T.danger } : undefined} />
                  {confirm.length > 0 && password !== confirm && (
                    <div style={{ fontSize: 11, color: T.danger, marginTop: 6, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Passwords don't match
                    </div>
                  )}
                </Field>

                {error && (
                  <Notice tone="danger" icon={AlertTriangle}>
                    <div>{error}</div>
                    {expiredHint && (
                      <div style={{ marginTop: 8 }}>
                        <Link to="/login" style={{ color: T.teal, fontWeight: 500, textDecoration: "none", borderBottom: `1px solid ${T.teal}40` }}>
                          Request a new link →
                        </Link>
                      </div>
                    )}
                  </Notice>
                )}

                <Button type="submit" variant="primary" size="lg" disabled={loading || !valid}>
                  {loading ? "Resetting…" : "Reset password"}
                </Button>
              </form>

              <div style={{ marginTop: 28, textAlign: "center" }}>
                <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: T.mute, textDecoration: "none" }}>
                  <ArrowLeft size={14} /> Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </PageShell>
  );
};

export default ShenmayResetPassword;
