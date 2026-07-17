/**
 * WCAG contrast helpers.
 *
 * Used where a background color comes from user/event data (calendar event
 * colors, etc.) and we must pick a foreground that stays legible - the axe
 * color-contrast scan fails serious violations, so a fixed light text color on
 * an arbitrary user-chosen hue is not safe.
 *
 * Parsing and relative-luminance math are reused from color-transform.ts so
 * hex / rgb / hsl inputs are all handled the same way as the dark-mode logic.
 */
import { parseColor, getLuminance } from './color-transform';

/** Near-black foreground. Softer than pure #000 but still maximal contrast. */
export const FOREGROUND_DARK = '#1a1a1a';
/** White foreground. */
export const FOREGROUND_LIGHT = '#ffffff';

/**
 * WCAG 2.x contrast ratio between two colors (1 = identical, 21 = black/white).
 * Accepts any CSS color string parseable by {@link parseColor}. Alpha is
 * ignored - callers composite before measuring if they need to.
 */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const la = getLuminance(ca.r, ca.g, ca.b);
  const lb = getLuminance(cb.r, cb.g, cb.b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the foreground (white or near-black) with the higher WCAG contrast
 * against `bg`. Deterministic: the same background always yields the same
 * foreground. Unparseable input falls back to near-black, which is safe on the
 * light surfaces these colors sit on.
 */
export function pickForeground(bg: string): typeof FOREGROUND_LIGHT | typeof FOREGROUND_DARK {
  if (!parseColor(bg)) return FOREGROUND_DARK;
  const onLight = contrastRatio(bg, FOREGROUND_LIGHT);
  const onDark = contrastRatio(bg, FOREGROUND_DARK);
  return onLight >= onDark ? FOREGROUND_LIGHT : FOREGROUND_DARK;
}
