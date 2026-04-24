import { useState } from "react";
import {
  Pencil, Trash2, Loader2, FlaskConical,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { TYPE_STYLE, TYPE_EMOJI } from "./_shared";
import { ToolTypeBadge } from "./_primitives";
import TestModal from "./TestModal";

export default function ToolCard({ tool, onEdit, onDelete, onToggle, toggling }) {
  const s        = TYPE_STYLE[tool.tool_type] || TYPE_STYLE.lookup;
  const isActive = tool.is_active !== false;
  const [showTestModal, setShowTestModal] = useState(false);

  return (
    <div className="rounded-xl p-5 transition-all duration-200"
      style={{
        background: isActive ? "#EDE7D7" : "rgba(255,255,255,0.015)",
        border: `1px solid ${isActive ? "#EDE7D7" : "#EDE7D7"}`,
        opacity: isActive ? 1 : 0.65,
      }}
      onMouseEnter={e => isActive && (e.currentTarget.style.borderColor = s.border)}
      onMouseLeave={e => e.currentTarget.style.borderColor = isActive ? "#EDE7D7" : "#EDE7D7"}
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
              <span className="text-sm font-semibold" style={{ color: "#1A1D1A" }}>
                {tool.display_name}
              </span>
              <ToolTypeBadge type={tool.tool_type} />
              {!isActive && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "#EDE7D7", color: "#6B6B64" }}>
                  PAUSED
                </span>
              )}
            </div>
            <p className="text-[12px] leading-relaxed line-clamp-2"
              style={{ color: "#6B6B64" }}>
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
            className="p-2 rounded-lg transition-colors hover:bg-[#EDE7D7] disabled:opacity-50"
            title={isActive ? "Pause this tool" : "Resume this tool"}>
            {toggling === tool.id
              ? <Loader2 size={16} className="animate-spin" style={{ color: "#6B6B64" }} />
              : isActive
                ? <ToggleRight size={18} style={{ color: "#10B981" }} />
                : <ToggleLeft  size={18} style={{ color: "#6B6B64" }} />}
          </button>
          {/* Edit */}
          <button onClick={() => onEdit(tool)}
            className="p-2 rounded-lg transition-colors hover:bg-[#EDE7D7]" title="Edit">
            <Pencil size={14} style={{ color: "#6B6B64" }} />
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
