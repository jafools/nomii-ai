/**
 * NomiiTools — AI Tool Builder
 *
 * Lets non-technical users create, understand, and manage AI tools
 * without writing any code. Every piece of copy is in plain English.
 *
 * Features:
 *  - 3-step creation wizard with progress dots
 *  - Per-type plain-English explanation in wizard step 1
 *  - Example trigger shown as a contextual hint in step 2
 *  - Enable / disable toggle per tool (non-destructive)
 *  - Test connection button for connect-type tools
 *  - Toast notifications on every mutation
 *  - Paused tools shown in a collapsible section
 */

import { useState, useEffect } from "react";
import { getTools, getToolTypes, createTool, updateTool, deleteTool, testTool, getCustomers } from "@/lib/nomiiApi";
import { toast } from "@/hooks/use-toast";
import {
  Search, Calculator, FileText, Users, Plus, Pencil, Trash2,
  X, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Loader2,
  Zap, HelpCircle, Play, ToggleLeft, ToggleRight, ChevronDown,
  FlaskConical, TriangleAlert, ChevronUp,
} from "lucide-react";

// ── Colour + icon map ─────────────────────────────────────────────────────────
const TYPE_STYLE = {
  lookup:    { color: "#3B82F6", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.22)",  icon: Search      },
  calculate: { color: "#10B981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.22)",  icon: Calculator  },
  report:    { color: "#C9A84C", bg: "rgba(201,168,76,0.10)",  border: "rgba(201,168,76,0.22)",  icon: FileText    },
  escalate:  { color: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.22)", icon: Users       },
  connect:   { color: "#A78BFA", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.22)", icon: Zap         },
};
const TYPE_EMOJI = { lookup: "🔍", calculate: "📊", report: "📄", escalate: "🙋", connect: "🔗" };

// ── Utilities ─────────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 _]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 64) || "my_tool";
}

// ── Shared small components ───────────────────────────────────────────────────

function ToolTypeBadge({ type }) {
  const s    = TYPE_STYLE[type] || TYPE_STYLE.lookup;
  const Icon = s.icon;
  const labels = { lookup: "Look Up Data", calculate: "Calculate", report: "Generate Report",
                   escalate: "Get a Human", connect: "Connect System" };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <Icon size={10} />{labels[type] || type}
    </span>
  );
}

function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: "#C9A84C" }} />;
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl mb-4"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}>
      <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#F87171" }} />
      <p className="text-sm flex-1" style={{ color: "#F87171" }}>{message}</p>
      {onDismiss && <button onClick={onDismiss}><X size={14} style={{ color: "#F87171" }} /></button>}
    </div>
  );
}

// Step progress pill dots
function StepDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-5">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="rounded-full transition-all duration-200" style={{
          width:  i + 1 === current ? 20 : 8,
          height: 8,
          background: i + 1 === current ? "#C9A84C"
            : i + 1 < current ? "rgba(201,168,76,0.40)"
            : "rgba(255,255,255,0.12)",
        }} />
      ))}
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function ModalShell({ children, title, onClose, back, step, totalSteps }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: "#0F1A2E", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between p-5 pb-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            {back && (
              <button onClick={back} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <ChevronLeft size={16} style={{ color: "rgba(255,255,255,0.40)" }} />
              </button>
            )}
            <h2 className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.90)" }}>
              {title}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X size={16} style={{ color: "rgba(255,255,255,0.40)" }} />
          </button>
        </div>
        <div className="p-5">
          {step && totalSteps && <StepDots current={step} total={totalSteps} />}
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Config fields (shared between Create and Edit) ────────────────────────────
function ConfigFields({ fields, config, onChange, toolType }) {
  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.90)" };
  const labelClass = "block text-[11px] font-semibold uppercase tracking-wider mb-1.5";
  const inputClass = "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all";
  const authType   = config.auth_type || "none";

  return (
    <div>
      {fields.map(field => (
        <div className="mb-4" key={field.key}>
          <label className={labelClass} style={{ color: "rgba(255,255,255,0.40)" }}>
            {field.label}{field.required && <span style={{ color: "#F87171" }}> *</span>}
          </label>
          {field.type === "select" ? (
            <select value={config[field.key] ?? field.default ?? ""}
              onChange={e => onChange(field.key, e.target.value)}
              className={inputClass} style={{ ...inputStyle, colorScheme: "dark" }}>
              {(field.options || []).map(opt => (
                <option key={opt.value || opt} value={opt.value || opt} style={{ background: "#0F1A2E" }}>
                  {opt.label || opt}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value={config[field.key] ?? ""}
              onChange={e => onChange(field.key, e.target.value)}
              placeholder={field.placeholder} className={inputClass} style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
              onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
          )}
        </div>
      ))}

      {/* Connect-type: conditional auth credential fields */}
      {toolType === "connect" && authType !== "none" && (
        <div className="mb-4 rounded-xl p-4 space-y-4"
          style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "rgba(167,139,250,0.70)" }}>Authentication credentials</p>
          <div>
            <label className={labelClass} style={{ color: "rgba(255,255,255,0.40)" }}>
              {authType === "bearer" ? "Bearer token" : "API key value"}
              <span style={{ color: "#F87171" }}> *</span>
            </label>
            <input type="password" value={config.auth_token ?? ""}
              onChange={e => onChange("auth_token", e.target.value)}
              placeholder={authType === "bearer" ? "eyJhbGciO..." : "your-api-key-here"}
              className={inputClass} style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
              onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
            <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
              Stored securely. Not visible to your team after saving.
            </p>
          </div>
          {authType === "api_key" && (
            <div>
              <label className={labelClass} style={{ color: "rgba(255,255,255,0.40)" }}>
                Header name <span style={{ color: "#F87171" }}>*</span>
              </label>
              <input type="text" value={config.auth_header_name ?? ""}
                onChange={e => onChange("auth_header_name", e.target.value)}
                placeholder="e.g. X-Api-Key" className={inputClass} style={inputStyle}
                onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
                onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
            </div>
          )}
        </div>
      )}

      {fields.length === 0 && toolType !== "connect" && (
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.40)" }}>
          This tool type needs no extra settings — you're all set!
        </p>
      )}
    </div>
  );
}

// ── CREATE WIZARD ─────────────────────────────────────────────────────────────
function CreateToolModal({ toolTypes, onClose, onCreate }) {
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
      <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.42)" }}>
        Pick the type of action that matches your goal. You can add more tools later.
      </p>
      <div className="grid gap-3">
        {(toolTypes || []).map(tt => {
          const s = TYPE_STYLE[tt.type] || TYPE_STYLE.lookup;
          return (
            <button key={tt.type}
              onClick={() => { setType(tt.type); setStep(2); }}
              className="flex items-start gap-4 p-4 rounded-xl text-left transition-all duration-150"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = s.border; e.currentTarget.style.background = s.bg; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            >
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                {tt.emoji || TYPE_EMOJI[tt.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.90)" }}>
                    {tt.label}
                  </span>
                  <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.25)" }} />
                </div>
                <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.50)" }}>{tt.tagline}</p>
                {tt.explanation && (
                  <p className="text-[11px] mt-1.5 leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.28)" }}>{tt.explanation}</p>
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
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-base">{typeInfo?.emoji || TYPE_EMOJI[selectedType]}</span>
        <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.70)" }}>
          {typeInfo?.label}
        </span>
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "rgba(255,255,255,0.40)" }}>Tool name</label>
        <input type="text" value={displayName} onChange={e => setName(e.target.value)}
          placeholder={`e.g. ${typeInfo?.label || "My Tool"}`}
          maxLength={80} autoFocus
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.90)" }}
          onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
          onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
        <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
          Give it a name your team will recognise — clear and descriptive.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "rgba(255,255,255,0.40)" }}>When should your AI use this?</label>
        <textarea value={trigger} onChange={e => setTrigger(e.target.value)}
          rows={4}
          placeholder={typeInfo?.example || "Describe in plain English when your AI should use this…"}
          maxLength={500}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.90)" }}
          onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
          onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
        <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
          Write this like you're explaining it to a new team member. Your AI reads this to decide when to act.
        </p>
        {typeInfo?.example && (
          <div className="mt-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.12)" }}>
            <p className="text-[11px]" style={{ color: "rgba(201,168,76,0.65)" }}>
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
        style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
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
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-[11px] mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Your tool so far</p>
        <div className="flex items-center gap-2 mb-1">
          <ToolTypeBadge type={selectedType} />
          <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>
            {displayName}
          </span>
        </div>
        <p className="text-[11px] line-clamp-2" style={{ color: "rgba(255,255,255,0.35)" }}>
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
        style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
        {saving ? <><Spinner size={15} /> Saving…</> : <><CheckCircle2 size={15} /> Add this tool</>}
      </button>
    </ModalShell>
  );
}

// ── EDIT MODAL ────────────────────────────────────────────────────────────────
function EditToolModal({ tool, toolTypes, onClose, onSave }) {
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
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-base">{TYPE_EMOJI[tool.tool_type]}</span>
        <ToolTypeBadge type={tool.tool_type} />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "rgba(255,255,255,0.40)" }}>Tool name</label>
        <input type="text" value={displayName} onChange={e => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.90)" }}
          onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
          onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: "rgba(255,255,255,0.40)" }}>When should your AI use this?</label>
        <textarea value={trigger} onChange={e => setTrigger(e.target.value)} rows={3}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.90)" }}
          onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.5)"}
          onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.10)"} />
        {typeInfo?.example && (
          <div className="mt-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.12)" }}>
            <p className="text-[11px]" style={{ color: "rgba(201,168,76,0.65)" }}>
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
        style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
        {saving ? <><Spinner size={15} /> Saving…</> : "Save changes"}
      </button>
    </ModalShell>
  );
}

// ── DELETE CONFIRM ────────────────────────────────────────────────────────────
function ConfirmDelete({ tool, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{ background: "#0F1A2E", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)" }}>
          <Trash2 size={22} style={{ color: "#F87171" }} />
        </div>
        <h3 className="text-base font-semibold mb-2" style={{ color: "rgba(255,255,255,0.90)" }}>
          Remove "{tool.display_name}"?
        </h3>
        <p className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.40)" }}>
          Your AI will stop using this tool. Your existing data is unaffected.
        </p>
        <p className="text-[12px] mb-6" style={{ color: "rgba(255,255,255,0.28)" }}>
          Tip: you can also just pause the tool temporarily using the toggle.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-white/[0.04]"
            style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)" }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "rgba(239,68,68,0.15)", color: "#F87171", border: "1px solid rgba(239,68,68,0.25)" }}>
            {deleting ? <Spinner size={14} /> : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TOOL CARD ─────────────────────────────────────────────────────────────────
// ── Tool Test Modal (Sandbox + Real Customer) ─────────────────────────────────
function TestModal({ tool, onClose }) {
  const s = TYPE_STYLE[tool.tool_type] || TYPE_STYLE.lookup;

  // Mode: 'sandbox' | 'real'
  const [mode, setMode]               = useState("sandbox");
  const [message, setMessage]         = useState("");
  const [running, setRunning]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);
  const [showJson, setShowJson]       = useState(false);

  // Customer picker state
  const [customerSearch, setCSearch]  = useState("");
  const [customers, setCustomers]     = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [selectedCust, setSelCust]    = useState(null);
  const [showDropdown, setShowDrop]   = useState(false);

  // Fetch customers when switching to real mode or typing in search
  useEffect(() => {
    if (mode !== "real") return;
    setCustLoading(true);
    getCustomers(1, 40, customerSearch)
      .then(d => setCustomers(d.customers || []))
      .catch(() => setCustomers([]))
      .finally(() => setCustLoading(false));
  }, [mode, customerSearch]);

  // Reset everything when mode changes
  function switchMode(m) {
    setMode(m);
    setResult(null);
    setError(null);
    setSelCust(null);
    setCSearch("");
    setShowDrop(false);
  }

  async function handleRun() {
    if (!message.trim()) return;
    if (mode === "real" && !selectedCust) return;
    setRunning(true); setResult(null); setError(null);
    try {
      const data = await testTool(
        tool.id,
        message.trim(),
        mode === "real" ? selectedCust?.id : undefined,
      );
      setResult(data);
    } catch (err) {
      setError(err.message || "Test failed — check your API key in Settings.");
    } finally {
      setRunning(false);
    }
  }

  const canRun = message.trim() && (mode === "sandbox" || selectedCust);

  // Warning copy — context-aware
  const warnText = (() => {
    const base = "This makes a real API call using your configured key and counts toward your monthly message quota.";
    if (tool.tool_type === "escalate") {
      return base + " Escalation is always simulated — no flag or email will be created.";
    }
    if (mode === "sandbox") {
      if (tool.tool_type === "report") return base + " No report record will be written in sandbox mode.";
      return base + " No real customer data is used.";
    }
    // real mode
    if (tool.tool_type === "report") {
      return base + ` A lightweight report log will be written to ${selectedCust ? selectedCust.first_name + "'s" : "the customer's"} record.`;
    }
    return base + ` Running against ${selectedCust ? `${selectedCust.first_name} ${selectedCust.last_name}'s` : "the selected customer's"} actual data.`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#0F1A2E", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center text-base" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              {TYPE_EMOJI[tool.tool_type]}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Test: {tool.display_name}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                {mode === "sandbox" ? "Sandbox — no real customer data" : selectedCust ? `Testing with ${selectedCust.first_name} ${selectedCust.last_name}` : "Real customer mode"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            <X size={16} style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[78vh] overflow-y-auto">

          {/* Mode toggle */}
          <div className="flex rounded-xl p-1 gap-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {[
              { id: "sandbox", label: "🧪 Sandbox",       sub: "No real data" },
              { id: "real",    label: "👤 Real customer", sub: "Uses live records" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => switchMode(m.id)}
                className="flex-1 flex flex-col items-center py-2 px-3 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: mode === m.id ? (m.id === "real" ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.07)") : "transparent",
                  color: mode === m.id ? (m.id === "real" ? "#C9A84C" : "rgba(255,255,255,0.85)") : "rgba(255,255,255,0.35)",
                  border: mode === m.id ? `1px solid ${m.id === "real" ? "rgba(201,168,76,0.30)" : "rgba(255,255,255,0.12)"}` : "1px solid transparent",
                }}
              >
                <span>{m.label}</span>
                <span className="text-[9px] font-normal mt-0.5 opacity-60">{m.sub}</span>
              </button>
            ))}
          </div>

          {/* Real customer picker */}
          {mode === "real" && (
            <div className="relative">
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Select test customer
              </label>
              {selectedCust ? (
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#C9A84C" }}>
                      {selectedCust.first_name} {selectedCust.last_name}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>{selectedCust.email}</p>
                  </div>
                  <button onClick={() => { setSelCust(null); setCSearch(""); setShowDrop(true); }}
                    className="p-1 rounded-lg hover:bg-white/[0.06]">
                    <X size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={e => { setCSearch(e.target.value); setShowDrop(true); }}
                    placeholder="Search by name or email…"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)" }}
                    onFocus={e => { e.target.style.borderColor = "rgba(201,168,76,0.5)"; setShowDrop(true); }}
                    onBlur={e => setTimeout(() => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; setShowDrop(false); }, 150)}
                  />
                  {showDropdown && (
                    <div className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-xl" style={{ background: "#0F1A2E", border: "1px solid rgba(255,255,255,0.12)", maxHeight: 200, overflowY: "auto" }}>
                      {custLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 size={16} className="animate-spin" style={{ color: "#C9A84C" }} />
                        </div>
                      ) : customers.length === 0 ? (
                        <p className="text-center py-5 text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>No customers found</p>
                      ) : (
                        customers.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={() => { setSelCust(c); setCSearch(""); setShowDrop(false); }}
                            className="w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04]"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                          >
                            <p className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>
                              {c.first_name} {c.last_name}
                            </p>
                            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>{c.email}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
              <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                Tip: use an employee's own profile so you can verify the results safely.
              </p>
            </div>
          )}

          {/* Warning banner */}
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <TriangleAlert size={13} className="shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(245,158,11,0.9)" }}>{warnText}</p>
          </div>

          {/* Trigger hint */}
          <div className="text-[11px] px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ color: "rgba(255,255,255,0.30)" }}>Triggers when: </span>
            <span style={{ color: "rgba(255,255,255,0.60)" }}>{tool.trigger_description}</span>
          </div>

          {/* Message input */}
          <div>
            <label className="block text-[11px] font-semibold mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
              Sample customer message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) handleRun(); }}
              placeholder="Type a message a customer might send to trigger this tool…"
              rows={3}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", lineHeight: "1.5" }}
              onFocus={e => e.target.style.borderColor = s.color + "66"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
            />
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>⌘ + Enter to run</p>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running || !canRun}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: (running || !canRun) ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${s.color} 0%, ${s.color}cc 100%)`, color: (running || !canRun) ? "rgba(255,255,255,0.4)" : "#fff" }}
          >
            {running
              ? <><Loader2 size={15} className="animate-spin" /> Running…</>
              : mode === "real" && !selectedCust
                ? <><FlaskConical size={15} /> Select a customer to run</>
                : <><FlaskConical size={15} /> Run {mode === "real" ? "Real" : "Sandbox"} Test</>}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}>
              <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: "#F87171" }} />
              <p className="text-[12px]" style={{ color: "#F87171" }}>{error}</p>
            </div>
          )}

          {/* Result panel */}
          {result && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${result.invoked ? s.border : "rgba(255,255,255,0.08)"}` }}>
              {/* Status row */}
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: result.invoked ? s.bg : "rgba(255,255,255,0.03)" }}>
                {result.invoked
                  ? <CheckCircle2 size={14} style={{ color: s.color }} />
                  : <AlertCircle  size={14} style={{ color: "rgba(255,255,255,0.35)" }} />}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-semibold" style={{ color: result.invoked ? s.color : "rgba(255,255,255,0.50)" }}>
                    {result.invoked
                      ? `✓ Tool triggered${result.simulated ? " (simulated)" : ""}`
                      : "Tool was not triggered by this message"}
                  </span>
                  {result.test_customer && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
                      {result.test_customer.name}
                    </span>
                  )}
                </div>
              </div>

              {/* AI response */}
              {result.ai_response && (
                <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Agent response</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.70)" }}>{result.ai_response}</p>
                </div>
              )}

              {/* Tool I/O (collapsible) */}
              {result.invoked && (result.tool_input || result.tool_result) && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <button
                    onClick={() => setShowJson(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-white/[0.03]"
                    style={{ color: "rgba(255,255,255,0.30)" }}
                  >
                    Tool input / output
                    {showJson ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showJson && (
                    <div className="px-4 pb-4 space-y-3">
                      {result.tool_input && (
                        <div>
                          <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.25)" }}>Parameters Claude passed</p>
                          <pre className="text-[11px] font-mono p-2.5 rounded-lg overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.45)" }}>
                            {JSON.stringify(result.tool_input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {result.tool_result && (
                        <div>
                          <p className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.25)" }}>Tool returned</p>
                          <pre className="text-[11px] font-mono p-2.5 rounded-lg overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.45)" }}>
                            {JSON.stringify(result.tool_result, null, 2).slice(0, 600)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function ToolCard({ tool, onEdit, onDelete, onToggle, toggling }) {
  const s        = TYPE_STYLE[tool.tool_type] || TYPE_STYLE.lookup;
  const isActive = tool.is_active !== false;
  const [showTestModal, setShowTestModal] = useState(false);

  return (
    <div className="rounded-xl p-5 transition-all duration-200"
      style={{
        background: isActive ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
        border: `1px solid ${isActive ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)"}`,
        opacity: isActive ? 1 : 0.65,
      }}
      onMouseEnter={e => isActive && (e.currentTarget.style.borderColor = s.border)}
      onMouseLeave={e => e.currentTarget.style.borderColor = isActive ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)"}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            {TYPE_EMOJI[tool.tool_type]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.90)" }}>
                {tool.display_name}
              </span>
              <ToolTypeBadge type={tool.tool_type} />
              {!isActive && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}>
                  PAUSED
                </span>
              )}
            </div>
            <p className="text-[12px] leading-relaxed line-clamp-2"
              style={{ color: "rgba(255,255,255,0.40)" }}>
              {tool.trigger_description}
            </p>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Test button — all active tools */}
          {isActive && (
            <button onClick={() => setShowTestModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
              title="Test this tool in the sandbox">
              <FlaskConical size={11} />
              Test
            </button>
          )}
          {/* Enable / disable toggle */}
          <button onClick={() => onToggle(tool)} disabled={toggling === tool.id}
            className="p-2 rounded-lg transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            title={isActive ? "Pause this tool" : "Resume this tool"}>
            {toggling === tool.id
              ? <Loader2 size={16} className="animate-spin" style={{ color: "rgba(255,255,255,0.35)" }} />
              : isActive
                ? <ToggleRight size={18} style={{ color: "#10B981" }} />
                : <ToggleLeft  size={18} style={{ color: "rgba(255,255,255,0.30)" }} />}
          </button>
          {/* Edit */}
          <button onClick={() => onEdit(tool)}
            className="p-2 rounded-lg transition-colors hover:bg-white/[0.06]" title="Edit">
            <Pencil size={14} style={{ color: "rgba(255,255,255,0.35)" }} />
          </button>
          {/* Delete */}
          <button onClick={() => onDelete(tool)}
            className="p-2 rounded-lg transition-colors hover:bg-red-500/10" title="Remove">
            <Trash2 size={14} style={{ color: "rgba(248,113,113,0.45)" }} />
          </button>
        </div>
      </div>

      {showTestModal && <TestModal tool={tool} onClose={() => setShowTestModal(false)} />}
    </div>
  );
}

// ── EMPTY STATE ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5 text-3xl"
        style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.15)" }}>
        🔧
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: "rgba(255,255,255,0.90)" }}>
        Your AI has no tools yet
      </h3>
      <p className="text-sm max-w-xs mb-2" style={{ color: "rgba(255,255,255,0.40)" }}>
        Tools let your AI do more than just chat — look up real client data, run
        calculations, write reports, and know when to involve your team.
      </p>
      <p className="text-sm max-w-xs mb-8" style={{ color: "rgba(255,255,255,0.28)" }}>
        No coding required. Describe what you want in plain English and you're done.
      </p>
      <button onClick={onAdd}
        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-[#C9A84C]/15"
        style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
        <Plus size={16} /> Add your first tool
      </button>
    </div>
  );
}

// ── EXPLAINER ACCORDION ───────────────────────────────────────────────────────
function WhatAreTools() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 rounded-xl overflow-hidden"
      style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-2.5">
          <HelpCircle size={15} style={{ color: "#C9A84C" }} />
          <span className="text-sm font-medium" style={{ color: "#C9A84C" }}>
            What are tools, and do I need them?
          </span>
        </div>
        <ChevronDown size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "rgba(201,168,76,0.60)" }} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          <div className="space-y-3 text-sm" style={{ color: "rgba(255,255,255,0.48)" }}>
            <p>By default your AI can chat — but it's working from memory alone.
               Tools give it the ability to take real actions in real time.</p>
            <p>Think of it this way: without tools your AI is a helpful colleague who can
               answer general questions. With tools it can open your actual records, run
               numbers, and flag anything that needs a real person — instantly.</p>
            <p>You don't need to be technical. Pick what you want, describe when to do it
               in plain English, and you're done. Your AI reads your description to decide
               when to act.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function NomiiTools() {
  const [tools, setTools]               = useState([]);
  const [toolTypes, setToolTypes]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [toggling, setToggling]         = useState(null); // id of tool being toggled
  const [showPaused, setShowPaused]     = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [toolsRes, typesRes] = await Promise.all([getTools(), getToolTypes()]);
      setTools(toolsRes.tools || []);
      setToolTypes(typesRes.tool_types || []);
    } catch {
      setError("Couldn't load your tools. Please refresh the page.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data) {
    const res = await createTool(data);
    setTools(prev => [...prev, res.tool]);
    toast({ title: "Tool added", description: `"${res.tool.display_name}" is now active.` });
  }

  async function handleUpdate(id, data) {
    const res = await updateTool(id, data);
    setTools(prev => prev.map(t => t.id === id ? res.tool : t));
    toast({ title: "Changes saved" });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTool(deleteTarget.id);
      const name = deleteTarget.display_name;
      setTools(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "Tool removed", description: `"${name}" has been removed.` });
    } catch {
      toast({ title: "Couldn't remove tool", variant: "destructive" });
    } finally { setDeleting(false); }
  }

  async function handleToggle(tool) {
    const newState = tool.is_active === false ? true : false;
    setToggling(tool.id);
    try {
      const res = await updateTool(tool.id, { is_active: newState });
      setTools(prev => prev.map(t => t.id === tool.id ? res.tool : t));
      toast({
        title: newState ? "Tool resumed" : "Tool paused",
        description: `"${tool.display_name}" is now ${newState ? "active" : "paused"}.`,
      });
    } catch {
      toast({ title: "Couldn't update tool", variant: "destructive" });
    } finally { setToggling(null); }
  }

  const activeTools = tools.filter(t => t.is_active !== false);
  const pausedTools = tools.filter(t => t.is_active === false);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>
            AI Tools
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
            Give your AI agent real abilities — beyond just chatting.
            {activeTools.length > 0 && (
              <span style={{ color: "rgba(255,255,255,0.25)" }}>
                {" "}· {activeTools.length} active
              </span>
            )}
          </p>
        </div>
        {tools.length > 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 transition-all hover:shadow-lg hover:shadow-[#C9A84C]/15"
            style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
          >
            <Plus size={14} /> New Tool
          </button>
        )}
      </div>

      <WhatAreTools />

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Spinner />
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
            Loading your tools…
          </span>
        </div>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : tools.length === 0 ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : (
        <>
          {/* Active tools */}
          {activeTools.length === 0 && (
            <p className="text-sm mb-4 text-center py-8"
              style={{ color: "rgba(255,255,255,0.35)" }}>
              All tools are currently paused. Resume a tool to let your AI use it again.
            </p>
          )}
          <div className="space-y-3">
            {activeTools.map(tool => (
              <ToolCard key={tool.id} tool={tool}
                onEdit={setEditTarget} onDelete={setDeleteTarget}
                onToggle={handleToggle} toggling={toggling} />
            ))}
          </div>

          {/* Paused tools collapsible */}
          {pausedTools.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowPaused(v => !v)}
                className="flex items-center gap-2 text-[12px] font-medium mb-3 hover:opacity-80 transition-opacity"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                <ChevronDown size={13}
                  className={`transition-transform duration-200 ${showPaused ? "rotate-180" : ""}`} />
                {pausedTools.length} paused {pausedTools.length === 1 ? "tool" : "tools"}
              </button>
              {showPaused && (
                <div className="space-y-3">
                  {pausedTools.map(tool => (
                    <ToolCard key={tool.id} tool={tool}
                      onEdit={setEditTarget} onDelete={setDeleteTarget}
                      onToggle={handleToggle} toggling={toggling} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateToolModal toolTypes={toolTypes}
          onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
      {editTarget && (
        <EditToolModal tool={editTarget} toolTypes={toolTypes}
          onClose={() => setEditTarget(null)} onSave={handleUpdate} />
      )}
      {deleteTarget && (
        <ConfirmDelete tool={deleteTarget} deleting={deleting}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
