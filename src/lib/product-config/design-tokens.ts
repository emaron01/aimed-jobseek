/**
 * Seeker-facing design tokens. Colors, type, space, radii, and shadows
 * live here. Components use the matching CSS variables / Tailwind theme
 * names — never raw hex, rgb, or palette classes.
 */
export const designTokens = Object.freeze({
  color: {
    ink: "#0B1220",
    onInk: "#FFFFFF",
    nav: "#163A7A",
    onNav: "#FFFFFF",
    primary: "#1D4ED8",
    primaryHover: "#1E40AF",
    onPrimary: "#FFFFFF",
    success: "#166534",
    successTint: "#DCFCE7",
    danger: "#991B1B",
    dangerTint: "#FEE2E2",
    warning: "#92400E",
    warningTint: "#FEF3C7",
    canvas: "#F8FAFC",
    surface: "#FFFFFF",
    muted: "#475569",
    subtle: "#64748B",
    edge: "#E2E8F0",
    edgeStrong: "#CBD5E1",
    focus: "#1D4ED8",
    overlay: "#0B122066",
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    display: "1.5rem",
  },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
  },
  radius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    full: "9999px",
  },
  shadow: {
    sm: "0 1px 2px 0 rgb(11 18 32 / 0.06)",
    md: "0 8px 24px -12px rgb(11 18 32 / 0.18)",
  },
});

export const tokenContrastPairs = Object.freeze([
  { name: "white on ink headings", fg: designTokens.color.onInk, bg: designTokens.color.ink },
  { name: "white on nav", fg: designTokens.color.onNav, bg: designTokens.color.nav },
  { name: "ink on selected nav", fg: designTokens.color.ink, bg: designTokens.color.surface },
  { name: "white on primary", fg: designTokens.color.onPrimary, bg: designTokens.color.primary },
  { name: "ink on surface", fg: designTokens.color.ink, bg: designTokens.color.surface },
  { name: "muted on surface", fg: designTokens.color.muted, bg: designTokens.color.surface },
  { name: "primary on surface", fg: designTokens.color.primary, bg: designTokens.color.surface },
  { name: "success on success tint", fg: designTokens.color.success, bg: designTokens.color.successTint },
  { name: "danger on danger tint", fg: designTokens.color.danger, bg: designTokens.color.dangerTint },
  { name: "white on danger", fg: designTokens.color.onInk, bg: designTokens.color.danger },
  { name: "warning on warning tint", fg: designTokens.color.warning, bg: designTokens.color.warningTint },
  { name: "ink on canvas", fg: designTokens.color.ink, bg: designTokens.color.canvas },
] as const);

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Design token hex is invalid: ${hex}`);
  }
  const n = Number.parseInt(normalized, 16);
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_NORMAL_TEXT = 4.5;
