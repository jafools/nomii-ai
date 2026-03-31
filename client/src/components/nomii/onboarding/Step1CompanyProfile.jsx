import { useState } from "react";
import { updateCompany } from "@/lib/nomiiApi";
import { toast } from "@/hooks/use-toast";
import { ArrowRight } from "lucide-react";

const INDUSTRIES = [
  { value: "financial", label: "Financial" },
  { value: "retirement", label: "Retirement" },
  { value: "ministry", label: "Ministry" },
  { value: "healthcare", label: "Healthcare" },
  { value: "insurance", label: "Insurance" },
  { value: "education", label: "Education" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "other", label: "Other" },
];

// Dark-themed shared input styles
const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

const Step1CompanyProfile = ({ nomiiTenant, setNomiiTenant, advance, stepIndex }) => {
  const [form, setForm] = useState({
    name: nomiiTenant?.name || "",
    agent_name: nomiiTenant?.agent_name || "",
    vertical: nomiiTenant?.vertical || "",
    primary_color: nomiiTenant?.primary_color || "#1E3A5F",
    secondary_color: nomiiTenant?.secondary_color || "#C9A84C",
    website_url: nomiiTenant?.website_url || "",
    company_description: nomiiTenant?.company_description || nomiiTenant?.description || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await updateCompany(form);
      if (data.tenant) setNomiiTenant(data.tenant);
      toast({ title: "Company profile saved!", description: "Moving to the next step." });
      advance(stepIndex);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Company Profile</h2>
      <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>Tell us about your company so your AI agent can represent you accurately.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Company Name</label>
          <input type="text" required maxLength={200} value={form.name} onChange={set("name")} placeholder="Acme Financial Services" className={inp} style={inpStyle} />
          <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Your customers will see this name when chatting with your agent.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Agent Name</label>
          <input type="text" maxLength={100} value={form.agent_name} onChange={set("agent_name")} placeholder="e.g. Ava, Support Bot, your brand name" className={inp} style={inpStyle} />
          <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>What should your AI agent introduce itself as?</p>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Industry</label>
          <select required value={form.vertical} onChange={set("vertical")} className={inp + " cursor-pointer"} style={inpStyle}>
            <option value="" disabled style={{ background: "#0F1A2E" }}>What industry are you in?</option>
            {INDUSTRIES.map((v) => <option key={v.value} value={v.value} style={{ background: "#0F1A2E" }}>{v.label}</option>)}
          </select>
          <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Helps us tailor your agent's default behavior and tone.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Chat Window Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color} onChange={set("primary_color")} className="h-10 w-12 rounded-lg border cursor-pointer p-0.5" style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" }} />
              <input type="text" value={form.primary_color} onChange={set("primary_color")} className={inp + " flex-1"} style={inpStyle} maxLength={7} />
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Colors the chat header and your customers' message bubbles.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Chat Bubble Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondary_color} onChange={set("secondary_color")} className="h-10 w-12 rounded-lg border cursor-pointer p-0.5" style={{ borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" }} />
              <input type="text" value={form.secondary_color} onChange={set("secondary_color")} className={inp + " flex-1"} style={inpStyle} maxLength={7} />
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>The floating button on your website visitors will click to open the chat.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Website URL</label>
          <input type="url" value={form.website_url} onChange={set("website_url")} placeholder="https://yourcompany.com" className={inp} style={inpStyle} />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>Company Description</label>
          <textarea
            rows={4}
            maxLength={2000}
            value={form.company_description}
            onChange={set("company_description")}
            className={inp}
            style={inpStyle}
            placeholder="Describe what your company does — products, services, target audience. This helps your AI agent represent you accurately."
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-[#C9A84C]/20 group"
          style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
        >
          {saving ? "Saving…" : "Save & Continue"}
          {!saving && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>
    </div>
  );
};

export default Step1CompanyProfile;
