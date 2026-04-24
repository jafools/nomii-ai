import { useState } from "react";
import { TYPE_EMOJI } from "./_shared";
import { ModalShell, ErrorBanner, Spinner, ToolTypeBadge, ConfigFields } from "./_primitives";

export default function EditToolModal({ tool, toolTypes, onClose, onSave }) {
  const [displayName, setName] = useState(tool.display_name);
  const [trigger, setTrigger]  = useState(tool.trigger_description);
  const [config, setConfig]    = useState(tool.config || {});
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState(null);

  const typeInfo = toolTypes?.find(t => t.type === tool.tool_type);

  async function handleSave() {
    if (!trigger.trim()) { setError("Please describe when to use this tool."); return; }
    setSaving(true); setError(null);
    try {
      await onSave(tool.id, { display_name: displayName.trim(),
        trigger_description: trigger.trim(), config });
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally { setSaving(false); }
  }

  return (
    <ModalShell onClose={onClose} title={`Edit "${tool.display_name}"`}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="flex items-center gap-2 mb-5 p-3 rounded-xl"
        style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <span className="text-base">{TYPE_EMOJI[tool.tool_type]}</span>
        <ToolTypeBadge type={tool.tool_type} />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "#6B6B64" }}>Tool name</label>
        <input type="text" value={displayName} onChange={e => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", color: "#1A1D1A" }}
          onFocus={e => e.target.style.borderColor = "rgba(15,95,92,0.5)"}
          onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "#6B6B64" }}>When should your AI use this?</label>
        <textarea value={trigger} onChange={e => setTrigger(e.target.value)} rows={3}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
          style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", color: "#1A1D1A" }}
          onFocus={e => e.target.style.borderColor = "rgba(15,95,92,0.5)"}
          onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
        {typeInfo?.example && (
          <div className="mt-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(15,95,92,0.06)", border: "1px solid rgba(15,95,92,0.12)" }}>
            <p className="text-[11px]" style={{ color: "rgba(15,95,92,0.65)" }}>
              <span className="font-semibold">Example: </span>{typeInfo.example}
            </p>
          </div>
        )}
      </div>

      <ConfigFields
        fields={typeInfo?.config_fields || []}
        config={config}
        onChange={(k, v) => setConfig(p => ({ ...p, [k]: v }))}
        toolType={tool.tool_type}
      />

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}>
        {saving ? <><Spinner size={15} /> Saving…</> : "Save changes"}
      </button>
    </ModalShell>
  );
}
