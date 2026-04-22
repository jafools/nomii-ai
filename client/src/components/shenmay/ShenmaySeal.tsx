/**
 * ShenmaySeal — circular editorial stamp used in the hero / top-right corners.
 * Monogram ("S·m") inside an ink square, with "SHENMAY AI · KÄNN MIG · KNOW ME"
 * wrapping the rim.
 *
 * Ported from the Direction B handoff (pontensolutions.com, Apr 22 2026).
 */
import { useId } from "react";

interface ShenmaySealProps {
  size?: number;
  ink?: string;
  paper?: string;
  teal?: string;
}

const ShenmaySeal = ({
  size = 120,
  ink = "#1A1D1A",
  paper = "#F5F1E8",
  teal = "#0F5F5C",
}: ShenmaySealProps) => {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <path id={`seal-arc-${id}`} d="M 80,80 m -62,0 a 62,62 0 1,1 124,0 a 62,62 0 1,1 -124,0" fill="none" />
      </defs>
      <circle cx="80" cy="80" r="76" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.5" />
      <circle cx="80" cy="80" r="68" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.3" />
      <text fontFamily="ui-monospace, Menlo, monospace" fontSize="9.5" letterSpacing="4" fill={ink} opacity="0.75">
        <textPath href={`#seal-arc-${id}`} startOffset="0%">
          SHENMAY AI · KÄNN MIG · KNOW ME · SHENMAY AI · KÄNN MIG · KNOW ME ·
        </textPath>
      </text>
      <rect x="48" y="48" width="64" height="64" rx="6" fill={ink} />
      <text
        x="57"
        y="90"
        fontFamily="Inter, sans-serif"
        fontSize="28"
        fontWeight="300"
        fontStyle="italic"
        fill={paper}
        letterSpacing="-1"
      >
        S
      </text>
      <circle cx="80" cy="82" r="2.8" fill={teal} />
      <text
        x="84"
        y="90"
        fontFamily="Inter, sans-serif"
        fontSize="28"
        fontWeight="500"
        fill={paper}
        letterSpacing="-1"
      >
        m
      </text>
    </svg>
  );
};

export default ShenmaySeal;
