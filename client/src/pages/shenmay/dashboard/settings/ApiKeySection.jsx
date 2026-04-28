import { useState, useEffect } from "react";
import { Key, CheckCircle, AlertTriangle, Loader2, ShieldCheck, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { getMe, saveApiKey, deleteApiKey, testApiKey } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { card, inputClass, inputStyle } from "./_shared";

/**
 * ApiKeySection — view, rotate, test, or delete the tenant's BYOK LLM key.
 *
 * Three render modes based on /api/portal/me:
 *   1. managed_ai_enabled = true   → "Managed AI active" (no edit affordance)
 *   2. validated BYOK on tenant    → show last4 + provider + Test/Replace/Delete buttons
 *   3. no key                      → inline paste form + provider dropdown + walkthrough
 *
 * Self-hosted is offered the same form (BYOK is also valid there); a small
 * info note clarifies the env-var fallback is still accepted.
 *
 * v3.4 multi-LLM: provider dropdown above the paste field. Choosing OpenAI
 * shows an inline warning that agent quality may degrade vs Claude. The
 * first time a tenant switches their saved provider from Anthropic to
 * OpenAI, a confirmation modal fires so the choice is unmissable — soul +
 * memory generation also follow the chosen provider per the multi-LLM
 * scoping decision (pure BYOK preserved, no platform-key carve-outs).
 */

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic Claude (recommended)", short: "Claude",  placeholder: "sk-ant-api03-…", consoleUrl: "https://console.anthropic.com/settings/keys", consoleLabel: "console.anthropic.com" },
  { value: "openai",    label: "OpenAI",                          short: "GPT-4o", placeholder: "sk-…",            consoleUrl: "https://platform.openai.com/api-keys",      consoleLabel: "platform.openai.com" },
];
function providerInfo(p) { return PROVIDER_OPTIONS.find(o => o.value === p) || PROVIDER_OPTIONS[0]; }

const ApiKeySection = () => {
  const [loadingMe, setLoadingMe] = useState(true);
  const [last4, setLast4] = useState(null);
  const [savedProvider, setSavedProvider] = useState("anthropic"); // last validated/saved provider
  const [validated, setValidated] = useState(false);
  const [managed, setManaged] = useState(false);
  const [selfhosted, setSelfhosted] = useState(false);

  const [editing, setEditing] = useState(false);
  const [pickedProvider, setPickedProvider] = useState("anthropic"); // current dropdown selection
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, error }
  const [pendingSwitch, setPendingSwitch] = useState(null); // { from, to, key } when modal is showing

  const loadMe = () => {
    setLoadingMe(true);
    return getMe()
      .then((data) => {
        const t = data.tenant || {};
        setLast4(t.llm_api_key_last4 || null);
        setValidated(!!t.llm_api_key_validated);
        setManaged(!!data.subscription?.managed_ai_enabled);
        setSelfhosted(data.deployment_mode === "selfhosted");
        // Resolve "claude" → "anthropic" for display (legacy heritage value).
        const prov = (t.llm_api_key_provider || "anthropic").toLowerCase();
        const canonical = prov === "claude" ? "anthropic" : prov;
        setSavedProvider(canonical);
        setPickedProvider(canonical);
      })
      .catch(() => {})
      .finally(() => setLoadingMe(false));
  };

  useEffect(() => { loadMe(); }, []);

  const performSave = async (key, providerToSave) => {
    setSaving(true);
    setTestResult(null);
    try {
      await saveApiKey(key, providerToSave);
      toast({ title: "API key validated and saved" });
      setNewKey("");
      setEditing(false);
      setPendingSwitch(null);
      await loadMe();
    } catch (err) {
      toast({ title: "Could not save key", description: err.message || "Validation failed.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    const trimmed = newKey.trim();
    if (!trimmed) {
      toast({ title: "Paste your API key first", variant: "destructive" });
      return;
    }
    const isFirstSwitch = validated && savedProvider === "anthropic" && pickedProvider === "openai";
    if (isFirstSwitch) {
      // Hold the save until the customer confirms the provider switch.
      setPendingSwitch({ from: savedProvider, to: pickedProvider, key: trimmed });
      return;
    }
    await performSave(trimmed, pickedProvider);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testApiKey();
      if (res.valid) {
        setTestResult({ ok: true });
        toast({ title: "Connection OK" });
      } else {
        setTestResult({ ok: false, error: res.error || "Test call failed." });
        toast({ title: "Test failed", description: res.error || "Test call failed.", variant: "destructive" });
      }
      await loadMe();
    } catch (err) {
      setTestResult({ ok: false, error: err.message || "Test call failed." });
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove your saved API key? Your widget will stop responding to customers until you add another key.")) return;
    setDeleting(true);
    try {
      await deleteApiKey();
      toast({ title: "API key removed" });
      await loadMe();
    } catch (err) {
      toast({ title: "Could not remove key", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="rounded-2xl p-6 animate-pulse space-y-4" style={card}>
        <div className="h-4 w-32 rounded-lg" style={{ background: "#EDE7D7" }} />
        <div className="h-10 rounded-xl" style={{ background: "#EDE7D7" }} />
      </div>
    );
  }

  // Mode 1 — managed AI: no edit UI
  if (managed) {
    return (
      <div className="rounded-2xl p-6 space-y-3" style={card}>
        <h3 className="text-sm font-semibold text-[#3A3D39]">AI API key</h3>
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #CDDCCA" }}>
          <ShieldCheck size={18} color="#0F5F5C" style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="text-sm" style={{ color: "#1A1D1A", lineHeight: 1.55 }}>
            <strong>Managed AI is active for this account.</strong>
            <p className="text-[12px] mt-1" style={{ color: "#6B6B64" }}>
              Your AI access is provided by the platform. No key configuration is required on your side.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasKey = validated && last4;
  const savedInfo = providerInfo(savedProvider);
  const pickedInfo = providerInfo(pickedProvider);

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#3A3D39]">AI API key</h3>
        <span className="text-[11px]" style={{ color: "#6B6B64" }}>
          {savedInfo.value === "anthropic" ? "Anthropic · Claude" : "OpenAI · GPT-4o"}
        </span>
      </div>

      {/* Mode 2 — validated key, not editing */}
      {hasKey && !editing && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #CDDCCA" }}>
            <CheckCircle size={18} color="#2D6A4F" style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: "#1A1D1A" }}>
                {savedInfo.short} key <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "#0F5F5C" }}>…{last4}</span> active and validated
              </div>
              <p className="text-[12px] mt-1" style={{ color: "#6B6B64" }}>
                Encrypted with AES-256. Used to power every customer chat.
              </p>
              {testResult?.ok && (
                <p className="text-[12px] mt-2 flex items-center gap-1.5" style={{ color: "#2D6A4F" }}>
                  <CheckCircle size={12} /> Connection test OK
                </p>
              )}
              {testResult && !testResult.ok && (
                <p className="text-[12px] mt-2 flex items-center gap-1.5" style={{ color: "#7A1F1A" }}>
                  <AlertTriangle size={12} /> {testResult.error}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all hover:opacity-90 flex items-center gap-1.5"
              style={{ background: "#FFFFFF", color: "#1A1D1A", border: "1px solid #EDE7D7" }}
            >
              {testing ? <><Loader2 size={14} className="animate-spin" /> Testing…</> : <><RefreshCw size={14} /> Test connection</>}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(true); setPickedProvider(savedProvider); setTestResult(null); }}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{ background: "#FFFFFF", color: "#1A1D1A", border: "1px solid #EDE7D7" }}
            >
              Replace key
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all hover:opacity-90 flex items-center gap-1.5 ml-auto"
              style={{ background: "transparent", color: "#7A1F1A", border: "1px solid #E5C5C2" }}
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Mode 3 — no key, OR editing (replacing) */}
      {(!hasKey || editing) && (
        <form onSubmit={handleSave} className="space-y-4">
          {!hasKey && (
            <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "#FAEAE8", border: "1px solid #E5C5C2" }}>
              <AlertTriangle size={18} color="#7A1F1A" style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="text-sm" style={{ color: "#1A1D1A", lineHeight: 1.55 }}>
                <strong>No API key configured.</strong>
                <p className="text-[12px] mt-1" style={{ color: "#6B6B64" }}>
                  Your widget can't respond to customers until you add a validated LLM API key.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">
              LLM provider
            </label>
            <select
              value={pickedProvider}
              onChange={(e) => { setPickedProvider(e.target.value); setTestResult(null); }}
              className={inputClass}
              style={{ ...inputStyle }}
            >
              {PROVIDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>
              Claude is the recommended provider for the best agent quality.
            </p>
          </div>

          {pickedProvider === "openai" && (
            <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "#FAEAE8", border: "1px solid #E5C5C2" }}>
              <AlertTriangle size={18} color="#7A1F1A" style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="text-[12px]" style={{ color: "#1A1D1A", lineHeight: 1.55 }}>
                <strong>Claude is the recommended provider for Shenmay.</strong>
                <p className="mt-1">Choosing OpenAI may produce:</p>
                <ul className="list-disc pl-5 mt-1">
                  <li>A less consistent agent persona over time</li>
                  <li>Weaker memory continuity across customer conversations</li>
                  <li>Subtly different tone in chat replies</li>
                </ul>
                <p className="mt-1">You can change providers any time. We recommend trying Claude first.</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">
              {pickedInfo.label.replace(" (recommended)", "")} API key
            </label>
            <input
              type="password"
              value={newKey}
              onChange={(e) => { setNewKey(e.target.value); setTestResult(null); }}
              placeholder={pickedInfo.placeholder}
              autoComplete="off"
              className={inputClass}
              style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, monospace", letterSpacing: "0.04em" }}
            />
            <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>
              Get one at{" "}
              <a
                href={pickedInfo.consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#0F5F5C", textDecoration: "none", borderBottom: "1px solid #0F5F5C40", display: "inline-flex", alignItems: "center", gap: 3 }}
              >
                {pickedInfo.consoleLabel} <ExternalLink size={9} />
              </a>
              {" "}— encrypted with AES-256, validated on save, never logged.
            </p>
          </div>

          <details className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1px solid #EDE7D7" }}>
            <summary className="text-[12px] font-medium cursor-pointer" style={{ color: "#0F5F5C" }}>
              How do I get an API key?
            </summary>
            {pickedProvider === "anthropic" ? (
              <ol className="text-[12px] mt-3 space-y-1.5 list-decimal pl-5" style={{ color: "#3A3D39", lineHeight: 1.6 }}>
                <li>Sign up at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0F5F5C" }}>console.anthropic.com</a> and verify your email.</li>
                <li>Add a payment method under <strong>Settings → Billing</strong>, or use the free starter credits Anthropic gives new accounts.</li>
                <li>Go to <strong>Settings → API keys</strong> and click <strong>Create key</strong>. Name it "Shenmay" so it's easy to find later.</li>
                <li>Copy the key (starts with <code>sk-ant-…</code>) — Anthropic only shows it once.</li>
                <li>Paste it above and hit <strong>Validate &amp; save</strong>.</li>
              </ol>
            ) : (
              <ol className="text-[12px] mt-3 space-y-1.5 list-decimal pl-5" style={{ color: "#3A3D39", lineHeight: 1.6 }}>
                <li>Sign in at <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0F5F5C" }}>platform.openai.com</a>.</li>
                <li>Add a payment method under <strong>Settings → Billing</strong> if you haven't already.</li>
                <li>Go to <strong>API keys → Create new secret key</strong>. Name it "Shenmay" so it's easy to find later.</li>
                <li>Copy the key (starts with <code>sk-…</code>) — OpenAI only shows it once.</li>
                <li>Paste it above and hit <strong>Validate &amp; save</strong>.</li>
              </ol>
            )}
            <p className="text-[11px] mt-3 pt-3" style={{ color: "#6B6B64", borderTop: "1px solid #EDE7D7" }}>
              Costs scale with usage — see your provider's pricing page for current rates.
            </p>
          </details>

          {selfhosted && (
            <div className="text-[11px] rounded-xl p-3" style={{ background: "#FFFFFF", border: "1px solid #EDE7D7", color: "#6B6B64", lineHeight: 1.55 }}>
              <strong style={{ color: "#3A3D39" }}>Self-hosted note:</strong> if your operator set <code>ANTHROPIC_API_KEY</code> in the server's environment, that key is used as a fallback when no BYOK is configured here. Pasting a key in this section overrides the env-var fallback for this tenant.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !newKey.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90 flex items-center gap-2"
              style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Validating…</> : <><Key size={14} /> Validate & save key</>}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => { setEditing(false); setNewKey(""); setPickedProvider(savedProvider); setTestResult(null); }}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                style={{ background: "transparent", color: "#6B6B64", border: "1px solid #EDE7D7" }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {/* First-switch confirmation modal — fires once when going from a
          validated Anthropic key to an OpenAI key. Mirrors the multi-LLM
          scoping spec — the inline warning copy isn't enough by itself,
          this is the unmissable confirmation. */}
      {pendingSwitch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(26, 29, 26, 0.55)" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-2xl max-w-md w-full p-6 space-y-4" style={{ background: "#F5F1E8", border: "1px solid #EDE7D7" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={22} color="#7A1F1A" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h4 className="text-base font-semibold" style={{ color: "#1A1D1A" }}>Switch to OpenAI?</h4>
                <p className="text-[13px] mt-2" style={{ color: "#3A3D39", lineHeight: 1.55 }}>
                  Your agent's persona and memory may behave differently after this change. Existing soul + memory files stay where they are; new chats and memory updates will use OpenAI from the next message forward.
                </p>
                <p className="text-[12px] mt-2" style={{ color: "#6B6B64", lineHeight: 1.55 }}>
                  Claude is the recommended provider for Shenmay's agent-quality guarantees.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingSwitch(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                style={{ background: "transparent", color: "#6B6B64", border: "1px solid #EDE7D7" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => performSave(pendingSwitch.key, pendingSwitch.to)}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "#7A1F1A", color: "#F5F1E8" }}
              >
                {saving ? "Switching…" : "Switch to OpenAI"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeySection;
