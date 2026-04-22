import { useState, useEffect } from "react";
import { getMe, updateProfile, updatePassword } from "@/lib/shenmayApi";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { toast } from "@/hooks/use-toast";
import { Check, Eye, EyeOff } from "lucide-react";

const card = { background: "#EDE7D7", border: "1px solid #EDE7D7" };
const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(15,95,92,0.3)]";
const inputStyle = { background: "#EDE7D7", border: "1px solid #EDE7D7", color: "#1A1D1A" };
const readOnlyStyle = { ...inputStyle, background: "#EDE7D7", color: "#6B6B64", cursor: "default" };

const getStrength = (pw) => {
  if (!pw || pw.length < 8) return { text: "Min. 8 characters", color: "#7A1F1A", pct: 15 };
  let s = 0;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  if (s <= 1) return { text: "Weak", color: "#A6660E", pct: 40 };
  if (s <= 2) return { text: "Getting stronger", color: "#0F5F5C", pct: 70 };
  return { text: "Strong", color: "#2D6A4F", pct: 100 };
};

/* ---------- Personal Info ---------- */
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
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast({ title: "Please fill in both name fields.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ first_name: form.first_name.trim(), last_name: form.last_name.trim() });
      setSaved(true);
      onUpdated?.();
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const role = admin?.role || "admin";
  const roleBadge = {
    admin: { bg: "rgba(15,95,92,0.12)", color: "#0F5F5C", label: "Admin" },
    owner: { bg: "rgba(139,92,246,0.12)", color: "#A78BFA", label: "Owner" },
  };
  const badge = roleBadge[role] || { bg: "#EDE7D7", color: "#6B6B64", label: role };

  return (
    <form onSubmit={handleSave} className="rounded-2xl p-6 space-y-5" style={card}>
      <h3 className="text-sm font-semibold text-[#3A3D39]">Personal Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">First Name</label>
          <input type="text" required maxLength={100} value={form.first_name} onChange={set("first_name")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Last Name</label>
          <input type="text" required maxLength={100} value={form.last_name} onChange={set("last_name")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Email</label>
          <input type="email" readOnly value={admin?.email || ""} className={inputClass} style={readOnlyStyle} tabIndex={-1} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Role</label>
          <div className="pt-1">
            <span className="inline-block px-3 py-1 rounded-full text-[12px] font-semibold" style={{ background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#2D6A4F" }}>
            <Check size={14} /> Saved ✓
          </span>
        )}
      </div>
    </form>
  );
};

/* ---------- Change Password ---------- */
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="rounded-2xl p-6 space-y-5" style={card}>
      <h3 className="text-sm font-semibold text-[#3A3D39]">Change Password</h3>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Current Password</label>
          <div className="relative">
            <input type={showCurrent ? "text" : "password"} required value={form.current_password} onChange={set("current_password")} className={inputClass + " pr-10"} style={inputStyle} />
            <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#6B6B64" }}>
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">New Password</label>
          <div className="relative">
            <input type={showNew ? "text" : "password"} required minLength={8} value={form.new_password} onChange={set("new_password")} className={inputClass + " pr-10"} style={inputStyle} />
            <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "#6B6B64" }}>
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {form.new_password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[25, 50, 75, 100].map((t) => (
                  <div key={t} className="h-1 flex-1 rounded-full transition-all duration-300" style={{ backgroundColor: strength.pct >= t ? strength.color : "#EDE7D7" }} />
                ))}
              </div>
              <p className="text-[11px] font-medium" style={{ color: strength.color }}>{strength.text}</p>
            </div>
          )}
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Confirm New Password</label>
          <input type="password" required value={form.confirm} onChange={set("confirm")} className={inputClass} style={inputStyle} />
          {form.confirm && form.new_password && form.confirm !== form.new_password && (
            <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#7A1F1A" }}>Passwords do not match.</p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "rgba(122,31,26,0.08)", border: "1px solid rgba(122,31,26,0.15)", color: "#7A1F1A" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
          {saving ? "Updating…" : "Update password"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#2D6A4F" }}>
            <Check size={14} /> Password updated ✓
          </span>
        )}
      </div>
    </form>
  );
};

/* ---------- Main ---------- */
const ShenmayProfile = () => {
  const { setShenmayUser } = useShenmayAuth();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const data = await getMe();
      setAdmin(data.admin || null);
      if (data.admin) setShenmayUser(data.admin);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMe(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-6 animate-pulse space-y-4" style={card}>
          <div className="h-4 w-40 rounded-lg" style={{ background: "#EDE7D7" }} />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-xl" style={{ background: "#EDE7D7" }} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-xl font-bold text-[#1A1D1A] mb-1">Profile</h2>
        <p className="text-sm text-[#6B6B64]">Manage your personal information and password.</p>
      </div>
      <PersonalInfo admin={admin} onUpdated={fetchMe} />
      <ChangePassword />
    </div>
  );
};

export default ShenmayProfile;
