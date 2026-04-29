// Shared inline styles used across the settings sections.
// Extracted from ShenmaySettings.jsx during the per-section split.
export const card = { background: "#EDE7D7", border: "1px solid #EDE7D7" };
export const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(15,95,92,0.3)]";
// Inputs sit on a paperDeep card, so they need a contrasting bg + a visible
// hairline border. Previously both were paperDeep — same colour as the card
// — which rendered the input fields invisible until focus added the ring.
// Match the canonical ShenmayUI <Input/> styling (white + paperEdge border).
export const inputStyle = { background: "#FFFFFF", border: "1px solid #D8D0BD", color: "#1A1D1A" };
