import { useState } from "react";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { TYPE_STYLE, TYPE_EMOJI, slugify, findFirstMissingRequiredField } from "./_shared";
import { ModalShell, ErrorBanner, Spinner, ToolTypeBadge, ConfigFields } from "./_primitives";

export default function CreateToolModal({ toolTypes, onClose, onCreate }) {
  const [step, setStep]         = useState(1);
  const [selectedType, setType] = useState(null);
  const [displayName, setName]  = useState("");
  const [trigger, setTrigger]   = useState("");
  const [config, setConfig]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const typeInfo    = toolTypes?.find(t => t.type === selectedType);
  const machineName = slugify(displayName);

  async function handleSave() {
    if (!trigger.trim()) { setError("Please describe when your AI should use this tool."); return; }
    const missing = findFirstMissingRequiredField(typeInfo?.config_fields, config);
    if (missing) { setError(`Please fill in: ${missing.label}`); return; }
    setSaving(true); setError(null);
    try {
      await onCreate({ name: machineName, display_name: displayName.trim(),
        tool_type: selectedType, trigger_description: trigger.trim(), config });
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally { setSaving(false); }
  }

  // Step 1: Pick a tool type
  if (step === 1) return (
    <ModalShell onClose={onClose} title="What should your AI be able to do?"
      step={1} totalSteps={3}>
      <p className="text-sm mb-5" style={{ color: "#6B6B64" }}>
        Pick the type of action that matches your goal. You can add more tools later.
      </p>
      <div className="grid gap-3">
        {(toolTypes || []).map(tt => {
          const s = TYPE_STYLE[tt.type] || TYPE_STYLE.lookup;
          return (
            <button key={tt.type}
              onClick={() => { setType(tt.type); setStep(2); }}
              className="flex items-start gap-4 p-4 rounded-xl text-left transition-all duration-150"
              style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.background = s.bg; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#EDE7D7"; e.currentTarget.style.background = "#EDE7D7"; }}
            >
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                {tt.emoji || TYPE_EMOJI[tt.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold" style={{ color: "#1A1D1A" }}>
                    {tt.label}
                  </span>
                  <ChevronRight size={14} style={{ color: "#6B6B64" }} />
                </div>
                <p className="text-[12px]" style={{ color: "#6B6B64" }}>{tt.tagline}</p>
                {tt.explanation && (
                  <p className="text-[11px] mt-1.5 leading-relaxed"
                    style={{ color: "#6B6B64" }}>{tt.explanation}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );

  // Step 2: Name + trigger
  if (step === 2) return (
    <ModalShell onClose={onClose} title="Name your tool"
      back={() => setStep(1)} step={2} totalSteps={3}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Selected type chip */}
      <div className="flex items-center gap-2 mb-5 p-3 rounded-xl"
        style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <span className="text-base">{typeInfo?.emoji || TYPE_EMOJI[selectedType]}</span>
        <span className="text-sm font-medium" style={{ color: "#3A3D39" }}>
          {typeInfo?.label}
        </span>
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "#6B6B64" }}>Tool name</label>
        <input type="text" value={displayName} onChange={e => setName(e.target.value)}
          placeholder={`e.g. ${typeInfo?.label || "My Tool"}`}
          maxLength={80} autoFocus
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
          style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", color: "#1A1D1A" }}
          onFocus={e => e.target.style.borderColor = "rgba(15,95,92,0.5)"}
          onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
        <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>
          Give it a name your team will recognise — clear and descriptive.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "#6B6B64" }}>When should your AI use this?</label>
        <textarea value={trigger} onChange={e => setTrigger(e.target.value)}
          rows={4}
          placeholder={typeInfo?.example || "Describe in plain English when your AI should use this…"}
          maxLength={500}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none"
          style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", color: "#1A1D1A" }}
          onFocus={e => e.target.style.borderColor = "rgba(15,95,92,0.5)"}
          onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
        <p className="text-[11px] mt-1.5" style={{ color: "#6B6B64" }}>
          Write this like you're explaining it to a new team member. Your AI reads this to decide when to act.
        </p>
        {typeInfo?.example && (
          <div className="mt-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(15,95,92,0.06)", border: "1px solid rgba(15,95,92,0.12)" }}>
            <p className="text-[11px]" style={{ color: "rgba(15,95,92,0.65)" }}>
              <span className="font-semibold">Example: </span>{typeInfo.example}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          if (!displayName.trim()) { setError("Please give your tool a name."); return; }
          if (!trigger.trim())     { setError("Please describe when to use this tool."); return; }
          setError(null); setStep(3);
        }}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
        style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
      >
        Next: Final settings <ChevronRight size={14} className="inline ml-1" />
      </button>
    </ModalShell>
  );

  // Step 3: Config
  return (
    <ModalShell onClose={onClose} title="Final settings"
      back={() => setStep(2)} step={3} totalSteps={3}>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Summary recap */}
      <div className="mb-5 p-4 rounded-xl"
        style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <p className="text-[11px] mb-1" style={{ color: "#6B6B64" }}>Your tool so far</p>
        <div className="flex items-center gap-2 mb-1">
          <ToolTypeBadge type={selectedType} />
          <span className="text-sm font-medium" style={{ color: "#1A1D1A" }}>
            {displayName}
          </span>
        </div>
        <p className="text-[11px] line-clamp-2" style={{ color: "#6B6B64" }}>
          {trigger}
        </p>
      </div>

      <ConfigFields
        fields={typeInfo?.config_fields || []}
        config={config}
        onChange={(k, v) => setConfig(p => ({ ...p, [k]: v }))}
        toolType={selectedType}
      />

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}>
        {saving ? <><Spinner size={15} /> Saving…</> : <><CheckCircle2 size={15} /> Add this tool</>}
      </button>
    </ModalShell>
  );
}
