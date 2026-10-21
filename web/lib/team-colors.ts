// Text colours for team badges and the team header, chosen by WCAG contrast.
// Team colours run from near-black (Raiders) to pale gold (Saints), so no
// single text colour reads on all of them.

/** The site's near-black ink, used on light team colours. */
export const DARK_TEXT = "#111110";
export const LIGHT_TEXT = "#ffffff";

/** WCAG 2 relative luminance of a #RRGGBB colour: 0 for black, 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    // Undo the sRGB gamma curve to get linear light.
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, from 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text on a team colour, whichever contrasts more. */
export function textOn(hex: string): typeof LIGHT_TEXT | typeof DARK_TEXT {
  return contrastRatio(LIGHT_TEXT, hex) >= contrastRatio(DARK_TEXT, hex) ? LIGHT_TEXT : DARK_TEXT;
}
