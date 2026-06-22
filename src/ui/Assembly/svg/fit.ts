/**
 * Pick a font size that lets `text` fit a w×h box, or null when the box is too
 * cramped to label at all. Mirrors the sheet-diagram fitter, simplified.
 */
export function fitLabel(text: string, w: number, h: number, fs: number): number | null {
  const byW = (w * 0.86) / (text.length * 0.55);
  const size = Math.min(fs * 0.95, byW, h * 0.5);
  return size < fs * 0.35 ? null : size;
}
