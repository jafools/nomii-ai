/**
 * ShenmayTools — AI Tool Builder
 *
 * Lets non-technical users create, understand, and manage AI tools
 * without writing any code. Every piece of copy is in plain English.
 *
 * Features:
 *  - 3-step creation wizard with progress dots
 *  - Per-type plain-English explanation in wizard step 1
 *  - Example trigger shown as a contextual hint in step 2
 *  - Enable / disable toggle per tool (non-destructive)
 *  - Test connection button for connect-type tools
 *  - Toast notifications on every mutation
 *  - Paused tools shown in a collapsible section
 *
 * Split into per-component files under ./tools/ (dad-polish Phase 2).
 * This container owns shared state (tools list, modal visibility) and
 * composes the presentational pieces.
 */

import { useState, useEffect } from "react";
import { getTools, getToolTypes, createTool, updateTool, deleteTool } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Plus, ChevronDown } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Button } from "@/components/shenmay/ui/ShenmayUI";

import { Spinner, ErrorBanner } from "./tools/_primitives";
import CreateToolModal from "./tools/CreateToolModal";
import EditToolModal   from "./tools/EditToolModal";
import ConfirmDelete   from "./tools/ConfirmDelete";
import ToolCard        from "./tools/ToolCard";
import EmptyState      from "./tools/EmptyState";
import WhatAreTools    from "./tools/WhatAreTools";

export default function ShenmayTools() {
  const [tools, setTools]               = useState([]);
  const [toolTypes, setToolTypes]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [toggling, setToggling]         = useState(null); // id of tool being toggled
  const [showPaused, setShowPaused]     = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [toolsRes, typesRes] = await Promise.all([getTools(), getToolTypes()]);
      setTools(toolsRes.tools || []);
      setToolTypes(typesRes.tool_types || []);
    } catch {
      setError("Couldn't load your tools. Please refresh the page.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data) {
    const res = await createTool(data);
    setTools(prev => [...prev, res.tool]);
    toast({ title: "Tool added", description: `"${res.tool.display_name}" is now active.` });
  }

  async function handleUpdate(id, data) {
    const res = await updateTool(id, data);
    setTools(prev => prev.map(t => t.id === id ? res.tool : t));
    toast({ title: "Changes saved" });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTool(deleteTarget.id);
      const name = deleteTarget.display_name;
      setTools(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "Tool removed", description: `"${name}" has been removed.` });
    } catch {
      toast({ title: "Couldn't remove tool", variant: "destructive" });
    } finally { setDeleting(false); }
  }

  async function handleToggle(tool) {
    const newState = tool.is_active === false ? true : false;
    setToggling(tool.id);
    try {
      const res = await updateTool(tool.id, { is_active: newState });
      setTools(prev => prev.map(t => t.id === tool.id ? res.tool : t));
      toast({
        title: newState ? "Tool resumed" : "Tool paused",
        description: `"${tool.display_name}" is now ${newState ? "active" : "paused"}.`,
      });
    } catch {
      toast({ title: "Couldn't update tool", variant: "destructive" });
    } finally { setToggling(null); }
  }

  const activeTools = tools.filter(t => t.is_active !== false);
  const pausedTools = tools.filter(t => t.is_active === false);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <Kicker>Capabilities</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>AI tools.</Display>
          <Lede>
            Give your agent real abilities — beyond just chatting.
            {activeTools.length > 0 && <span style={{ color: T.mute }}> · {activeTools.length} active</span>}
          </Lede>
        </div>
        {tools.length > 0 && (
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New tool
          </Button>
        )}
      </div>

      <WhatAreTools />

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Spinner />
          <span className="text-sm" style={{ color: "#6B6B64" }}>
            Loading your tools…
          </span>
        </div>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : tools.length === 0 ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : (
        <>
          {/* Active tools */}
          {activeTools.length === 0 && (
            <p className="text-sm mb-4 text-center py-8"
              style={{ color: "#6B6B64" }}>
              All tools are currently paused. Resume a tool to let your AI use it again.
            </p>
          )}
          <div className="space-y-3">
            {activeTools.map(tool => (
              <ToolCard key={tool.id} tool={tool}
                onEdit={setEditTarget} onDelete={setDeleteTarget}
                onToggle={handleToggle} toggling={toggling} />
            ))}
          </div>

          {/* Paused tools collapsible */}
          {pausedTools.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowPaused(v => !v)}
                className="flex items-center gap-2 text-[12px] font-medium mb-3 hover:opacity-80 transition-opacity"
                style={{ color: "#6B6B64" }}
              >
                <ChevronDown size={13}
                  className={`transition-transform duration-200 ${showPaused ? "rotate-180" : ""}`} />
                {pausedTools.length} paused {pausedTools.length === 1 ? "tool" : "tools"}
              </button>
              {showPaused && (
                <div className="space-y-3">
                  {pausedTools.map(tool => (
                    <ToolCard key={tool.id} tool={tool}
                      onEdit={setEditTarget} onDelete={setDeleteTarget}
                      onToggle={handleToggle} toggling={toggling} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateToolModal toolTypes={toolTypes}
          onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
      {editTarget && (
        <EditToolModal tool={editTarget} toolTypes={toolTypes}
          onClose={() => setEditTarget(null)} onSave={handleUpdate} />
      )}
      {deleteTarget && (
        <ConfirmDelete tool={deleteTarget} deleting={deleting}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
