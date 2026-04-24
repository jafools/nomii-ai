import { useState, useEffect } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { getMe, updateCompany, updatePrivacySettings, updateAnonymousOnlyMode, getProducts, addProduct, updateProduct, deleteProduct, getDataApiKey, generateDataApiKey, revokeDataApiKey, getAgentSoul, generateSoul, getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getLabels, createLabel, updateLabel, deleteLabel, getConnectors, updateConnectors, testSlack, testTeams, getEmailTemplates, updateEmailTemplates } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, Plus, Trash2, Pencil, X, ChevronUp, Key, AlertTriangle, RefreshCw, Eye, EyeOff, Brain, Sparkles, Shield, MessageSquare, Webhook, ToggleLeft, ToggleRight, Send, ChevronDown, Tag, Plug2, Zap, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { TOKENS as T, Kicker, Display, Lede } from "@/components/shenmay/ui/ShenmayUI";

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


import { card, inputClass, inputStyle } from "./_shared";

const AgentSoulSection = () => {
  const [soul, setSoul]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getAgentSoul();
      setSoul(d.soul || null);
    } catch (err) {
      toast({ title: "Failed to load soul", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const d = await generateSoul();
      setSoul(d.soul || null);
      toast({ title: "Agent soul generated!", description: "Your AI agent's identity has been refreshed." });
    } catch (err) {
      toast({ title: "Failed to generate soul", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-2xl p-6" style={card}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#3A3D39] flex items-center gap-2 mb-1">
            <Brain size={14} style={{ color: "#0F5F5C" }} /> Agent Soul
          </h3>
          <p className="text-[12px] text-[#6B6B64]">
            Your agent's identity, tone, and communication style — auto-generated from your company profile.
            Regenerate any time after updating your profile.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80 shrink-0 ml-4 disabled:opacity-50"
          style={{ background: "rgba(15,95,92,0.12)", color: "#0F5F5C", border: "1px solid rgba(15,95,92,0.2)" }}
        >
          <Sparkles size={12} />
          {generating ? "Generating…" : soul ? "Regenerate" : "Generate Soul"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: "#EDE7D7" }} />)}
        </div>
      ) : !soul ? (
        <div className="rounded-xl p-5 text-center" style={{ background: "rgba(15,95,92,0.04)", border: "1px dashed rgba(15,95,92,0.15)" }}>
          <p className="text-sm text-[#6B6B64] mb-1">No soul generated yet.</p>
          <p className="text-xs text-[#6B6B64]">Click <strong className="text-[#6B6B64]">Generate Soul</strong> to create your agent's identity from your company profile.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Identity */}
          {soul.base_identity && (
            <div className="rounded-xl p-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
              <p className="text-[11px] font-semibold text-[#6B6B64] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Brain size={10} /> Identity
              </p>
              <div className="space-y-1.5">
                <div className="flex gap-3 text-sm">
                  <span className="text-[#6B6B64] w-24 shrink-0">Agent Name</span>
                  <span className="text-[#3A3D39] font-medium">{soul.base_identity.agent_name}</span>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-[#6B6B64] w-24 shrink-0">Organisation</span>
                  <span className="text-[#3A3D39]">{soul.base_identity.organization}</span>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-[#6B6B64] w-24 shrink-0">Tone</span>
                  <span className="text-[#3A3D39] italic">{soul.base_identity.tone_description}</span>
                </div>
                {soul.base_identity.role && (
                  <div className="flex gap-3 text-sm">
                    <span className="text-[#6B6B64] w-24 shrink-0">Role</span>
                    <span className="text-[#6B6B64] text-xs leading-relaxed">{soul.base_identity.role}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Communication style */}
          {soul.communication_style?.key_principles?.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
              <p className="text-[11px] font-semibold text-[#6B6B64] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare size={10} /> Communication Principles
              </p>
              <ul className="space-y-1.5">
                {soul.communication_style.key_principles.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[#6B6B64]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "rgba(15,95,92,0.4)" }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Compliance */}
          {soul.compliance?.disclaimer && (
            <div className="rounded-xl p-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
              <p className="text-[11px] font-semibold text-[#6B6B64] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={10} /> Compliance
              </p>
              <p className="text-[13px] text-[#6B6B64] leading-relaxed">{soul.compliance.disclaimer}</p>
              {soul.compliance.restricted_topics?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {soul.compliance.restricted_topics.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: "rgba(122,31,26,0.08)", color: "rgba(248,113,113,0.6)", border: "1px solid rgba(122,31,26,0.1)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {soul.generated_at && (
            <p className="text-[11px] text-[#D8D0BD] text-right">
              Last generated {new Date(soul.generated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};


export default AgentSoulSection;
