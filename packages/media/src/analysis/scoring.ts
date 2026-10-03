import { BLUR_THRESHOLD, type ImageMetrics } from "./image";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Deterministic technical-quality score (0-100) from cheap local measurements.
 * This is one of several scores (§18); composition/relevance/potential come
 * from later AI stages and are never collapsed into a single number here.
 */
export function technicalScore(m: ImageMetrics, width: number, height: number): number {
  // Sharpness: log-scaled, ~BLUR_THRESHOLD → 50, 10× → ~100.
  const sharp = clamp(50 + 50 * Math.log10(Math.max(1, m.sharpness) / BLUR_THRESHOLD));
  // Exposure: best near mid-grey, penalise clipping.
  const exposure = clamp(100 - Math.abs(m.brightness - 120) * 0.8 - (m.clippedHighlights + m.clippedShadows) * 200);
  const contrast = clamp(m.contrast * 2);
  const shortEdge = Math.min(width, height);
  const resolution = clamp((shortEdge / 1080) * 100);
  return clamp(sharp * 0.45 + exposure * 0.25 + contrast * 0.1 + resolution * 0.2);
}

export function usability(m: ImageMetrics, width: number, height: number): { isBlurry: boolean; unusable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const isBlurry = m.sharpness < BLUR_THRESHOLD;
  if (m.sharpness < BLUR_THRESHOLD / 4) reasons.push("extremely_blurry");
  if (Math.min(width, height) < 320) reasons.push("resolution_too_low");
  if (m.brightness < 8 || m.brightness > 248) reasons.push("nearly_black_or_white");
  return { isBlurry, unusable: reasons.length > 0, reasons };
}
