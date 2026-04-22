import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { getInviteInfo, acceptInvite, setToken } from "@/lib/shenmayApi";
import { Eye, EyeOff, AlertTriangle, ArrowRight } from "lucide-react";
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
  Card,
  PageShell,
} from "@/components/shenmay/ui/ShenmayUI";

const ShenmayAcceptInvite = () => {
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
        if (data.error) setInfoError(data.error);
        else {
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
    if (password !== confirmPassword) { setSubmitError("Passwords don't match"); return; }
    if (password.length < 8) { setSubmitError("Password must be at least 8 characters"); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await acceptInvite(token, password, firstName, lastName);
      if (data.error) { setSubmitError(data.error); return; }
      if (data.token) { setToken(data.token); navigate("/shenmay/dashboard", { replace: true }); }
    } catch (err) {
      setSubmitError(err.message || "Failed to accept invitation. Please try again.");
    } finally { setSubmitting(false); }
  };

  return (
    <PageShell style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "center" }}>
          <ShenmayWordmark size={24} />
        </div>

        <Card featured style={{ padding: 32 }}>
          {loadingInfo ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0", gap: 14 }}>
              <div style={{ width: 28, height: 28, border: `2px solid ${T.teal}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <Kicker color={T.mute}>Loading invitation…</Kicker>
            </div>
          ) : infoError ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <AlertTriangle size={26} color={T.danger} style={{ margin: "0 auto 14px" }} />
              <Lede style={{ marginTop: 0 }}>{infoError}</Lede>
              <div style={{ marginTop: 24 }}>
                <Link to="/shenmay/login" style={{ color: T.teal, fontWeight: 500, textDecoration: "none", borderBottom: `1px solid ${T.teal}40` }}>
                  Go to sign in →
                </Link>
              </div>
            </div>
          ) : (
            <>
              <Kicker>You're invited</Kicker>
              <Display size={28} italic style={{ marginTop: 12 }}>Join {inviteInfo?.company_name}.</Display>
              <Lede style={{ marginTop: 10 }}>
                Setting up access for <strong style={{ color: T.ink }}>{inviteInfo?.email}</strong>.
              </Lede>

              <form onSubmit={handleSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field id="firstName" label="First name">
                    <Input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                  </Field>
                  <Field id="lastName" label="Last name">
                    <Input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                  </Field>
                </div>

                <Field id="password" label="Password">
                  <div style={{ position: "relative" }}>
                    <Input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" style={{ paddingRight: 40 }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.mute, cursor: "pointer", padding: 4 }}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                <Field id="confirmPassword" label="Confirm password">
                  <Input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" />
                </Field>

                {submitError && <Notice tone="danger" icon={AlertTriangle}>{submitError}</Notice>}

                <Button type="submit" variant="primary" size="lg" disabled={submitting}>
                  {submitting ? "Setting up your account…" : (<>Accept &amp; sign in <ArrowRight size={15} /></>)}
                </Button>
              </form>
            </>
          )}
        </Card>

        <p style={{ textAlign: "center", fontSize: 13, color: T.mute, marginTop: 24 }}>
          Already have an account?&nbsp;{" "}
          <Link to="/shenmay/login" style={{ color: T.teal, textDecoration: "none", fontWeight: 500, borderBottom: `1px solid ${T.teal}40` }}>
            Sign in
          </Link>
        </p>
      </div>
    </PageShell>
  );
};

export default ShenmayAcceptInvite;
