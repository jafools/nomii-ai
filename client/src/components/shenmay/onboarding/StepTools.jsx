/**
 * StepTools — Onboarding Step: Give Your AI Superpowers
 *
 * Non-technical onboarding step for the custom tool builder.
 * Lets users enable tools by answering plain-English questions.
 * Skippable — all tools can be managed later from the dashboard.
 */

import { useState, useEffect } from "react";
import { ArrowRight, ChevronRight, Check, Loader2, SkipForward } from "lucide-react";
import { getToolTypes, createTool } from "@/lib/shenmayApi";

// ── Map tool types to friendly onboarding cards ──────────────────────────────

const TOOL_ONBOARDING = {
  lookup: {
    emoji:   "🔍",
    heading: "Look up client information",
    body:    "Your AI can search through your client records in real time — accounts, history, files, whatever you track. Instead of guessing, it answers from actual data.",
    question: "When should your AI look things up?",
    placeholder: "e.g. When a client asks about their account, balance, or any information we have on file",
    default_trigger: "Use when the client asks about their account, records, data, or any information we have on file about them.",
    config_hint: "Which type of data?",
    config_key: "data_category",
    config_placeholder: "e.g. accounts, investments, orders, cases",
    config_help: "This tells your AI which part of your records to look at.",
    color: "#0F5F5C",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.20)",
  },
  calculate: {
    emoji:   "📊",
    heading: "Run calculations from your data",
    body:    "Your AI can total up numbers, calculate averages, or count records — and give clients an instant answer without anyone lifting a finger.",
    question: "When should your AI do a calculation?",
    placeholder: "e.g. When a client asks about totals, how much they've spent, or a running balance",
    default_trigger: "Use when the client asks for a total, average, count, or any numerical summary of their data.",
    config_hint: "Which type of data contains the numbers?",
    config_key: "data_category",
    config_placeholder: "e.g. transactions, expenses, invoices, donations",
    config_help: "Your AI will add up or average the values in this category.",
    color: "#10B981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.20)",
  },
  report: {
    emoji:   "📄",
    heading: "Generate written reports",
    body:    "Your AI can write a clear, formatted summary for a client — covering their account, their situation, or any analysis you ask for. Great for review meetings or client check-ins.",
    question: "When should your AI write a report?",
    placeholder: "e.g. When a client asks for a summary, overview, or something in writing",
    default_trigger: "Use when the client asks for a summary, report, or written overview of their situation.",
    config_hint: null,
    config_key: null,
    color: "#0F5F5C",
    bg: "rgba(15,95,92,0.08)",
    border: "rgba(15,95,92,0.20)",
  },
  escalate: {
    emoji:   "🙋",
    heading: "Know when to involve your team",
    body:    "Your AI can recognise when a question goes beyond its scope and instantly flag it to your team. No client ever gets stuck — it just escalates, and someone follows up.",
    question: "When should your AI alert a team member?",
    placeholder: "e.g. When a client asks for specific advice, requests a meeting, or needs something only a human can handle",
    default_trigger: "Use when the client needs personal attention, asks for a meeting, or has a complex question that requires human expertise.",
    config_hint: null,
    config_key: null,
    color: "#7A1F1A",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.20)",
  },
};

// ── Tool toggle card ──────────────────────────────────────────────────────────

function ToolCard({ toolType, toolInfo, enabled, onToggle, trigger, onTriggerChange, configValue, onConfigChange }) {
  const { emoji, heading, body, question, placeholder, config_hint, config_key, config_placeholder, config_help, color, bg, border } = toolInfo;

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        border: `1px solid ${enabled ? border : "#EDE7D7"}`,
        background: enabled ? bg : "#EDE7D7",
      }}
    >
      {/* Card header — always visible */}
      <button
        onClick={() => onToggle(toolType)}
        className="w-full flex items-start gap-4 p-5 text-left"
      >
        <div className="text-2xl shrink-0 mt-0.5">{emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold" style={{ color: enabled ? "#fff" : "#3A3D39" }}>
              {heading}
            </span>
            {/* Toggle pill */}
            <div
              className="h-6 w-11 rounded-full shrink-0 flex items-center transition-all duration-200 px-0.5"
              style={{ background: enabled ? color : "#D8D0BD" }}
            >
              <div
                className="h-5 w-5 rounded-full transition-all duration-200"
                style={{
                  background: "#fff",
                  transform: enabled ? "translateX(20px)" : "translateX(0)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              />
            </div>
          </div>
          <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "#6B6B64" }}>
            {body}
          </p>
        </div>
      </button>

      {/* Expanded config — only when enabled */}
      {enabled && (
        <div className="px-5 pb-5 pt-1 border-t" style={{ borderColor: border }}>
          {/* Trigger description */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B6B64" }}>
              {question}
            </label>
            <textarea
              value={trigger}
              onChange={e => onTriggerChange(toolType, e.target.value)}
              rows={2}
              placeholder={placeholder}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none transition-all"
              style={{
                background: "rgba(0,0,0,0.20)",
                border: `1px solid ${border}`,
                color: "#1A1D1A",
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>
              Write this in plain English — your AI reads it to decide when to act.
            </p>
          </div>

          {/* Optional config field (data category etc.) */}
          {config_hint && config_key && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#6B6B64" }}>
                {config_hint}
              </label>
              <input
                type="text"
                value={configValue || ""}
                onChange={e => onConfigChange(toolType, config_key, e.target.value)}
                placeholder={config_placeholder}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{
                  background: "rgba(0,0,0,0.20)",
                  border: `1px solid ${border}`,
                  color: "#1A1D1A",
                }}
              />
              {config_help && (
                <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>{config_help}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main step component ────────────────────────────────────────────────────────

export default function StepTools({ shenmayTenant, advance, stepIndex, onSkip }) {
  // Which tools are toggled on
  const [enabled, setEnabled]   = useState({});
  // Trigger text per tool (plain-English "when to use")
  const [triggers, setTriggers] = useState({});
  // Config values per tool (e.g. data_category)
  const [configs, setConfigs]   = useState({});

  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  // Pre-fill trigger defaults so users don't have to type from scratch
  useEffect(() => {
    const defaults = {};
    Object.entries(TOOL_ONBOARDING).forEach(([type, info]) => {
      defaults[type] = info.default_trigger;
    });
    setTriggers(defaults);
  }, []);

  function toggleTool(type) {
    setEnabled(prev => ({ ...prev, [type]: !prev[type] }));
  }

  function setTrigger(type, value) {
    setTriggers(prev => ({ ...prev, [type]: value }));
  }

  function setConfig(type, key, value) {
    setConfigs(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [key]: value } }));
  }

  const enabledTypes = Object.keys(enabled).filter(t => enabled[t]);

  async function handleSave() {
    if (enabledTypes.length === 0) {
      // Nothing enabled — just advance (same as skip but they clicked "Continue")
      advance(stepIndex);
      return;
    }

    setSaving(true); setError(null);

    // Validate required config fields before calling the API
    const missingConfig = enabledTypes.filter(type => {
      const info = TOOL_ONBOARDING[type];
      return info.config_key && !configs[type]?.[info.config_key]?.trim();
    });
    if (missingConfig.length > 0) {
      const names = missingConfig.map(t => TOOL_ONBOARDING[t].heading).join(', ');
      setError(`Please fill in the required data field for: ${names}`);
      setSaving(false);
      return;
    }

    try {
      await Promise.all(
        enabledTypes.map(type => {
          const info = TOOL_ONBOARDING[type];
          const trigger = triggers[type] || info.default_trigger;
          const config  = configs[type] || {};

          // Machine name must be unique per tenant; random suffix avoids
          // collisions when the same tool type is enabled more than once.
          const machineName = type + "_" + (Math.random().toString(36).slice(2, 6));
          const displayName = info.heading;

          return createTool({
            name:                machineName,
            display_name:        displayName,
            tool_type:           type,
            trigger_description: trigger.trim() || info.default_trigger,
            config,
          });
        })
      );

      advance(stepIndex);
    } catch (err) {
      setError("Something went wrong saving your tools. You can add them later from the dashboard.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Heading */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0F5F5C" }}>Figure 05 · Capabilities</div>
        <h2 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 300, fontStyle: "italic", fontSize: 32, letterSpacing: "-0.04em", color: "#1A1D1A", lineHeight: 1.05, margin: "12px 0 0" }}>Give your agent tools.</h2>
        <p style={{ fontSize: 15, color: "#6B6B64", marginTop: 12, lineHeight: 1.55 }}>Right now your agent can chat — but it's working from memory. Toggle on any abilities you want it to have.</p>
      </div>

      {/* Tool cards */}
      <div className="space-y-3 mb-7">
        {Object.entries(TOOL_ONBOARDING).map(([type, info]) => (
          <ToolCard
            key={type}
            toolType={type}
            toolInfo={info}
            enabled={!!enabled[type]}
            onToggle={toggleTool}
            trigger={triggers[type] || ""}
            onTriggerChange={setTrigger}
            configValue={configs[type]?.[info.config_key] || ""}
            onConfigChange={setConfig}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 rounded-xl flex items-start gap-3"
          style={{ background: "rgba(122,31,26,0.08)", border: "1px solid rgba(122,31,26,0.20)" }}>
          <p className="text-sm" style={{ color: "#7A1F1A" }}>{error}</p>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
      >
        {saving ? (
          <><Loader2 size={16} className="animate-spin" /> Saving your tools…</>
        ) : enabledTypes.length > 0 ? (
          <><Check size={16} /> Save {enabledTypes.length} tool{enabledTypes.length !== 1 ? "s" : ""} and continue <ArrowRight size={14} /></>
        ) : (
          <>Continue <ArrowRight size={14} /></>
        )}
      </button>

      {/* Skip link */}
      <div className="mt-4 text-center">
        <button
          onClick={onSkip}
          className="inline-flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
          style={{ color: "#6B6B64" }}
        >
          <SkipForward size={13} />
          Skip for now — I'll set this up later from the dashboard
        </button>
      </div>
    </div>
  );
}
