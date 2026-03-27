/**
 * LogoMark — the Custody Atlas icon mark as a crisp inline SVG.
 *
 * Design rationale:
 *   - Shield shape: clean five-sided form, flat top, pointed base.
 *   - Scales of justice: gold horizontal beam + white center column +
 *     white pendant arms + white balance pans. Exactly 7 SVG elements.
 *   - Flat only — no gradients, no shadows, no stroke on the shield.
 *   - Works on any background via the `variant` prop.
 *
 * Variants:
 *   "color"   — navy shield, gold beam, white scales. Use on white/light bg.
 *   "onDark"  — slate-800 shield (lifts from dark nav), gold beam, white scales.
 *               Use on the dark (#0f172a) navbar.
 *   "mono"    — all-navy shield, no gold, slate scales. Use for print / emboss.
 *
 * Usage:
 *   <LogoMark size={32} />                    // color, 32 px
 *   <LogoMark size={32} variant="onDark" />   // navbar
 *   <LogoMark size={48} variant="mono" />     // monochrome
 */

type LogoVariant = "color" | "onDark" | "mono";

interface LogoMarkProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}

const SHIELD = {
  color:  "#0f172a",
  onDark: "#1e293b",   // slate-800 — just enough lift from the #0f172a nav
  mono:   "#0f172a",
};

const BEAM = {
  color:  "#b5922f",              // muted gold — on white, full saturation reads cleanly
  onDark: "rgba(181,146,47,0.7)", // same gold, 70% opacity — integrates without competing
  mono:   "#334155",              // slate-700
};

const SCALES = {
  color:  "rgba(255,255,255,0.92)",
  onDark: "rgba(255,255,255,0.90)",
  mono:   "#475569",   // slate-600
};

export function LogoMark({ size = 32, variant = "color", className }: LogoMarkProps) {
  const shield = SHIELD[variant];
  const beam   = BEAM[variant];
  const scales = SCALES[variant];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* ── Shield ── */}
      <path
        d="M16 2L29 7V20C29 26.5 16 31.5 16 31.5C16 31.5 3 26.5 3 20V7L16 2Z"
        fill={shield}
      />

      {/* ── Gold balance beam ── */}
      <line
        x1="8.5" y1="14.5"
        x2="23.5" y2="14.5"
        stroke={beam}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* ── Center column (fulcrum stem) ── */}
      <line
        x1="16" y1="14.5"
        x2="16" y2="21"
        stroke={scales}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* ── Left pendant arm ── */}
      <line
        x1="9" y1="14.5"
        x2="9" y2="19"
        stroke={scales}
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* ── Right pendant arm ── */}
      <line
        x1="23" y1="14.5"
        x2="23" y2="19"
        stroke={scales}
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* ── Left balance pan ── */}
      <line
        x1="7" y1="19"
        x2="11" y2="19"
        stroke={scales}
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* ── Right balance pan ── */}
      <line
        x1="21" y1="19"
        x2="25" y2="19"
        stroke={scales}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * LogoLockup — icon + wordmark side-by-side.
 * Provides the full "Custody Atlas" brand mark as one component.
 */
interface LogoLockupProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
  textClassName?: string;
}

export function LogoLockup({
  size = 28,
  variant = "color",
  className = "",
  textClassName = "",
}: LogoLockupProps) {
  const textColor =
    variant === "mono"   ? "#0f172a" :
    variant === "onDark" ? "white"   :
    "#0f172a";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} variant={variant} />
      <span
        className={`font-semibold tracking-tight leading-none ${textClassName}`}
        style={{ color: textColor, fontSize: size * 0.5 }}
      >
        Custody Atlas
      </span>
    </span>
  );
}
