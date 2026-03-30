/**
 * StepApiKey — Onboarding step for entering/validating an LLM API key.
 *
 * Offers two paths:
 *   1. BYOK: paste your own Anthropic API key (validated in real-time)
 *   2. Managed AI: skip key entry, uses platform key (higher plan required)
 */

import { useState } from "react";
import { Key, ExternalLink, CheckCircle, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { saveApiKey } from "@/lib/nomiiApi";

const inp = "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

const StepApiKey = ({ onComplete, tenant }) => {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, error }
  const [useManaged, setUseManaged] = useState(false);

  const alreadyValidated = tenant?.llm_api_key_validated;

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
            style={{ background: "rgba(34,197,94,0.10)" }}>
            <CheckCircle size={28} style={{ color: "#4ADE80" }} />
          </div>
          <h2 className="text-xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>
            API Key Configured
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
            Your API key ending in <span className="font-mono" style={{ color: "#C9A84C" }}>
              ...{tenant.llm_api_key_last4}</span> is active and validated.
          </p>
        </div>
        <button onClick={handleSkip}
          className="w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
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
          style={{ background: "rgba(201,168,76,0.10)" }}>
          <Key size={28} style={{ color: "#C9A84C" }} />
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>
          Connect Your AI
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
          Your agent needs an AI provider to generate responses. Enter your own API key, or skip to use our managed service.
        </p>
      </div>

      {/* BYOK Form */}
      {!useManaged && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl p-5 space-y-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
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
              <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                Get your key from{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-0.5" style={{ color: "#C9A84C" }}>
                  console.anthropic.com <ExternalLink size={10} />
                </a>
              </p>
            </div>

            <div className="flex items-start gap-2 text-[11px] p-3 rounded-lg"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.30)" }} />
              <span style={{ color: "rgba(255,255,255,0.30)" }}>
                Your key is encrypted with AES-256 and never stored in plaintext. It's used only to power your agent's responses.
              </span>
            </div>
          </div>

          {/* Result feedback */}
          {result && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
              style={result.ok
                ? { background: "rgba(34,197,94,0.10)", color: "#4ADE80", border: "1px solid rgba(34,197,94,0.20)" }
                : { background: "rgba(239,68,68,0.10)", color: "#F87171", border: "1px solid rgba(239,68,68,0.20)" }
              }>
              {result.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {result.ok ? "API key validated and saved!" : result.error}
            </div>
          )}

          <button
            type="submit"
            disabled={!apiKey.trim() || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
          >
            {saving ? <><Loader2 size={16} className="animate-spin" /> Validating...</> : "Validate & Save Key"}
          </button>
        </form>
      )}

      {/* Managed AI option */}
      {!useManaged && (
        <div className="text-center">
          <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>
            Don't have an API key?
          </p>
          <button
            onClick={handleSkip}
            className="text-xs underline" style={{ color: "rgba(255,255,255,0.40)" }}
          >
            Skip for now — you can add one later in Settings
          </button>
        </div>
      )}
    </div>
  );
};

export default StepApiKey;
