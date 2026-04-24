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

const AnonymousOnlySection = () => {
  const [loading, setLoading] = useState(true);
  const [role, setRole]       = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    getMe()
      .then((data) => {
        setRole(data.admin?.role || null);
        setEnabled(data.tenant?.anonymous_only_mode === true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || role !== 'owner') return null;

  const onToggle = async (next) => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await updateAnonymousOnlyMode(next);
      setEnabled(r.anonymous_only_mode);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast({
        title: 'Could not update anonymous-only mode',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl p-5 sm:p-6" style={card}>
      <div className="flex items-center gap-2 mb-1">
        <EyeOff size={16} style={{ color: 'rgba(15,95,92,0.85)' }} />
        <h3 className="text-base font-semibold text-[#1A1D1A]/85">Anonymous-only mode</h3>
      </div>
      <p className="text-xs text-[#6B6B64] mb-4">
        Owner-only. Forces the widget to run anonymously for every visitor on this tenant.
      </p>

      <div className="flex items-start justify-between gap-4 p-4 rounded-xl"
           style={{ background: '#EDE7D7', border: '1px solid #EDE7D7' }}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#1A1D1A] mb-1">Force anonymous widget sessions</div>
          <p className="text-xs text-[#6B6B64] leading-relaxed">
            When ON, any identity the host page passes (via <code style={{ color: 'rgba(15,95,92,0.85)' }}>data-user-email</code> or
            a <code style={{ color: 'rgba(15,95,92,0.85)' }}>shenmay:setUser</code> postMessage) is ignored. The widget
            treats every visitor as anonymous — no customer record is created, no memory or soul file is attached,
            and conversations stay session-local. Use this if your customers need a hard guarantee that your vendor
            (you) does not retain a persistent profile of their end users (typical in regulated verticals).
          </p>
          {enabled && (
            <div className="mt-3 flex items-start gap-2 text-xs p-2 rounded-lg"
                 style={{ background: 'rgba(15,95,92,0.08)', border: '1px solid rgba(15,95,92,0.2)', color: '#0F5F5C' }}>
              <Shield size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Anonymous-only mode is ON. Authenticated-widget features (personalised greetings, agent nicknames,
                cross-session memory) are disabled for every visitor until this is turned off.
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onToggle(!enabled)}
          className="flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label={enabled ? 'Disable anonymous-only mode' : 'Enable anonymous-only mode'}
          style={{ color: enabled ? '#0F5F5C' : '#6B6B64' }}
        >
          {enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
        </button>
      </div>

      {saved && (
        <div className="mt-3 flex items-center gap-1.5 text-sm font-medium" style={{ color: '#2D6A4F' }}>
          <Check size={14} /> Saved
        </div>
      )}
    </section>
  );
};


export default AnonymousOnlySection;
