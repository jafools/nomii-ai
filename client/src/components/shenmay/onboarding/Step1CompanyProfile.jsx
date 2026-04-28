import { useState } from "react";
import { updateCompany } from "@/lib/shenmayApi";
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
const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-[#6B6B64] focus:outline-none focus:ring-2 focus:ring-[#0F5F5C]/20 focus:border-[#0F5F5C]/50";
const inpStyle = { backgroundColor: "#EDE7D7", color: "#1A1D1A", borderColor: "#D8D0BD" };

const Step1CompanyProfile = ({ shenmayTenant, setShenmayTenant, advance, stepIndex }) => {
  const [form, setForm] = useState({
    name: shenmayTenant?.name || "",
    agent_name: shenmayTenant?.agent_name || "",
    vertical: shenmayTenant?.vertical || "",
    primary_color: shenmayTenant?.primary_color || "#1A1D1A",
    secondary_color: shenmayTenant?.secondary_color || "#0F5F5C",
    website_url: shenmayTenant?.website_url || "",
    company_description: shenmayTenant?.company_description || shenmayTenant?.description || "",
  });
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState("");

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (field === "website_url") setUrlError("");
  };

  // Empty URL is allowed (the field isn't required). Non-empty must parse.
  const isValidUrl = (v) => {
    if (!v) return true;
    try {
      const u = new URL(v.match(/^https?:\/\//i) ? v : `https://${v}`);
      return Boolean(u.hostname && u.hostname.includes("."));
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    if (!isValidUrl(form.website_url.trim())) {
      setUrlError("Enter a valid URL (e.g. https://yourcompany.com).");
      return;
    }
    setSaving(true);
    try {
      const data = await updateCompany(form);
      if (data.tenant) setShenmayTenant(data.tenant);
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
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0F5F5C" }}>Figure 01 · Your company</div>
        <h2 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 300, fontStyle: "italic", fontSize: 32, letterSpacing: "-0.04em", color: "#1A1D1A", lineHeight: 1.05, margin: "12px 0 0" }}>Tell us about your business.</h2>
        <p style={{ fontSize: 15, color: "#6B6B64", marginTop: 12, lineHeight: 1.55 }}>So your AI agent can represent you accurately.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Company Name</label>
          <input type="text" maxLength={200} value={form.name} onChange={set("name")} placeholder="Acme Financial Services" className={inp} style={inpStyle} />
          <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>Your customers will see this name when chatting with your agent.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Agent Name</label>
          <input type="text" maxLength={100} value={form.agent_name} onChange={set("agent_name")} placeholder="e.g. Ava, Support Bot, your brand name" className={inp} style={inpStyle} />
          <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>What should your AI agent introduce itself as?</p>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Industry</label>
          <select required value={form.vertical} onChange={set("vertical")} className={inp + " cursor-pointer"} style={inpStyle}>
            <option value="" disabled style={{ background: "#EDE7D7" }}>What industry are you in?</option>
            {INDUSTRIES.map((v) => <option key={v.value} value={v.value} style={{ background: "#EDE7D7" }}>{v.label}</option>)}
          </select>
          <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>Helps us tailor your agent's default behavior and tone.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Chat Window Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color} onChange={set("primary_color")} className="h-10 w-12 rounded-lg border cursor-pointer p-0.5" style={{ borderColor: "#D8D0BD", backgroundColor: "#EDE7D7" }} />
              <input type="text" value={form.primary_color} onChange={set("primary_color")} className={inp + " flex-1"} style={inpStyle} maxLength={7} />
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>Colors the chat header and your customers' message bubbles.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Chat Bubble Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondary_color} onChange={set("secondary_color")} className="h-10 w-12 rounded-lg border cursor-pointer p-0.5" style={{ borderColor: "#D8D0BD", backgroundColor: "#EDE7D7" }} />
              <input type="text" value={form.secondary_color} onChange={set("secondary_color")} className={inp + " flex-1"} style={inpStyle} maxLength={7} />
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>The floating button on your website visitors will click to open the chat.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Website URL</label>
          <input
            type="url"
            value={form.website_url}
            onChange={set("website_url")}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && !isValidUrl(v)) setUrlError("Enter a valid URL (e.g. https://yourcompany.com).");
            }}
            placeholder="https://yourcompany.com"
            className={inp}
            style={{ ...inpStyle, ...(urlError ? { borderColor: "#7A1F1A" } : {}) }}
          />
          {urlError && <p className="text-[12px] mt-1.5" style={{ color: "#7A1F1A" }}>{urlError}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "#6B6B64" }}>Company Description</label>
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
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 hover:shadow-lg hover:shadow-[#0F5F5C]/20 group"
          style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
        >
          {saving ? "Saving…" : "Save & Continue"}
          {!saving && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>
    </div>
  );
};

export default Step1CompanyProfile;
