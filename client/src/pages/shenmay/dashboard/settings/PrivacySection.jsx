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

// PII tokenization is the safety control that rewrites SSNs, cards, emails,
// phones, and other regulated identifiers into opaque tokens before any
// outbound Anthropic call (chat, CSV import, AI product extraction). Default
// ON for every tenant. Only the original onboarding owner can disable it —
// the backend enforces this with a 403 for member/agent roles, and we hide
// the section client-side so other team members never see the option at all.
const PrivacySection = () => {
  const [loading, setLoading] = useState(true);
  const [role, setRole]       = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    getMe()
      .then((data) => {
        setRole(data.admin?.role || null);
        setEnabled(data.tenant?.pii_tokenization_enabled !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Hide the whole section for non-owners. Server still enforces — this is UX.
  if (loading || role !== 'owner') return null;

  const onToggle = async (next) => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await updatePrivacySettings(next);
      setEnabled(r.pii_tokenization_enabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast({
        title: 'Could not update privacy setting',
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
        <Shield size={16} style={{ color: 'rgba(15,95,92,0.85)' }} />
        <h3 className="text-base font-semibold text-[#1A1D1A]/85">Privacy &amp; PII Protection</h3>
      </div>
      <p className="text-xs text-[#6B6B64] mb-4">
        Owner-only. Controls whether regulated personal identifiers are tokenized before reaching Anthropic.
      </p>

      <div className="flex items-start justify-between gap-4 p-4 rounded-xl"
           style={{ background: '#EDE7D7', border: '1px solid #EDE7D7' }}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#1A1D1A] mb-1">Tokenize PII before sending to Anthropic</div>
          <p className="text-xs text-[#6B6B64] leading-relaxed">
            When ON, SSNs, payment cards, IBANs, emails, phone numbers, dates of birth, postcodes, and
            account numbers are replaced with opaque placeholders (<code style={{ color: 'rgba(15,95,92,0.85)' }}>[SSN_1]</code>,
            <code style={{ color: 'rgba(15,95,92,0.85)' }}> [EMAIL_1]</code>, …) before every outbound Claude call. A second-pass
            breach detector blocks any request that still contains unredacted PII. Disable only if you have a
            specific compliance reason — most tenants should leave this ON.
          </p>
          {!enabled && (
            <div className="mt-3 flex items-start gap-2 text-xs p-2 rounded-lg"
                 style={{ background: 'rgba(122,31,26,0.08)', border: '1px solid rgba(122,31,26,0.2)', color: '#FCA5A5' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Tokenization is OFF. Customer SSNs, cards, and other regulated identifiers will be sent to
                Anthropic in the clear. This change is recorded in your audit log.
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onToggle(!enabled)}
          className="flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label={enabled ? 'Disable PII tokenization' : 'Enable PII tokenization'}
          style={{ color: enabled ? '#2D6A4F' : '#6B6B64' }}
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


// ── Anonymous-only mode ──────────────────────────────────────────────────────
// Tenant-wide toggle that forces the widget into anonymous mode for every
// visitor, regardless of whether the host page identifies the user. When ON,
// no persistent customer records or cross-session memory are created. Intended
// for regulated verticals where data minimisation is a compliance requirement
// (or a sales differentiator). Owner-only — parallels PrivacySection above.

export default PrivacySection;
