/**
 * Shared constants + pure utilities for the Tools surface.
 *
 * Split out of ShenmayTools.jsx (dad-polish Phase 2). Pure JS — no JSX, no
 * react imports, so anything in here is safe to tree-shake or reuse.
 */

import { Search, Calculator, FileText, Users, Zap } from "lucide-react";

// ── Colour + icon map for each tool type ────────────────────────────────────
export const TYPE_STYLE = {
  lookup:    { color: "#0F5F5C", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.22)",  icon: Search      },
  calculate: { color: "#10B981", bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.22)",  icon: Calculator  },
  report:    { color: "#0F5F5C", bg: "rgba(15,95,92,0.10)",    border: "rgba(15,95,92,0.22)",    icon: FileText    },
  escalate:  { color: "#7A1F1A", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.22)", icon: Users       },
  connect:   { color: "#A78BFA", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.22)", icon: Zap         },
};

export const TYPE_EMOJI = { lookup: "🔍", calculate: "📊", report: "📄", escalate: "🙋", connect: "🔗" };

// ── Turn a human tool name into a safe DB `name` ────────────────────────────
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9 _]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 64) || "my_tool";
}
