import { useState, useEffect } from "react";
import { Key, CheckCircle, AlertTriangle, Loader2, ShieldCheck, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { getMe, saveApiKey, deleteApiKey, testApiKey } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { card, inputClass, inputStyle } from "./_shared";

/**
 * ApiKeySection — view, rotate, test, or delete the tenant's BYOK Anthropic key.
 *
 * Three render modes based on /api/portal/me:
 *   1. managed_ai_enabled = true   → "Managed AI active" (no edit affordance)
 *   2. validated BYOK on tenant    → show last4 + Test/Replace/Delete buttons
 *   3. no key                      → inline paste form + walkthrough
 *
 * Self-hosted is offered the same form (BYOK is also valid there); a small
 * info note clarifies the env-var fallback is still accepted.
 */
const ApiKeySection = () => {
  const [loadingMe, setLoadingMe] = useState(true);
  const [last4, setLast4] = useState(null);
  const [validated, setValidated] = useState(false);
  const [managed, setManaged] = useState(false);
  const [selfhosted, setSelfhosted] = useState(false);

  const [editing, setEditing] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, error }

  const loadMe = () => {
    setLoadingMe(true);
    return getMe()
      .then((data) => {
        const t = data.tenant || {};
        setLast4(t.llm_api_key_last4 || null);
        setValidated(!!t.llm_api_key_validated);
        setManaged(!!data.subscription?.managed_ai_enabled);
        setSelfhosted(data.deployment_mode === "selfhosted");
      })
      .catch(() => {})
      .finally(() => setLoadingMe(false));
  };

  useEffect(() => { loadMe(); }, []);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    const trimmed = newKey.trim();
    if (!trimmed) {
      toast({ title: "Paste your API key first", variant: "destructive" });
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      await saveApiKey(trimmed, "anthropic");
      toast({ title: "API key validated and saved" });
      setNewKey("");
      setEditing(false);
      await loadMe();
    } catch (err) {
      toast({ title: "Could not save key", description: err.message || "Validation failed.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#3A3D39]">AI API key</h3>
        <span className="text-[11px]" style={{ color: "#6B6B64" }}>Anthropic · Claude</span>
      </div>

      {/* Mode 2 — validated key, not editing */}
      {hasKey && !editing && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #CDDCCA" }}>
            <CheckCircle size={18} color="#2D6A4F" style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: "#1A1D1A" }}>
                API key <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "#0F5F5C" }}>…{last4}</span> active and validated
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
              onClick={() => { setEditing(true); setTestResult(null); }}
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
                  Your widget can't respond to customers until you add a validated Anthropic API key.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">
              Anthropic API key
            </label>
            <input
              type="password"
              value={newKey}
              onChange={(e) => { setNewKey(e.target.value); setTestResult(null); }}
              placeholder="sk-ant-api03-…"
              autoComplete="off"
              className={inputClass}
              style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, monospace", letterSpacing: "0.04em" }}
            />
            <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>
              Get one at{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#0F5F5C", textDecoration: "none", borderBottom: "1px solid #0F5F5C40", display: "inline-flex", alignItems: "center", gap: 3 }}
              >
                console.anthropic.com <ExternalLink size={9} />
              </a>
              {" "}— encrypted with AES-256, validated on save, never logged.
            </p>
          </div>

          <details className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1px solid #EDE7D7" }}>
            <summary className="text-[12px] font-medium cursor-pointer" style={{ color: "#0F5F5C" }}>
              How do I get an API key?
            </summary>
            <ol className="text-[12px] mt-3 space-y-1.5 list-decimal pl-5" style={{ color: "#3A3D39", lineHeight: 1.6 }}>
              <li>Sign up at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0F5F5C" }}>console.anthropic.com</a> and verify your email.</li>
              <li>Add a payment method under <strong>Settings → Billing</strong>, or use the free starter credits Anthropic gives new accounts.</li>
              <li>Go to <strong>Settings → API keys</strong> and click <strong>Create key</strong>. Name it "Shenmay" so it's easy to find later.</li>
              <li>Copy the key (starts with <code>sk-ant-…</code>) — Anthropic only shows it once.</li>
              <li>Paste it above and hit <strong>Validate &amp; save</strong>.</li>
            </ol>
            <p className="text-[11px] mt-3 pt-3" style={{ color: "#6B6B64", borderTop: "1px solid #EDE7D7" }}>
              Costs scale with usage. Most small-business chats run roughly $0.003–$0.01 per customer message on Claude Sonnet. Anthropic's pricing page has the current rates.
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
                onClick={() => { setEditing(false); setNewKey(""); setTestResult(null); }}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                style={{ background: "transparent", color: "#6B6B64", border: "1px solid #EDE7D7" }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

export default ApiKeySection;
