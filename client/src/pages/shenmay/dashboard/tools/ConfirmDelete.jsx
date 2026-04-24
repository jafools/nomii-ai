import { Trash2 } from "lucide-react";
import { Spinner } from "./_primitives";

export default function ConfirmDelete({ tool, onConfirm, onCancel, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(122,31,26,0.10)", border: "1px solid rgba(122,31,26,0.20)" }}>
          <Trash2 size={22} style={{ color: "#7A1F1A" }} />
        </div>
        <h3 className="text-base font-semibold mb-2" style={{ color: "#1A1D1A" }}>
          Remove "{tool.display_name}"?
        </h3>
        <p className="text-sm mb-1" style={{ color: "#6B6B64" }}>
          Your AI will stop using this tool. Your existing data is unaffected.
        </p>
        <p className="text-[12px] mb-6" style={{ color: "#6B6B64" }}>
          Tip: you can also just pause the tool temporarily using the toggle.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-[#F5F1E8]"
            style={{ borderColor: "#D8D0BD", color: "#3A3D39" }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "rgba(122,31,26,0.15)", color: "#7A1F1A", border: "1px solid rgba(122,31,26,0.25)" }}>
            {deleting ? <Spinner size={14} /> : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
