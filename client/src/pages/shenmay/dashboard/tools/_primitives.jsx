/**
 * Shared mini-components for the Tools surface.
 *
 * Split out of ShenmayTools.jsx (dad-polish Phase 2). Nothing here owns
 * meaningful state — these are pure presentational primitives used by the
 * modals + cards. If something grows its own useState / useEffect, move it
 * to a dedicated file instead of bloating this one.
 */

import { Loader2, AlertCircle, X, ChevronLeft } from "lucide-react";
import { TYPE_STYLE } from "./_shared";

export function ToolTypeBadge({ type }) {
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

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: "#0F5F5C" }} />;
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl mb-4"
      style={{ background: "rgba(122,31,26,0.08)", border: "1px solid rgba(122,31,26,0.20)" }}>
      <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#7A1F1A" }} />
      <p className="text-sm flex-1" style={{ color: "#7A1F1A" }}>{message}</p>
      {onDismiss && <button onClick={onDismiss}><X size={14} style={{ color: "#7A1F1A" }} /></button>}
    </div>
  );
}

// Step progress pill dots
export function StepDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-5">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="rounded-full transition-all duration-200" style={{
          width:  i + 1 === current ? 20 : 8,
          height: 8,
          background: i + 1 === current ? "#0F5F5C"
            : i + 1 < current ? "rgba(15,95,92,0.40)"
            : "#D8D0BD",
        }} />
      ))}
    </div>
  );
}

export function ModalShell({ children, title, onClose, back, step, totalSteps }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <div className="flex items-center justify-between p-5 pb-4"
          style={{ borderBottom: "1px solid #EDE7D7" }}>
          <div className="flex items-center gap-2">
            {back && (
              <button onClick={back} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <ChevronLeft size={16} style={{ color: "#6B6B64" }} />
              </button>
            )}
            <h2 className="text-base font-semibold" style={{ color: "#1A1D1A" }}>
              {title}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X size={16} style={{ color: "#6B6B64" }} />
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

// Config fields — shared between Create and Edit modals.
export function ConfigFields({ fields, config, onChange, toolType }) {
  const inputStyle = { background: "#EDE7D7", border: "1px solid #D8D0BD", color: "#1A1D1A" };
  const labelClass = "block text-[11px] font-semibold uppercase tracking-wider mb-1.5";
  const inputClass = "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all";
  const authType   = config.auth_type || "none";

  return (
    <div>
      {fields.map(field => (
        <div className="mb-4" key={field.key}>
          <label className={labelClass} style={{ color: "#6B6B64" }}>
            {field.label}{field.required && <span style={{ color: "#7A1F1A" }}> *</span>}
          </label>
          {field.type === "select" ? (
            <select value={config[field.key] ?? field.default ?? ""}
              onChange={e => onChange(field.key, e.target.value)}
              className={inputClass} style={{ ...inputStyle, colorScheme: "dark" }}>
              {(field.options || []).map(opt => (
                <option key={opt.value || opt} value={opt.value || opt} style={{ background: "#EDE7D7" }}>
                  {opt.label || opt}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" value={config[field.key] ?? ""}
              onChange={e => onChange(field.key, e.target.value)}
              placeholder={field.placeholder} className={inputClass} style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(15,95,92,0.5)"}
              onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
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
            <label className={labelClass} style={{ color: "#6B6B64" }}>
              {authType === "bearer" ? "Bearer token" : "API key value"}
              <span style={{ color: "#7A1F1A" }}> *</span>
            </label>
            <input type="password" value={config.auth_token ?? ""}
              onChange={e => onChange("auth_token", e.target.value)}
              placeholder={authType === "bearer" ? "eyJhbGciO..." : "your-api-key-here"}
              className={inputClass} style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
              onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
            <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>
              Stored securely. Not visible to your team after saving.
            </p>
          </div>
          {authType === "api_key" && (
            <div>
              <label className={labelClass} style={{ color: "#6B6B64" }}>
                Header name <span style={{ color: "#7A1F1A" }}>*</span>
              </label>
              <input type="text" value={config.auth_header_name ?? ""}
                onChange={e => onChange("auth_header_name", e.target.value)}
                placeholder="e.g. X-Api-Key" className={inputClass} style={inputStyle}
                onFocus={e => e.target.style.borderColor = "rgba(15,95,92,0.5)"}
                onBlur={e  => e.target.style.borderColor = "#D8D0BD"} />
            </div>
          )}
        </div>
      )}

      {fields.length === 0 && toolType !== "connect" && (
        <p className="text-sm mb-6" style={{ color: "#6B6B64" }}>
          This tool type needs no extra settings — you're all set!
        </p>
      )}
    </div>
  );
}
