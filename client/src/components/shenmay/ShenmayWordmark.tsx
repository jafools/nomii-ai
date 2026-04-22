/**
 * ShenmayWordmark — the split wordmark: "Shen · may AI".
 *
 * Ported from the Direction B handoff that shipped on pontensolutions.com
 * Apr 22, 2026. Keep this component pixel-identical to the marketing version
 * so the corp site and SaaS app feel visually continuous.
 *
 * - "Shen" is light italic (feminine, inviting)
 * - Teal dot pivots between the two halves (same graphic role as the dot in "Känn · Mig")
 * - "may" is medium roman (confident)
 * - "AI" is tiny monospace uppercase, raised like a superscript
 */
interface ShenmayWordmarkProps {
  size?: number;
  ink?: string;
  teal?: string;
  mute?: string;
  showAI?: boolean;
}

const ShenmayWordmark = ({
  size = 22,
  ink = "#1A1D1A",
  teal = "#0F5F5C",
  mute = "#6B6B64",
  showAI = true,
}: ShenmayWordmarkProps) => {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: size * 0.18,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 300,
        fontSize: size,
        letterSpacing: size * -0.045,
        color: ink,
        lineHeight: 1,
        fontStyle: "italic",
      }}
    >
      <span>Shen</span>
      <span
        style={{
          display: "inline-block",
          width: size * 0.14,
          height: size * 0.14,
          borderRadius: "50%",
          background: teal,
          transform: `translateY(-${size * 0.01}px)`,
        }}
      />
      <span style={{ fontWeight: 500, fontStyle: "normal" }}>may</span>
      {showAI && (
        <span
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: size * 0.28,
            fontWeight: 400,
            letterSpacing: size * 0.04,
            color: mute,
            fontStyle: "normal",
            marginLeft: size * 0.14,
            textTransform: "uppercase",
            transform: `translateY(-${size * 0.12}px)`,
            display: "inline-block",
          }}
        >
          AI
        </span>
      )}
    </span>
  );
};

export default ShenmayWordmark;
