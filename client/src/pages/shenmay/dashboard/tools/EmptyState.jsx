import { Plus } from "lucide-react";

export default function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5 text-3xl"
        style={{ background: "rgba(15,95,92,0.08)", border: "1px solid rgba(15,95,92,0.15)" }}>
        🔧
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: "#1A1D1A" }}>
        Your AI has no tools yet
      </h3>
      <p className="text-sm max-w-xs mb-2" style={{ color: "#6B6B64" }}>
        Tools let your AI do more than just chat — look up real client data, run
        calculations, write reports, and know when to involve your team.
      </p>
      <p className="text-sm max-w-xs mb-8" style={{ color: "#6B6B64" }}>
        No coding required. Describe what you want in plain English and you're done.
      </p>
      <button onClick={onAdd}
        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-[#0F5F5C]/15"
        style={{ background: "linear-gradient(135deg, #0F5F5C 0%, #083A38 100%)", color: "#F5F1E8" }}>
        <Plus size={16} /> Add your first tool
      </button>
    </div>
  );
}
