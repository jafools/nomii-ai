import { useState, useEffect } from "react";
import { getMe, updateProfile, updatePassword } from "@/lib/shenmayApi";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { toast } from "@/hooks/use-toast";
import { Check, Eye, EyeOff } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Field, Input, Button, Notice } from "@/components/shenmay/ui/ShenmayUI";

const getStrength = (pw) => {
  if (!pw || pw.length < 8) return { text: "Min. 8 characters", color: T.danger, pct: 15 };
  let s = 0;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (s <= 1) return { text: "Weak", color: T.warning, pct: 40 };
  if (s <= 2) return { text: "Getting stronger", color: T.teal, pct: 70 };
  return { text: "Strong", color: T.success, pct: 100 };
};

const SectionCard = ({ kicker, title, children, style }) => (
  <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 28, ...style }}>
    <Kicker color={T.mute}>{kicker}</Kicker>
    <h3 style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 18, letterSpacing: "-0.015em", color: T.ink, margin: "10px 0 22px" }}>{title}</h3>
    {children}
  </div>
);

const PersonalInfo = ({ admin, onUpdated }) => {
  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!admin) return;
    setForm({ first_name: admin.first_name || "", last_name: admin.last_name || "" });
  }, [admin]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) { toast({ title: "Please fill in both name fields.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await updateProfile({ first_name: form.first_name.trim(), last_name: form.last_name.trim() });
      setSaved(true);
      onUpdated?.();
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const role = admin?.role || "admin";
  const roleBadge = {
    admin: { color: T.teal,    label: "Admin" },
    owner: { color: T.tealDark, label: "Owner" },
    agent: { color: T.mute,    label: "Agent" },
  };
  const badge = roleBadge[role] || { color: T.mute, label: role };

  return (
    <SectionCard kicker="Figure 01 · Who you are" title="Personal information">
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <Field id="first_name" label="First name">
            <Input id="first_name" type="text" required maxLength={100} value={form.first_name} onChange={set("first_name")} />
          </Field>
          <Field id="last_name" label="Last name">
            <Input id="last_name" type="text" required maxLength={100} value={form.last_name} onChange={set("last_name")} />
          </Field>
          <Field id="email" label="Email">
            <Input id="email" type="email" readOnly value={admin?.email || ""} style={{ background: T.paperDeep, color: T.mute, cursor: "default" }} tabIndex={-1} />
          </Field>
          <Field id="role" label="Role">
            <div style={{ paddingTop: 6 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 3, background: `${badge.color}18`, color: badge.color }}>
                {badge.label}
              </span>
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: T.success }}>
              <Check size={13} /> Saved
            </span>
          )}
        </div>
      </form>
    </SectionCard>
  );
};

const ChangePassword = () => {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); setError(""); };
  const strength = getStrength(form.new_password);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (form.new_password.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (form.new_password !== form.confirm) { setError("Passwords do not match."); return; }
    setSaving(true);
    try {
      await updatePassword({ current_password: form.current_password, new_password: form.new_password });
      setSaved(true);
      setForm({ current_password: "", new_password: "", confirm: "" });
      toast({ title: "Password updated" });
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally { setSaving(false); }
  };

  return (
    <SectionCard kicker="Figure 02 · Secure access" title="Change password">
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 520 }}>
        <Field id="current_password" label="Current password">
          <div style={{ position: "relative" }}>
            <Input id="current_password" type={showCurrent ? "text" : "password"} required value={form.current_password} onChange={set("current_password")} style={{ paddingRight: 40 }} />
            <button type="button" onClick={() => setShowCurrent((v) => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.mute, cursor: "pointer", padding: 4 }}>
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <Field id="new_password" label="New password">
          <div style={{ position: "relative" }}>
            <Input id="new_password" type={showNew ? "text" : "password"} required minLength={8} value={form.new_password} onChange={set("new_password")} style={{ paddingRight: 40 }} />
            <button type="button" onClick={() => setShowNew((v) => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.mute, cursor: "pointer", padding: 4 }}>
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {form.new_password.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {[25, 50, 75, 100].map((p) => (
                  <div key={p} style={{ flex: 1, height: 3, borderRadius: 2, background: strength.pct >= p ? strength.color : T.paperEdge, transition: "background 200ms ease" }} />
                ))}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: strength.color }}>{strength.text}</div>
            </div>
          )}
        </Field>

        <Field id="confirm" label="Confirm new password">
          <Input id="confirm" type="password" required value={form.confirm} onChange={set("confirm")} style={form.confirm && form.new_password && form.confirm !== form.new_password ? { borderColor: T.danger } : undefined} />
          {form.confirm && form.new_password && form.confirm !== form.new_password && (
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: T.danger, marginTop: 6 }}>
              Passwords don't match
            </div>
          )}
        </Field>

        {error && <Notice tone="danger">{error}</Notice>}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Updating…" : "Update password"}
          </Button>
          {saved && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: T.success }}>
              <Check size={13} /> Password updated
            </span>
          )}
        </div>
      </form>
    </SectionCard>
  );
};

const ShenmayProfile = () => {
  const { setShenmayUser } = useShenmayAuth();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const data = await getMe();
      setAdmin(data.admin || null);
      if (data.admin) setShenmayUser(data.admin);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchMe(); }, []);

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 32 }}>
          <Kicker>Your account</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>Profile.</Display>
        </div>
        <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 28, animation: "pulse 1.8s ease-in-out infinite" }}>
          <div style={{ height: 14, width: 180, borderRadius: 3, background: T.paperEdge, marginBottom: 20 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[...Array(4)].map((_, i) => <div key={i} style={{ height: 42, borderRadius: 6, background: T.paperEdge }} />)}
          </div>
          <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <Kicker>Your account</Kicker>
        <Display size={38} italic style={{ marginTop: 12 }}>Profile.</Display>
        <Lede>Manage your personal information and password.</Lede>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <PersonalInfo admin={admin} onUpdated={fetchMe} />
        <ChangePassword />
      </div>
    </div>
  );
};

export default ShenmayProfile;
