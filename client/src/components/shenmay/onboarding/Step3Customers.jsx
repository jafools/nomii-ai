import { useState, useRef } from "react";
import { aiMapCustomerCsv, uploadCustomersCsvMapped } from "@/lib/shenmayApi";
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
const inpStyle = { backgroundColor: "#EDE7D7", color: "#1A1D1A", borderColor: "#D8D0BD" };

const Step3Customers = ({ advance, stepIndex, shenmayTenant }) => {
  const alreadyDone = !!shenmayTenant?.onboarding_steps?.customers;
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
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0F5F5C", marginBottom: 8 }}>Figure 03 · Who you know</div>
        <h2 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 300, fontStyle: "italic", fontSize: 28, letterSpacing: "-0.04em", color: "#1A1D1A", margin: "0 0 12px" }}>Customers.</h2>
        <div className="rounded-xl p-5 mb-6 flex items-center gap-3" style={{ background: "rgba(45,106,79,0.10)", border: "1px solid rgba(45,106,79,0.20)" }}>
          <CheckCircle2 size={20} style={{ color: "#2D6A4F" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#2D6A4F" }}>✓ Customers imported</p>
            <p className="text-xs" style={{ color: "rgba(45,106,79,0.70)" }}>Your customer data is already uploaded.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSavedSummary(false)} className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: "#0F5F5C" }}>
            Import more →
          </button>
          <button
            onClick={() => advance(stepIndex)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#0F5F5C]/20 group"
            style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
          >
            Continue <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0F5F5C" }}>Figure 03 · Who you know</div>
        <h2 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 300, fontStyle: "italic", fontSize: 32, letterSpacing: "-0.04em", color: "#1A1D1A", lineHeight: 1.05, margin: "12px 0 0" }}>Bring your customers in.</h2>
        <p style={{ fontSize: 15, color: "#6B6B64", marginTop: 12, lineHeight: 1.55 }}>Upload any list you have — spreadsheet, CRM dump, email export. We'll map the columns automatically.</p>
      </div>

      {/* Legal warning */}
      <div className="flex items-start gap-3 rounded-lg px-4 py-3 mb-6" style={{ background: "rgba(15,95,92,0.08)", border: "1px solid rgba(15,95,92,0.18)" }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#0F5F5C" }} />
        <p className="text-xs leading-relaxed" style={{ color: "rgba(15,95,92,0.85)" }}>
          <strong>Only upload data you have the right to share.</strong> By uploading customer data you confirmed during sign-up that you have obtained the necessary consents. Do not upload sensitive information such as passwords, social security numbers, financial account numbers, or medical records.
        </p>
      </div>

      {/* Stage 1 — File drop */}
      {stage === 1 && !analysing && (
        <>
          <div className="rounded-xl p-8 text-center mb-6" style={{ border: "2px dashed #D8D0BD", background: "#EDE7D7" }}>
            <Upload size={32} className="mx-auto mb-3" style={{ color: "#6B6B64" }} />
            <p className="text-sm mb-3" style={{ color: "#6B6B64" }}>Drop your CSV here or click to browse</p>
            <label className="inline-block px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-[#0F5F5C]/20" style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}>
              Choose CSV File
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
          </div>
          <button onClick={() => advance(stepIndex)} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "#6B6B64" }}>
            Skip for now →
          </button>
        </>
      )}

      {/* Analysing spinner */}
      {analysing && (
        <div className="rounded-xl p-8 text-center mb-6" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
          <Loader2 size={28} className="mx-auto mb-3 animate-spin" style={{ color: "#0F5F5C" }} />
          <p className="text-sm font-medium" style={{ color: "#1A1D1A" }}>Analysing your file...</p>
          <p className="text-xs mt-1" style={{ color: "#6B6B64" }}>{fileName}</p>
        </div>
      )}

      {/* Stage 2 — Mapping review */}
      {stage === 2 && (
        <>
          <h3 className="text-lg font-semibold mb-1" style={{ color: "#1A1D1A" }}>Here's how we'll map your columns.</h3>
          <p className="text-sm mb-4" style={{ color: "#6B6B64" }}>Adjust anything that looks wrong.</p>

          <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid #EDE7D7" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#EDE7D7", borderBottom: "1px solid #EDE7D7" }}>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs" style={{ color: "#6B6B64" }}>Your column</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs" style={{ color: "#6B6B64" }}>Sample data</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-xs" style={{ color: "#6B6B64" }}>Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const isEmail = mapping[h] === "email";
                  const sample = sampleRows[0]?.[i] || "—";
                  return (
                    <tr key={h} style={{
                      borderBottom: "1px solid #EDE7D7",
                      background: isEmail ? "rgba(15,95,92,0.06)" : "transparent",
                    }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#1A1D1A" }}>{h}</td>
                      <td className="px-4 py-2.5" style={{ color: "#6B6B64" }}>{sample}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={mapping[h] || "skip"}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#0F5F5C]/20"
                          style={{ borderColor: "#D8D0BD", color: "#1A1D1A", backgroundColor: "#EDE7D7" }}
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} style={{ background: "#EDE7D7" }}>{opt.label}</option>
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
            <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(122,31,26,0.12)", color: "#7A1F1A", border: "1px solid rgba(122,31,26,0.20)" }}>
              ⚠️ You must map at least one column to <strong>Email</strong> to continue.
            </p>
          )}

          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={handleImport}
              disabled={!hasEmail || importing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 transition-all duration-200 hover:shadow-lg hover:shadow-[#0F5F5C]/20"
              style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
            >
              {importing ? (
                <><Loader2 size={16} className="animate-spin" /> Importing...</>
              ) : (
                <>Confirm & Import <ArrowRight size={16} /></>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <button onClick={resetToStage1} className="text-xs font-medium hover:opacity-70 transition-opacity" style={{ color: "#6B6B64" }}>
              ← Choose a different file
            </button>
            <button onClick={() => advance(stepIndex)} className="text-xs font-medium hover:opacity-70 transition-opacity" style={{ color: "#6B6B64" }}>
              Skip for now →
            </button>
          </div>
        </>
      )}

      {/* Stage 3 — Success */}
      {stage === 3 && result && (
        <>
          <div className="rounded-xl p-6 text-center mb-6" style={{ background: "rgba(45,106,79,0.10)", border: "1px solid rgba(45,106,79,0.20)" }}>
            <CheckCircle size={36} className="mx-auto mb-3" style={{ color: "#2D6A4F" }} />
            <p className="text-lg font-semibold" style={{ color: "#2D6A4F" }}>
              {result.inserted || 0} customers imported{result.updated ? ` (${result.updated} updated)` : ""}.
            </p>
          </div>

          {result.errors?.length > 0 && (
            <details className="mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid #EDE7D7" }}>
              <summary className="px-4 py-2.5 text-sm font-medium cursor-pointer" style={{ background: "rgba(15,95,92,0.08)", color: "rgba(15,95,92,0.85)" }}>
                Show issues ({result.errors.length})
              </summary>
              <ul className="px-4 py-3 text-xs space-y-1" style={{ color: "#6B6B64" }}>
                {result.errors.map((err, i) => (
                  <li key={i}>Row {err.row || i + 1}: {err.message || String(err)}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-4">
            <button onClick={resetToStage1} className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-[#F5F1E8]" style={{ border: "1px solid #D8D0BD", color: "#3A3D39" }}>
              Import another file
            </button>
            <button
              onClick={() => advance(stepIndex)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#0F5F5C]/20 group"
              style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}
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
