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

const WidgetSection = () => {
  const { shenmayTenant } = useShenmayAuth();
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const widgetKey = shenmayTenant?.widget_key || "";
  const apiOrigin = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
    : window.location.origin;
  const snippet = `<script\n  src="${apiOrigin}/embed.js"\n  data-widget-key="${widgetKey}"\n  data-user-email="LOGGED_IN_USER_EMAIL"\n  data-user-name="LOGGED_IN_USER_NAME"\n  async>\n</script>`;

  const copy = (text, setter) => {
    copyToClipboard(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <h3 className="text-sm font-semibold text-[#3A3D39]">Widget</h3>
      <div>
        <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Your Widget Key</label>
        <div className="flex gap-2">
          <input type="text" readOnly value={widgetKey} className={inputClass + " flex-1 font-mono text-xs"} style={inputStyle} />
          <button onClick={() => copy(widgetKey, setCopiedKey)} className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors" style={{ border: "1px solid #EDE7D7", color: "#6B6B64" }}>
            {copiedKey ? <><Check size={14} style={{ color: "#2D6A4F" }} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Verification Status</label>
        {shenmayTenant?.widget_verified ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(45,106,79,0.12)", color: "#2D6A4F" }}>
            <Check size={12} /> Connected
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#A6660E" }}>Not yet detected</span>
            <Link to="/onboarding" className="text-xs font-medium hover:underline" style={{ color: "#0F5F5C" }}>→ Installation guide</Link>
          </div>
        )}
      </div>
      <div>
        <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Embed Snippet</label>
        <div className="relative">
          <pre className="p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7", color: "#6B6B64" }}>{snippet}</pre>
          <button onClick={() => copy(snippet, setCopiedSnippet)} className="absolute top-2 right-2 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7", color: "#6B6B64" }}>
            {copiedSnippet ? <><Check size={12} style={{ color: "#2D6A4F" }} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetSection;
