/**
 * StepApiKey — Onboarding step for entering/validating an LLM API key.
 *
 * Pure BYOK on SaaS as of v3.3.27: every tenant paste their own Anthropic
 * key here (validated in real-time). The "Skip for now" affordance was
 * removed when the platform-key fallback was — there is no working chat
 * path that bypasses this step. Tenants flagged managed_ai_enabled
 * (internal master/enterprise opt-in only) skip this step automatically
 * via the alreadyValidated branch.
 */
import { useState } from "react";
import { Key, ExternalLink, CheckCircle, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { saveApiKey } from "@/lib/shenmayApi";
import { TOKENS as T, Kicker, Display, Lede, Field, Input, Button, Notice } from "@/components/shenmay/ui/ShenmayUI";

const StepApiKey = ({ onComplete, tenant }) => {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const alreadyValidated = tenant?.llm_api_key_validated || tenant?.managed_ai_enabled;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setResult(null);
    try {
      await saveApiKey(apiKey.trim(), "anthropic");
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
          Paste your Anthropic API key — it's encrypted with AES-256 and never logged.
        </Lede>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <Field id="apiKey" label="Anthropic API key" hint={
            <>Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: T.teal, textDecoration: "none", borderBottom: `1px solid ${T.teal}40`, display: "inline-flex", alignItems: "center", gap: 4 }}>console.anthropic.com <ExternalLink size={10} /></a></>
          }>
            <Input id="apiKey" type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setResult(null); }} placeholder="sk-ant-api03-…" autoComplete="off" style={{ fontFamily: T.mono, letterSpacing: "0.04em" }} />
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

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <p style={{ fontSize: 12, color: T.mute, margin: 0, lineHeight: 1.55 }}>
          Need a key? Get one at{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: T.teal, textDecoration: "none", borderBottom: `1px solid ${T.teal}40` }}>
            console.anthropic.com
          </a>
          {" "}— Anthropic gives new accounts free credits to start.
        </p>
      </div>
    </div>
  );
};

export default StepApiKey;
