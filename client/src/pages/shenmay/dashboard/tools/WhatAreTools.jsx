import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";

export default function WhatAreTools() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 rounded-xl overflow-hidden"
      style={{ background: "rgba(15,95,92,0.05)", border: "1px solid rgba(15,95,92,0.15)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-2.5">
          <HelpCircle size={15} style={{ color: "#0F5F5C" }} />
          <span className="text-sm font-medium" style={{ color: "#0F5F5C" }}>
            What are tools, and do I need them?
          </span>
        </div>
        <ChevronDown size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "rgba(15,95,92,0.60)" }} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          <div className="space-y-3 text-sm" style={{ color: "#6B6B64" }}>
            <p>By default your AI can chat — but it's working from memory alone.
               Tools give it the ability to take real actions in real time.</p>
            <p>Think of it this way: without tools your AI is a helpful colleague who can
               answer general questions. With tools it can open your actual records, run
               numbers, and flag anything that needs a real person — instantly.</p>
            <p>You don't need to be technical. Pick what you want, describe when to do it
               in plain English, and you're done. Your AI reads your description to decide
               when to act.</p>
          </div>
        </div>
      )}
    </div>
  );
}
