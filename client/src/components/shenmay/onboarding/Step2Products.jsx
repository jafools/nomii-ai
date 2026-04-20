import { useState, useEffect } from "react";
import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  uploadProductsCsv,
  aiSuggestProducts,
  bulkSaveProducts,
} from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Check, ChevronUp, Download, ArrowRight, Sparkles, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";

/* ── shared styles (dark-themed) ── */
const inp =
  "w-full px-4 py-2.5 rounded-lg text-sm transition-all duration-200 border placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20 focus:border-[#C9A84C]/50";
const inpStyle = { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", borderColor: "rgba(255,255,255,0.10)" };

/* ========================================================================= */

const Step2Products = ({ advance, markComplete, stepIndex, shenmayTenant }) => {
  const [showSavedSummary, setShowSavedSummary] = useState(!!shenmayTenant?.onboarding_steps?.products);
  /* ── product list state ── */
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ── manual add form ── */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", price_info: "", notes: "" });
  const [saving, setSaving] = useState(false);

  /* ── inline edit ── */
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "", price_info: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  /* ── CSV upload ── */
  const [uploading, setUploading] = useState(false);

  /* ── AI import state ── */
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiFallback, setAiFallback] = useState(false);
  const [proposed, setProposed] = useState(null); // array when results ready
  const [checked, setChecked] = useState({}); // { index: bool }
  const [bulkSaving, setBulkSaving] = useState(false);

  /* ── fetch products ── */
  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      const list = data.products || data || [];
      setProducts(list);
      if (list.length > 0) markComplete(stepIndex);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  /* ── manual form helpers ── */
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addProduct({ ...form, name: form.name.trim() });
      setForm({ name: "", description: "", category: "", price_info: "", notes: "" });
      setShowForm(false);
      toast({ title: "Product added!" });
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ── inline edit handlers ── */
  const startEdit = (p) => {
    setEditingId(p._id || p.id);
    setEditForm({
      name: p.name || "",
      description: p.description || "",
      category: p.category || "",
      price_info: p.price_info || "",
      notes: p.notes || "",
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({ name: "", description: "", category: "", price_info: "", notes: "" }); };

  const setEdit = (field) => (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));

  const handleEditSave = async () => {
    if (!editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await updateProduct(editingId, editForm);
      toast({ title: "Product updated!" });
      cancelEdit();
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProduct(id);
      toast({ title: "Product deleted." });
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  /* ── CSV upload ── */
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const data = await uploadProductsCsv(text);
      toast({ title: `${data.imported || 0} products imported.` });
      await fetchProducts();
    } catch (err) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const downloadTemplate = () => {
    const csv = "name,description,category,price_info,notes";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nomii-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── AI import ── */
  const handleAiExtract = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiFallback(false);
    try {
      const data = await aiSuggestProducts(aiInput.trim());
      if (data.fallback) {
        setAiFallback(true);
        setAiError(null);
        setProposed(null);
      } else if (data.proposed && data.proposed.length > 0) {
        setProposed(data.proposed);
        const init = {};
        data.proposed.forEach((_, i) => (init[i] = true));
        setChecked(init);
      } else {
        setAiError("No products found. Try pasting a description instead.");
      }
    } catch (err) {
      setAiError(err.message || "Something went wrong.");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleCheck = (i) => setChecked((c) => ({ ...c, [i]: !c[i] }));

  const selectedItems = proposed ? proposed.filter((_, i) => checked[i]) : [];
  const selectedCount = selectedItems.length;

  const handleBulkSave = async () => {
    if (selectedCount === 0) return;
    setBulkSaving(true);
    try {
      const data = await bulkSaveProducts(selectedItems);
      toast({ title: `${data.saved || selectedCount} products added!` });
      resetAi();
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  const resetAi = () => {
    setProposed(null);
    setChecked({});
    setAiInput("");
    setAiError(null);
    setAiFallback(false);
  };

  /* ================================================================== */

  /* ── Saved summary view ── */
  if (showSavedSummary) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Products & Services</h2>
        <div className="rounded-xl p-5 mb-6 flex items-center gap-3" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)" }}>
          <CheckCircle2 size={20} style={{ color: "#4ADE80" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#4ADE80" }}>✓ Products saved</p>
            <p className="text-xs" style={{ color: "rgba(74,222,128,0.70)" }}>Your products are already configured.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSavedSummary(false)}
            className="text-sm font-semibold hover:opacity-70 transition-opacity"
            style={{ color: "#C9A84C" }}
          >
            Edit products →
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
      <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>
        What does your company offer?
      </h2>
      <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.40)" }}>
        Your AI agent will use this to answer customer questions about your products and services.
      </p>

      {/* ─── Section 1 — AI Import ─── */}
      {!proposed ? (
        <div
          className="rounded-xl p-6 mb-8"
          style={{
            border: "1.5px solid rgba(99,116,217,0.30)",
            background: "linear-gradient(135deg, rgba(99,116,217,0.08) 0%, rgba(79,109,205,0.05) 100%)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5" style={{ color: "#8B9EF5" }} />
            <span className="font-semibold text-base" style={{ color: "rgba(255,255,255,0.85)" }}>
              Import with AI
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            Enter a URL or describe what you sell — we'll extract your products and services automatically.
          </p>
          <div className="rounded-xl px-4 py-3 mb-4 text-[12px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", lineHeight: 1.7 }}>
            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>💡 For best results:</span> Link directly to your
            {" "}<span style={{ color: "#8B9EF5" }}>products page</span>,{" "}
            <span style={{ color: "#8B9EF5" }}>services page</span>, or
            {" "}<span style={{ color: "#8B9EF5" }}>pricing page</span> — not your homepage.
            If your site loads with JavaScript, paste a short description instead.
          </div>

          <input
            type="text"
            value={aiInput}
            onChange={(e) => {
              setAiInput(e.target.value);
              setAiError(null);
              setAiFallback(false);
            }}
            placeholder="yourcompany.com/products  —  or describe what you offer…"
            className={inp}
            style={inpStyle}
            disabled={aiLoading}
            onKeyDown={(e) => e.key === "Enter" && handleAiExtract()}
          />

          {/* fallback warning */}
          {aiFallback && (
            <div
              className="flex items-start gap-2.5 mt-4 rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.20)", color: "rgba(201,168,76,0.90)" }}
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#C9A84C" }} />
              <span>
                We couldn't extract much from that site — it may use JavaScript to load content. Try pasting a description of what you offer in the box above.
              </span>
            </div>
          )}

          {/* error */}
          {aiError && !aiFallback && (
            <p className="mt-3 text-sm" style={{ color: "#EF4444" }}>
              {aiError}
            </p>
          )}

          <button
            onClick={handleAiExtract}
            disabled={aiLoading || !aiInput.trim()}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 transition-all duration-200 hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, #6374d9 0%, #4f6dcd 100%)" }}
          >
            {aiLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Extract with AI
              </>
            )}
          </button>
        </div>
      ) : (
        /* ─── AI Preview / Review ─── */
        <div className="mb-8">
          {/* success banner */}
          <div
            className="flex items-center gap-2.5 rounded-lg px-4 py-3 mb-5 text-sm font-medium"
            style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)", color: "rgba(74,222,128,0.90)" }}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#10b981" }} />
            Found {proposed.length} products/services. Review them below and uncheck any you don't want.
          </div>

          {/* proposed list */}
          <div className="rounded-xl overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {proposed.map((p, i) => (
              <label
                key={i}
                className="flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-white/[0.03]"
                style={{ borderBottom: i < proposed.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
              >
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  onChange={() => toggleCheck(i)}
                  className="mt-1 h-4 w-4 accent-[#C9A84C] rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                      {p.name}
                    </span>
                    {p.category && (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}
                      >
                        {p.category}
                      </span>
                    )}
                    {p.price_info && (
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
                        {p.price_info}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.30)" }}>
                      {p.description}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleBulkSave}
              disabled={selectedCount === 0 || bulkSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 transition-all duration-200 hover:shadow-lg hover:shadow-[#1E3A5F]/20 group"
              style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7a 100%)" }}
            >
              {bulkSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save {selectedCount} selected product{selectedCount !== 1 ? "s" : ""}{" "}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
            <button onClick={resetAi} className="text-sm underline hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.40)" }}>
              Start over
            </button>
          </div>
        </div>
      )}

      {/* ─── Section 2 — Existing products table ─── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.70)" }}>
            Your Products
          </h3>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-[#1E3A5F]/20"
            style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7a 100%)" }}
          >
            {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "Add Product"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleAdd}
            className="rounded-xl p-5 mb-6 space-y-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                Name *
              </label>
              <input
                type="text"
                required
                maxLength={200}
                value={form.name}
                onChange={set("name")}
                placeholder="e.g. Premium Financial Plan"
                className={inp}
                style={inpStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                Description
              </label>
              <textarea
                rows={2}
                maxLength={1000}
                value={form.description}
                onChange={set("description")}
                placeholder="Briefly describe what this product or service does"
                className={inp}
                style={inpStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Category
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.category}
                  onChange={set("category")}
                  placeholder="e.g. Plans, Consulting"
                  className={inp}
                  style={inpStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Price / Cost Info
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={form.price_info}
                  onChange={set("price_info")}
                  placeholder="e.g. $99/mo, Free, Custom"
                  className={inp}
                  style={inpStyle}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                Notes
              </label>
              <input
                type="text"
                maxLength={500}
                value={form.notes}
                onChange={set("notes")}
                placeholder="Any extra details for your agent to know"
                className={inp}
                style={inpStyle}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-all duration-200 hover:opacity-90"
              style={{ backgroundColor: "#C9A84C" }}
            >
              {saving ? "Saving…" : "Save Product"}
            </button>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.30)" }}>
            No products yet. Use AI import above, add manually, or import via CSV.
          </p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Description</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const pid = p._id || p.id;
                  const isEditing = editingId === pid;
                  if (isEditing) {
                    return (
                      <tr key={pid} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(201,168,76,0.05)" }}>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.name} onChange={setEdit("name")} className={inp} style={{ ...inpStyle, padding: "6px 10px", fontSize: "13px" }} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.category} onChange={setEdit("category")} className={inp} style={{ ...inpStyle, padding: "6px 10px", fontSize: "13px" }} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.description} onChange={setEdit("description")} className={inp} style={{ ...inpStyle, padding: "6px 10px", fontSize: "13px" }} />
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button onClick={handleEditSave} disabled={editSaving} className="p-1 transition-colors hover:opacity-70 mr-1" style={{ color: "#4ADE80" }} title="Save">
                            {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button onClick={cancelEdit} className="p-1 transition-colors hover:opacity-70" style={{ color: "rgba(255,255,255,0.40)" }} title="Cancel">
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={pid} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "rgba(255,255,255,0.80)" }}>{p.name}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.40)" }}>{p.category || "—"}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" style={{ color: "rgba(255,255,255,0.40)" }}>{p.description || "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(p)} className="p-1 transition-colors hover:opacity-70 mr-1" style={{ color: "rgba(255,255,255,0.40)" }} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(pid)} className="p-1 transition-colors hover:opacity-70" style={{ color: "#F87171" }} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Section 3 — CSV Import ─── */}
      <div className="rounded-xl p-6 text-center mb-6" style={{ border: "2px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}>
        <p className="text-sm mb-2" style={{ color: "rgba(255,255,255,0.40)" }}>Or import from CSV</p>
        <label
          className="inline-block px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer text-white transition-all duration-200 hover:shadow-lg hover:shadow-[#1E3A5F]/20"
          style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7a 100%)" }}
        >
          {uploading ? "Importing…" : "Choose CSV File"}
          <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={uploading} />
        </label>
        <p className="mt-3">
          <button onClick={downloadTemplate} className="text-xs underline" style={{ color: "#C9A84C" }}>
            <Download className="inline h-3 w-3 mr-1" />Download template
          </button>
        </p>
      </div>

      {/* ─── Continue / Skip ─── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => advance(stepIndex)}
          disabled={products.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-40 hover:shadow-lg hover:shadow-[#1E3A5F]/20 group"
          style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2a4f7a 100%)" }}
        >
          Continue
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
        <button
          onClick={() => advance(stepIndex)}
          className="text-sm underline hover:opacity-70 transition-opacity"
          style={{ color: "rgba(255,255,255,0.40)" }}
        >
          Skip this step →
        </button>
      </div>
    </div>
  );
};

export default Step2Products;
