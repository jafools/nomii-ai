import { useState, useRef } from "react";
import { aiMapCustomerCsv, uploadCustomersCsvMapped } from "@/lib/nomiiApi";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Upload, ArrowRight, CheckCircle, ChevronDown, Loader2, CheckCircle2 } from "lucide-react";

const FIELD_OPTIONS = [
  { value: "email", label: "Email (required)" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "external_id", label: "Customer/Platform ID" },
  { value: "notes", label: "Notes" },
  { value: "skip", label: "— Skip this column —" },
];

// Dark-themed shared input styles
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

const Step3Customers = ({ advance, stepIndex, nomiiTenant }) => {
  const alreadyDone = !!nomiiTenant?.onboarding_steps?.customers;
  const [showSavedSummary, setShowSavedSummary] = useState(alreadyDone);
  const [stage, setStage] = useState(1);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [analysing, setAnalysing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const parseCsv = (text) => {
    const lines = text.split("\n").filter((l) => l.trim());
    const hdrs = lines[0]?.split(",").map((h) => h.trim()) || [];
    const rows = lines.slice(1, 6).map((l) => l.split(",").map((c) => c.trim()));
    return { hdrs, rows };
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    const { hdrs, rows } = parseCsv(text);
    setHeaders(hdrs);
    setSampleRows(rows);
    setAnalysing(true);
    try {
      const data = await aiMapCustomerCsv(hdrs, rows);
      const m = {};
      hdrs.forEach((h) => {
        m[h] = data.mapping?.[h] || "skip";
      });
      setMapping(m);
      setStage(2);
    } catch (err) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setAnalysing(false);
    }
  };

  const hasEmail = Object.values(mapping).includes("email");

  const handleImport = async () => {
    const confirmed = {};
    Object.entries(mapping).forEach(([col, field]) => {
      if (field !== "skip") confirmed[col] = field;
    });
    setImporting(true);
    try {
      const data = await uploadCustomersCsvMapped(csvText, confirmed);
      setResult(data);
      setStage(3);
      toast({ title: `${data.inserted || 0} customers imported!` });
    } catch (err) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const resetToStage1 = () => {
    setStage(1);
    setCsvText("");
    setFileName("");
    setHeaders([]);
    setSampleRows([]);
    setMapping({});
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (showSavedSummary) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Customer Data</h2>
        <div className="rounded-xl p-5 mb-6 flex items-center gap-3" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)" }}>
          <CheckCircle2 size={20} style={{ color: "#4ADE80" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#4ADE80" }}>✓ Customers imported</p>
            <p className="text-xs" style={{ color: "rgba(74,222,128,0.70)" }}>Your customer data is already uploaded.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSavedSummary(false)} className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: "#C9A84C" }}>
            Import more →
          </button>
          <button
            onClick={() => advance(stepIndex)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20 group"
            style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
          >
            Continue <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Import your customers</h2>
      <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.40)" }}>
        Upload any customer list you already have — a spreadsheet export, CRM dump, or email list. We'll figure out the columns automatically.
      </p>

      {/* Legal warning */}
      <div className="flex items-start gap-3 rounded-lg px-4 py-3 mb-6" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.18)" }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#C9A84C" }} />
        <p className="text-xs leading-relaxed" style={{ color: "rgba(201,168,76,0.85)" }}>
          <strong>Only upload data you have the right to share.</strong> By uploading customer data you confirmed during sign-up that you have obtained the necessary consents. Do not upload sensitive information such as passwords, social security numbers, financial account numbers, or medical records.
        </p>
      </div>

      {/* Stage 1 — File drop */}
      {stage === 1 && !analysing && (
        <>
          <div className="rounded-xl p-8 text-center mb-6" style={{ border: "2px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}>
            <Upload size={32} className="mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
            <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.40)" }}>Drop your CSV here or click to browse</p>
            <label className="inline-block px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20" style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}>
              Choose CSV File
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
          </div>
          <button onClick={() => advance(stepIndex)} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.40)" }}>
            Skip for now →
          </button>
        </>
      )}

      {/* Analysing spinner */}
      {analysing && (
        <div className="rounded-xl p-8 text-center mb-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Loader2 size={28} className="mx-auto mb-3 animate-spin" style={{ color: "#C9A84C" }} />
          <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>Analysing your file...</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{fileName}</p>
        </div>
      )}

      {/* Stage 2 — Mapping review */}
      {stage === 2 && (
        <>
          <h3 className="text-lg font-semibold mb-1" style={{ color: "rgba(255,255,255,0.85)" }}>Here's how we'll map your columns.</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.40)" }}>Adjust anything that looks wrong.</p>

          <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Your column</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Sample data</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const isEmail = mapping[h] === "email";
                  const sample = sampleRows[0]?.[i] || "—";
                  return (
                    <tr key={h} style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      background: isEmail ? "rgba(201,168,76,0.06)" : "transparent",
                    }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>{h}</td>
                      <td className="px-4 py-2.5" style={{ color: "rgba(255,255,255,0.40)" }}>{sample}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={mapping[h] || "skip"}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20"
                          style={{ borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.80)", backgroundColor: "rgba(255,255,255,0.05)" }}
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} style={{ background: "#0F1A2E" }}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!hasEmail && (
            <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.12)", color: "#F87171", border: "1px solid rgba(239,68,68,0.20)" }}>
              ⚠️ You must map at least one column to <strong>Email</strong> to continue.
            </p>
          )}

          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={handleImport}
              disabled={!hasEmail || importing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20"
              style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
            >
              {importing ? (
                <><Loader2 size={16} className="animate-spin" /> Importing...</>
              ) : (
                <>Confirm & Import <ArrowRight size={16} /></>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <button onClick={resetToStage1} className="text-xs font-medium hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.50)" }}>
              ← Choose a different file
            </button>
            <button onClick={() => advance(stepIndex)} className="text-xs font-medium hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.40)" }}>
              Skip for now →
            </button>
          </div>
        </>
      )}

      {/* Stage 3 — Success */}
      {stage === 3 && result && (
        <>
          <div className="rounded-xl p-6 text-center mb-6" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)" }}>
            <CheckCircle size={36} className="mx-auto mb-3" style={{ color: "#4ADE80" }} />
            <p className="text-lg font-semibold" style={{ color: "#4ADE80" }}>
              {result.inserted || 0} customers imported{result.updated ? ` (${result.updated} updated)` : ""}.
            </p>
          </div>

          {result.errors?.length > 0 && (
            <details className="mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <summary className="px-4 py-2.5 text-sm font-medium cursor-pointer" style={{ background: "rgba(201,168,76,0.08)", color: "rgba(201,168,76,0.85)" }}>
                Show issues ({result.errors.length})
              </summary>
              <ul className="px-4 py-3 text-xs space-y-1" style={{ color: "rgba(255,255,255,0.40)" }}>
                {result.errors.map((err, i) => (
                  <li key={i}>Row {err.row || i + 1}: {err.message || String(err)}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-4">
            <button onClick={resetToStage1} className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-white/[0.04]" style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)" }}>
              Import another file
            </button>
            <button
              onClick={() => advance(stepIndex)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20 group"
              style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
            >
              Continue
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Step3Customers;
