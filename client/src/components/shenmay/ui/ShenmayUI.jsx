/**
 * Shenmay Direction B — shared UI primitives.
 *
 * Kept as a single file (not one-per-component) because these are small,
 * cohesive, and co-evolve. Each primitive owns its visual contract via
 * inline styles so it doesn't fight the LOCKED index.css corp tokens.
 *
 * Palette constants live here too — page-level code can import { TOKENS }
 * from this file to stay in sync with the primitives.
 */
import React from "react";

export const TOKENS = {
  ink:       "#1A1D1A",
  inkSoft:   "#3A3D39",
  paper:     "#F5F1E8",
  paperDeep: "#EDE7D7",
  paperEdge: "#D8D0BD",
  mute:      "#6B6B64",
  teal:      "#0F5F5C",
  tealDark:  "#083A38",
  tealLight: "#84C7C4",
  success:   "#2D6A4F",
  danger:    "#7A1F1A",
  warning:   "#A6660E",
  mono:      "ui-monospace, Menlo, monospace",
  sans:      "'Inter', system-ui, -apple-system, sans-serif",
};

const T = TOKENS;

// ── Kicker ───────────────────────────────────────────────────────────
export function Kicker({ children, color, style, ...rest }) {
  return (
    <span
      {...rest}
      style={{
        fontFamily: T.mono,
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color || T.teal,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ── Display heading (italic + tight) ─────────────────────────────────
export function Display({ children, size = 36, italic = true, roman, style, as: As = "h1", ...rest }) {
  return (
    <As
      {...rest}
      style={{
        fontFamily: T.sans,
        fontWeight: italic ? 300 : 500,
        fontStyle: italic ? "italic" : "normal",
        fontSize: size,
        letterSpacing: "-0.04em",
        color: T.ink,
        lineHeight: 1.05,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </As>
  );
}

// ── Body copy ────────────────────────────────────────────────────────
export function Lede({ children, style, ...rest }) {
  return (
    <p
      {...rest}
      style={{ fontFamily: T.sans, fontSize: 15, color: T.mute, marginTop: 12, lineHeight: 1.55, letterSpacing: "-0.005em", ...style }}
    >
      {children}
    </p>
  );
}

// ── Input ────────────────────────────────────────────────────────────
export function Field({ id, label, right, hint, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <label htmlFor={id}>
          <Kicker color={T.mute}>{label}</Kicker>
        </label>
        {right}
      </div>
      {children}
      {hint && <div style={{ fontSize: 12, color: T.mute, marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  fontFamily: T.sans,
  fontSize: 15,
  letterSpacing: "-0.01em",
  color: T.ink,
  background: "#FFFFFF",
  border: `1px solid ${T.paperEdge}`,
  borderRadius: 6,
  outline: "none",
  transition: "border-color 180ms ease, box-shadow 180ms ease",
};

export const inputFocusHandlers = {
  onFocus: (e) => {
    e.currentTarget.style.borderColor = T.ink;
    e.currentTarget.style.boxShadow = `0 0 0 3px ${T.teal}1F`;
  },
  onBlur: (e) => {
    e.currentTarget.style.borderColor = T.paperEdge;
    e.currentTarget.style.boxShadow = "none";
  },
};

export function Input({ id, ...rest }) {
  return <input id={id} {...inputFocusHandlers} {...rest} style={{ ...inputStyle, ...(rest.style || {}) }} />;
}

export function Textarea({ id, ...rest }) {
  return <textarea id={id} {...inputFocusHandlers} {...rest} style={{ ...inputStyle, minHeight: 92, resize: "vertical", ...(rest.style || {}) }} />;
}

export function Select({ id, ...rest }) {
  return <select id={id} {...inputFocusHandlers} {...rest} style={{ ...inputStyle, appearance: "auto", ...(rest.style || {}) }} />;
}

// ── Buttons ──────────────────────────────────────────────────────────
/**
 * variant:
 *   primary  — ink bg, paper text (default primary CTA)
 *   teal     — teal bg, paper text (featured / paid CTA)
 *   ghost    — transparent bg, ink text, paper-edge border
 *   linky    — zero chrome, teal underline on hover
 *   danger   — soft warm-red, inked text
 */
export function Button({ variant = "primary", size = "md", children, style, ...rest }) {
  const sizes = {
    sm: { padding: "8px 14px", fontSize: 13 },
    md: { padding: "12px 18px", fontSize: 14 },
    lg: { padding: "14px 22px", fontSize: 15 },
  };

  const variants = {
    primary: { background: T.ink,       color: T.paper, border: `1px solid ${T.ink}`, hoverBg: T.tealDark, hoverBorder: T.tealDark },
    teal:    { background: T.teal,      color: T.paper, border: `1px solid ${T.teal}`, hoverBg: T.tealDark, hoverBorder: T.tealDark },
    ghost:   { background: "transparent", color: T.ink,  border: `1px solid ${T.paperEdge}`, hoverBg: T.paperDeep, hoverBorder: T.ink },
    linky:   { background: "transparent", color: T.teal, border: "1px solid transparent", hoverBg: "transparent", hoverBorder: "transparent", underline: true },
    danger:  { background: "#F3E8E4",    color: T.danger, border: `1px solid ${T.danger}33`, hoverBg: "#EEDDD8", hoverBorder: `${T.danger}55` },
  };

  const v = variants[variant];
  const s = sizes[size];

  return (
    <button
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: T.sans,
        fontWeight: 500,
        letterSpacing: "0.01em",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        borderRadius: 6,
        transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
        textDecoration: variant === "linky" ? "underline" : "none",
        textDecorationColor: variant === "linky" ? `${T.teal}55` : "none",
        textUnderlineOffset: "3px",
        ...s,
        background: v.background,
        color: v.color,
        border: v.border,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (rest.disabled) return;
        e.currentTarget.style.background = v.hoverBg;
        e.currentTarget.style.borderColor = v.hoverBorder;
      }}
      onMouseLeave={(e) => {
        if (rest.disabled) return;
        e.currentTarget.style.background = v.background;
        e.currentTarget.style.borderColor = v.border.split(" ").pop();
      }}
    >
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────
export function Card({ children, style, featured, as: As = "div", ...rest }) {
  return (
    <As
      {...rest}
      style={{
        background: featured ? T.paperDeep : "#FFFFFF",
        border: `1px solid ${T.paperEdge}`,
        borderRadius: 12,
        padding: 24,
        boxShadow: featured
          ? `0 1px 0 rgba(26,29,26,0.04), 0 8px 24px -12px rgba(26,29,26,0.12)`
          : "0 1px 0 rgba(26,29,26,0.03)",
        ...style,
      }}
    >
      {children}
    </As>
  );
}

// ── Notice / Callout (teal / danger / success tone variants) ─────────
export function Notice({ tone = "teal", icon: Icon, children, style }) {
  const tones = {
    teal:    { bg: "#F1EEDF", border: T.paperEdge,  iconColor: T.tealDark, textColor: T.inkSoft },
    success: { bg: "#EBF1E9", border: "#CDDCCA",    iconColor: T.success, textColor: "#1E4636" },
    warning: { bg: "#F6EEDC", border: "#E5D3A8",    iconColor: T.warning, textColor: "#6B4817" },
    danger:  { bg: "#F3E8E4", border: `${T.danger}33`, iconColor: T.danger, textColor: T.danger },
  };
  const t = tones[tone];
  return (
    <div style={{ padding: "14px 16px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, display: "flex", gap: 12, alignItems: "flex-start", ...style }}>
      {Icon && <Icon size={18} color={t.iconColor} style={{ marginTop: 1, flexShrink: 0 }} />}
      <div style={{ fontSize: 14, color: t.textColor, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

// ── Divider (editorial hairline) ─────────────────────────────────────
export function Divider({ label, style }) {
  if (label) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "32px 0", ...style }}>
        <div style={{ flex: 1, height: 1, background: T.paperEdge }} />
        <Kicker color={T.mute}>{label}</Kicker>
        <div style={{ flex: 1, height: 1, background: T.paperEdge }} />
      </div>
    );
  }
  return <div style={{ height: 1, background: T.paperEdge, margin: "24px 0", ...style }} />;
}

// ── Page scaffold (full-page paper bg with optional editorial aside) ─
export function PageShell({ children, style }) {
  return (
    <div
      className="shenmay-scope"
      style={{
        minHeight: "100vh",
        background: T.paper,
        color: T.ink,
        fontFamily: T.sans,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
