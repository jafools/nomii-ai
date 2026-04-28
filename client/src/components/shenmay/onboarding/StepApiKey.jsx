/**
 * StepApiKey — Onboarding step for entering/validating an LLM API key.
 *
 * Pure BYOK on SaaS as of v3.3.27: every tenant pastes their own LLM key
 * here (validated in real-time). v3.4 adds a provider dropdown — Anthropic
 * Claude (recommended) or OpenAI. Choosing OpenAI shows a clear quality
 * warning since soul + memory generation also use the chosen provider.
 *
 * Tenants flagged managed_ai_enabled (internal master/enterprise opt-in
 * only) skip this step automatically via the alreadyValidated branch.
 */
import { useState } from "react";
import { Key, ExternalLink, CheckCircle, AlertCircle, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { saveApiKey } from "@/lib/shenmayApi";
import { TOKENS as T, Kicker, Display, Lede, Field, Input, Button, Notice } from "@/components/shenmay/ui/ShenmayUI";

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic Claude (recommended)", model: "Claude Sonnet 4", placeholder: "sk-ant-api03-…", consoleUrl: "https://console.anthropic.com/settings/keys", consoleLabel: "console.anthropic.com" },
  { value: "openai",    label: "OpenAI",                          model: "GPT-4o",         placeholder: "sk-…",            consoleUrl: "https://platform.openai.com/api-keys",      consoleLabel: "platform.openai.com" },
];
function providerInfo(p) { return PROVIDER_OPTIONS.find(o => o.value === p) || PROVIDER_OPTIONS[0]; }

const StepApiKey = ({ onComplete, tenant }) => {
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const alreadyValidated = tenant?.llm_api_key_validated || tenant?.managed_ai_enabled;
  const info = providerInfo(provider);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      await saveApiKey(apiKey.trim(), provider);
      setResult({ ok: true });
      setTimeout(() => onComplete?.(), 1200);
    } catch (err) {
      setResult({ ok: false, error: err.message || "Could not validate API key." });
    } finally { setSaving(false); }
  };

  const handleSkip = () => onComplete?.();

  if (alreadyValidated) {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EBF1E9", border: `1px solid #CDDCCA`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <CheckCircle size={28} color={T.success} />
        </div>
        <Kicker color={T.success}>API key configured</Kicker>
        <Display size={32} italic style={{ marginTop: 12 }}>You're connected.</Display>
        <Lede>
          {tenant?.llm_api_key_last4
            ? <>Your API key ending in <span style={{ fontFamily: T.mono, color: T.teal }}>…{tenant.llm_api_key_last4}</span> is active and validated.</>
            : <>Your AI provider is configured at the server level — no additional setup needed.</>}
        </Lede>
        <div style={{ marginTop: 28 }}>
          <Button variant="primary" size="lg" onClick={handleSkip} style={{ width: "100%" }}>Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${T.teal}15`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Key size={26} color={T.teal} />
        </div>
        <Kicker>Figure 04 · Connect AI</Kicker>
        <Display size={32} italic style={{ marginTop: 12 }}>Your agent needs a brain.</Display>
        <Lede style={{ maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
          Paste your LLM API key — it's encrypted with AES-256 and never logged.
        </Lede>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <Field id="provider" label="LLM provider" hint="Claude is the recommended provider for the best agent quality.">
            <select
              id="provider"
              value={provider}
              onChange={(e) => { setProvider(e.target.value); setResult(null); }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${T.paperEdge}`, fontSize: 14, background: "#FFFFFF", color: T.ink, fontFamily: T.sans }}
            >
              {PROVIDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>

          {provider === "openai" && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#FAEAE8", border: `1px solid #E5C5C2`, borderRadius: 6 }}>
              <AlertTriangle size={16} color="#7A1F1A" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12, color: "#1A1D1A", lineHeight: 1.55 }}>
                <strong>Claude is the recommended provider for Shenmay.</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "disc" }}>
                  <li>A less consistent agent persona over time</li>
                  <li>Weaker memory continuity across customer conversations</li>
                  <li>Subtly different tone in chat replies</li>
                </ul>
                <div style={{ marginTop: 6 }}>You can change providers anytime in Settings.</div>
              </div>
            </div>
          )}

          <Field id="apiKey" label={`${info.label.replace(" (recommended)", "")} API key`} hint={
            <>Get one at <a href={info.consoleUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.teal, textDecoration: "none", borderBottom: `1px solid ${T.teal}40`, display: "inline-flex", alignItems: "center", gap: 4 }}>{info.consoleLabel} <ExternalLink size={10} /></a></>
          }>
            <Input id="apiKey" type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setResult(null); }} placeholder={info.placeholder} autoComplete="off" style={{ fontFamily: T.mono, letterSpacing: "0.04em" }} />
          </Field>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: T.paperDeep, borderRadius: 6 }}>
            <ShieldCheck size={14} color={T.mute} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.55 }}>
              Your key is encrypted with AES-256 and never stored in plaintext. It's only used to power your agent's responses.
            </div>
          </div>
        </div>

        {result && (
          result.ok
            ? <Notice tone="success" icon={CheckCircle}>API key validated and saved!</Notice>
            : <Notice tone="danger" icon={AlertCircle}>{result.error}</Notice>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={!apiKey.trim() || saving}>
          {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Validating…</> : "Validate & save key"}
        </Button>
      </form>

      <details style={{ marginTop: 20, background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: "14px 18px" }}>
        <summary style={{ fontSize: 13, fontWeight: 600, color: T.teal, cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", transform: "rotate(0deg)", transition: "transform 0.15s" }}>▸</span>
          How do I get an API key?
        </summary>
        {provider === "anthropic" ? (
          <ol style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.65, marginTop: 14, marginBottom: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Sign up at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: T.teal }}>console.anthropic.com</a> and verify your email.</li>
            <li>Add a payment method under <strong>Settings → Billing</strong>, or use the free starter credits Anthropic gives new accounts.</li>
            <li>Go to <strong>Settings → API keys</strong> and click <strong>Create key</strong>. Name it "Shenmay" so it's easy to find later.</li>
            <li>Copy the key (starts with <span style={{ fontFamily: T.mono }}>sk-ant-…</span>) — Anthropic only shows it once.</li>
            <li>Paste it above and hit <strong>Validate &amp; save</strong>.</li>
          </ol>
        ) : (
          <ol style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.65, marginTop: 14, marginBottom: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>Sign in at <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" style={{ color: T.teal }}>platform.openai.com</a>.</li>
            <li>Add a payment method under <strong>Settings → Billing</strong> if you haven't already.</li>
            <li>Go to <strong>API keys → Create new secret key</strong>. Name it "Shenmay" so it's easy to find later.</li>
            <li>Copy the key (starts with <span style={{ fontFamily: T.mono }}>sk-…</span>) — OpenAI only shows it once.</li>
            <li>Paste it above and hit <strong>Validate &amp; save</strong>.</li>
          </ol>
        )}
        <p style={{ fontSize: 12, color: T.mute, lineHeight: 1.55, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.paperEdge}`, marginBottom: 0 }}>
          Costs scale with usage — see your provider's pricing page for current rates. You can change or remove your key anytime in <strong>Settings &rarr; AI API key</strong>.
        </p>
      </details>
    </div>
  );
};

export default StepApiKey;
