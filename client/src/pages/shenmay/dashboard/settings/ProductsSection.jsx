import { useState, useEffect } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { getMe, updateCompany, updatePrivacySettings, updateAnonymousOnlyMode, getProducts, addProduct, updateProduct, deleteProduct, getDataApiKey, generateDataApiKey, revokeDataApiKey, getAgentSoul, generateSoul, getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getLabels, createLabel, updateLabel, deleteLabel, getConnectors, updateConnectors, testSlack, testTeams, getEmailTemplates, updateEmailTemplates } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, Plus, Trash2, Pencil, X, ChevronUp, Key, AlertTriangle, RefreshCw, Eye, EyeOff, Brain, Sparkles, Shield, MessageSquare, Webhook, ToggleLeft, ToggleRight, Send, ChevronDown, Tag, Plug2, Zap, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { TOKENS as T, Kicker, Display, Lede } from "@/components/shenmay/ui/ShenmayUI";

const INDUSTRIES = [
  { value: "financial", label: "Financial" },
  { value: "retirement", label: "Retirement" },
  { value: "ministry", label: "Ministry" },
  { value: "healthcare", label: "Healthcare" },
  { value: "insurance", label: "Insurance" },
  { value: "education", label: "Education" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "other", label: "Other" },
];


import { card, inputClass, inputStyle } from "./_shared";

const ProductsSection = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", price_info: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "", price_info: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data.products || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setEdit = (field) => (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));

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

  const startEdit = (p) => {
    setEditingId(p._id || p.id);
    setEditForm({ name: p.name || "", description: p.description || "", category: p.category || "", price_info: p.price_info || "", notes: p.notes || "" });
  };

  const cancelEdit = () => { setEditingId(null); };

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

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#3A3D39]">Products & Services</h3>
        <button onClick={() => { setShowForm((v) => !v); cancelEdit(); }} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
          {showForm ? <><ChevronUp className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> Add Product</>}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl p-5 space-y-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Name *</label>
            <input type="text" required maxLength={200} value={form.name} onChange={set("name")} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Description</label>
            <textarea rows={2} maxLength={1000} value={form.description} onChange={set("description")} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Category</label>
              <input type="text" maxLength={100} value={form.category} onChange={set("category")} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Price Info</label>
              <input type="text" maxLength={100} value={form.price_info} onChange={set("price_info")} className={inputClass} style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
            {saving ? "Saving…" : "Save Product"}
          </button>
        </form>
      )}

      {/* Product cards */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl" style={{ background: "#EDE7D7" }} />)}
        </div>
      ) : products.length === 0 ? (
        <p className="text-sm text-[#6B6B64] py-4">No products yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const pid = p._id || p.id;
            const isEditing = editingId === pid;

            if (isEditing) {
              return (
                <div key={pid} className="rounded-xl p-5 space-y-3" style={{ background: "rgba(15,95,92,0.04)", border: "1px solid rgba(15,95,92,0.15)" }}>
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B64] mb-1">Name *</label>
                    <input type="text" required value={editForm.name} onChange={setEdit("name")} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B6B64] mb-1">Description</label>
                    <textarea rows={2} value={editForm.description} onChange={setEdit("description")} className={inputClass} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-[#6B6B64] mb-1">Category</label>
                      <input type="text" value={editForm.category} onChange={setEdit("category")} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#6B6B64] mb-1">Price Info</label>
                      <input type="text" value={editForm.price_info} onChange={setEdit("price_info")} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={handleEditSave} disabled={editSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
                      {editSaving ? "Saving…" : <><Check size={14} /> Save</>}
                    </button>
                    <button onClick={cancelEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #EDE7D7", color: "#6B6B64" }}>
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={pid} className="rounded-xl p-4 flex items-start gap-4 transition-colors hover:bg-white/[0.01]" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-[#3A3D39]">{p.name}</p>
                    {p.category && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(15,95,92,0.1)", color: "#0F5F5C" }}>{p.category}</span>
                    )}
                  </div>
                  {p.description && <p className="text-[12px] text-[#6B6B64] line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg transition-colors hover:bg-[#F5F1E8]" style={{ color: "#6B6B64" }} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(pid)} className="p-1.5 rounded-lg transition-colors hover:bg-[#F5F1E8]" style={{ color: "#7A1F1A" }} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductsSection;
