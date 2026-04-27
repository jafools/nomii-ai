import { useState, useEffect } from "react";
import {
  X, AlertCircle, CheckCircle2, Loader2,
  FlaskConical, TriangleAlert, ChevronDown, ChevronUp,
} from "lucide-react";
import { testTool, getCustomers } from "@/lib/shenmayApi";
import { TYPE_STYLE, TYPE_EMOJI } from "./_shared";

// Tool Test Modal — sandbox + real customer modes.
// Moved out of ShenmayTools.jsx (dad-polish Phase 2). Owns its own
// mode / message / result / customer-picker state.
export default function TestModal({ tool, onClose }) {
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
    const base = "This makes a real API call and counts toward your monthly message quota.";
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
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #EDE7D7" }}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center text-base" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              {TYPE_EMOJI[tool.tool_type]}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1D1A]">Test: {tool.display_name}</p>
              <p className="text-[11px]" style={{ color: "#6B6B64" }}>
                {mode === "sandbox" ? "Sandbox — no real customer data" : selectedCust ? `Testing with ${selectedCust.first_name} ${selectedCust.last_name}` : "Real customer mode"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#EDE7D7] transition-colors">
            <X size={16} style={{ color: "#6B6B64" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[78vh] overflow-y-auto">

          {/* Mode toggle */}
          <div className="flex rounded-xl p-1 gap-1" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
            {[
              { id: "sandbox", label: "🧪 Sandbox",       sub: "No real data" },
              { id: "real",    label: "👤 Real customer", sub: "Uses live records" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => switchMode(m.id)}
                className="flex-1 flex flex-col items-center py-2 px-3 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: mode === m.id ? (m.id === "real" ? "rgba(15,95,92,0.15)" : "#EDE7D7") : "transparent",
                  color: mode === m.id ? (m.id === "real" ? "#0F5F5C" : "#1A1D1A") : "#6B6B64",
                  border: mode === m.id ? `1px solid ${m.id === "real" ? "rgba(15,95,92,0.30)" : "#D8D0BD"}` : "1px solid transparent",
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
              <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "#6B6B64" }}>
                Select test customer
              </label>
              {selectedCust ? (
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: "rgba(15,95,92,0.08)", border: "1px solid rgba(15,95,92,0.25)" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#0F5F5C" }}>
                      {selectedCust.first_name} {selectedCust.last_name}
                    </p>
                    <p className="text-[11px]" style={{ color: "#6B6B64" }}>{selectedCust.email}</p>
                  </div>
                  <button onClick={() => { setSelCust(null); setCSearch(""); setShowDrop(true); }}
                    className="p-1 rounded-lg hover:bg-[#EDE7D7]">
                    <X size={12} style={{ color: "#6B6B64" }} />
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
                    style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", color: "#1A1D1A" }}
                    onFocus={e => { e.target.style.borderColor = "rgba(15,95,92,0.5)"; setShowDrop(true); }}
                    onBlur={e => setTimeout(() => { e.target.style.borderColor = "#D8D0BD"; setShowDrop(false); }, 150)}
                  />
                  {showDropdown && (
                    <div className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-xl" style={{ background: "#EDE7D7", border: "1px solid #D8D0BD", maxHeight: 200, overflowY: "auto" }}>
                      {custLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 size={16} className="animate-spin" style={{ color: "#0F5F5C" }} />
                        </div>
                      ) : customers.length === 0 ? (
                        <p className="text-center py-5 text-[12px]" style={{ color: "#6B6B64" }}>No customers found</p>
                      ) : (
                        customers.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={() => { setSelCust(c); setCSearch(""); setShowDrop(false); }}
                            className="w-full text-left px-4 py-3 transition-colors hover:bg-[#F5F1E8]"
                            style={{ borderBottom: "1px solid #EDE7D7" }}
                          >
                            <p className="text-[13px] font-medium" style={{ color: "#1A1D1A" }}>
                              {c.first_name} {c.last_name}
                            </p>
                            <p className="text-[11px]" style={{ color: "#6B6B64" }}>{c.email}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
              <p className="text-[10px] mt-1.5" style={{ color: "#6B6B64" }}>
                Tip: use an employee's own profile so you can verify the results safely.
              </p>
            </div>
          )}

          {/* Warning banner */}
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <TriangleAlert size={13} className="shrink-0 mt-0.5" style={{ color: "#A6660E" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(245,158,11,0.9)" }}>{warnText}</p>
          </div>

          {/* Trigger hint */}
          <div className="text-[11px] px-3 py-2.5 rounded-lg" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
            <span style={{ color: "#6B6B64" }}>Triggers when: </span>
            <span style={{ color: "#3A3D39" }}>{tool.trigger_description}</span>
          </div>

          {/* Message input */}
          <div>
            <label className="block text-[11px] font-semibold mb-2" style={{ color: "#6B6B64" }}>
              Sample customer message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) handleRun(); }}
              placeholder="Type a message a customer might send to trigger this tool…"
              rows={3}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              style={{ background: "#EDE7D7", border: "1px solid #EDE7D7", color: "#1A1D1A", lineHeight: "1.5" }}
              onFocus={e => e.target.style.borderColor = s.color + "66"}
              onBlur={e => e.target.style.borderColor = "#EDE7D7"}
            />
            <p className="text-[10px] mt-1.5" style={{ color: "#6B6B64" }}>⌘ + Enter to run</p>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running || !canRun}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: (running || !canRun) ? "#EDE7D7" : `linear-gradient(135deg, ${s.color} 0%, ${s.color}cc 100%)`, color: (running || !canRun) ? "#6B6B64" : "#fff" }}
          >
            {running
              ? <><Loader2 size={15} className="animate-spin" /> Running…</>
              : mode === "real" && !selectedCust
                ? <><FlaskConical size={15} /> Select a customer to run</>
                : <><FlaskConical size={15} /> Run {mode === "real" ? "Real" : "Sandbox"} Test</>}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(122,31,26,0.08)", border: "1px solid rgba(122,31,26,0.20)" }}>
              <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: "#7A1F1A" }} />
              <p className="text-[12px]" style={{ color: "#7A1F1A" }}>{error}</p>
            </div>
          )}

          {/* Result panel */}
          {result && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${result.invoked ? s.border : "#EDE7D7"}` }}>
              {/* Status row */}
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: result.invoked ? s.bg : "#EDE7D7" }}>
                {result.invoked
                  ? <CheckCircle2 size={14} style={{ color: s.color }} />
                  : <AlertCircle  size={14} style={{ color: "#6B6B64" }} />}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-semibold" style={{ color: result.invoked ? s.color : "#6B6B64" }}>
                    {result.invoked
                      ? `✓ Tool triggered${result.simulated ? " (simulated)" : ""}`
                      : "Tool was not triggered by this message"}
                  </span>
                  {result.test_customer && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(15,95,92,0.12)", color: "#0F5F5C" }}>
                      {result.test_customer.name}
                    </span>
                  )}
                </div>
              </div>

              {/* AI response */}
              {result.ai_response && (
                <div className="px-4 py-3" style={{ borderTop: "1px solid #EDE7D7" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B6B64" }}>Agent response</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "#3A3D39" }}>{result.ai_response}</p>
                </div>
              )}

              {/* Tool I/O (collapsible) */}
              {result.invoked && (result.tool_input || result.tool_result) && (
                <div style={{ borderTop: "1px solid #EDE7D7" }}>
                  <button
                    onClick={() => setShowJson(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-[#EDE7D7]"
                    style={{ color: "#6B6B64" }}
                  >
                    Tool input / output
                    {showJson ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showJson && (
                    <div className="px-4 pb-4 space-y-3">
                      {result.tool_input && (
                        <div>
                          <p className="text-[10px] mb-1" style={{ color: "#6B6B64" }}>Parameters Claude passed</p>
                          <pre className="text-[11px] font-mono p-2.5 rounded-lg overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "#6B6B64" }}>
                            {JSON.stringify(result.tool_input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {result.tool_result && (
                        <div>
                          <p className="text-[10px] mb-1" style={{ color: "#6B6B64" }}>Tool returned</p>
                          <pre className="text-[11px] font-mono p-2.5 rounded-lg overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "#6B6B64" }}>
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
