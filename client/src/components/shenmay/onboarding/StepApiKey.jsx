/**
 * StepApiKey — Onboarding step for entering/validating an LLM API key.
 *
 * Offers two paths:
 *   1. BYOK: paste your own Anthropic API key (validated in real-time)
 *   2. Managed AI: skip key entry, uses platform key (higher plan required)
 */

import { useState } from "react";
import { Key, ExternalLink, CheckCircle, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { saveApiKey } from "@/lib/shenmayApi";

const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-[#6B6B64] focus:outline-none focus:ring-2 focus:ring-[#0F5F5C]/20 focus:border-[#0F5F5C]/50";
const inpStyle = { backgroundColor: "#EDE7D7", color: "#1A1D1A", borderColor: "#D8D0BD" };

const StepApiKey = ({ onComplete, tenant }) => {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, error }
  const [useManaged, setUseManaged] = useState(false);

  // Treat managed_ai_enabled as configured — self-hosted installs use the server's
  // ANTHROPIC_API_KEY env var rather than a per-tenant key.
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
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  if (alreadyValidated) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(45,106,79,0.10)" }}>
            <CheckCircle size={28} style={{ color: "#2D6A4F" }} />
          </div>
          <h2 className="text-xl font-bold mb-1" style={{ color: "#1A1D1A" }}>
            API Key Configured
          </h2>
          <p className="text-sm" style={{ color: "#6B6B64" }}>
            {tenant?.llm_api_key_last4
              ? <>Your API key ending in <span className="font-mono" style={{ color: "#0F5F5C" }}>...{tenant.llm_api_key_last4}</span> is active and validated.</>
              : <>Your AI provider is configured at the server level — no additional setup needed.</>
            }
          </p>
        </div>
        <button onClick={handleSkip}
          className="w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(15,95,92,0.10)" }}>
          <Key size={28} style={{ color: "#0F5F5C" }} />
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ color: "#1A1D1A" }}>
          Connect Your AI
        </h2>
        <p className="text-sm" style={{ color: "#6B6B64" }}>
          Your agent needs an AI provider to generate responses. Enter your own API key, or skip to use our managed service.
        </p>
      </div>

      {/* BYOK Form */}
      {!useManaged && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl p-5 space-y-4"
            style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#6B6B64" }}>
                Anthropic API Key
              </label>
              <input
                type="password"
                className={inp}
                style={inpStyle}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setResult(null); }}
                placeholder="sk-ant-api03-..."
                autoComplete="off"
              />
              <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>
                Get your key from{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-0.5" style={{ color: "#0F5F5C" }}>
                  console.anthropic.com <ExternalLink size={10} />
                </a>
              </p>
            </div>

            <div className="flex items-start gap-2 text-[11px] p-3 rounded-lg"
              style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
              <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: "#6B6B64" }} />
              <span style={{ color: "#6B6B64" }}>
                Your key is encrypted with AES-256 and never stored in plaintext. It's used only to power your agent's responses.
              </span>
            </div>
          </div>

          {/* Result feedback */}
          {result && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
              style={result.ok
                ? { background: "rgba(45,106,79,0.10)", color: "#2D6A4F", border: "1px solid rgba(45,106,79,0.20)" }
                : { background: "rgba(122,31,26,0.10)", color: "#7A1F1A", border: "1px solid rgba(122,31,26,0.20)" }
              }>
              {result.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {result.ok ? "API key validated and saved!" : result.error}
            </div>
          )}

          <button
            type="submit"
            disabled={!apiKey.trim() || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}
          >
            {saving ? <><Loader2 size={16} className="animate-spin" /> Validating...</> : "Validate & Save Key"}
          </button>
        </form>
      )}

      {/* Managed AI option */}
      {!useManaged && (
        <div className="text-center">
          <p className="text-xs mb-2" style={{ color: "#6B6B64" }}>
            Don't have an API key?
          </p>
          <button
            onClick={handleSkip}
            className="text-xs underline" style={{ color: "#6B6B64" }}
          >
            Skip for now — you can add one later in Settings
          </button>
        </div>
      )}
    </div>
  );
};

export default StepApiKey;
