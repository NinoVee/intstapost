import exifr from "exifr";
import sharp, { type Sharp } from "sharp";
import { perceptualHash } from "./phash";

export const ANALYZER_VERSION = "deterministic-1";

export interface ImageMetrics {
  /** Variance of the Laplacian on a 512px greyscale — higher is sharper. */
  sharpness: number;
  brightness: number; // 0-255 mean
  contrast: number; // std-dev
  clippedHighlights: number; // fraction ≥ 250
  clippedShadows: number; // fraction ≤ 5
}

export interface ImageAnalysis extends ImageMetrics {
  width: number;
  height: number;
  phash: string;
  capturedAt: Date | null;
  approxLatitude: number | null;
  approxLongitude: number | null;
  metadata: Record<string, unknown>;
}

/** Below this the image is flagged blurry; below a quarter of it, unusable. */
export const BLUR_THRESHOLD = 60;

export async function measureImage(img: Sharp): Promise<ImageMetrics> {
  const { data, info } = await img
    .clone()
    .greyscale()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;

  let sum = 0;
  let sumSq = 0;
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const v = data[i]!;
    sum += v;
    sumSq += v * v;
    if (v >= 250) hi++;
    if (v <= 5) lo++;
  }
  const mean = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

  // 4-neighbour Laplacian variance.
  let lSum = 0;
  let lSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w]! + data[i + w]! + data[i - 1]! + data[i + 1]! - 4 * data[i]!;
      lSum += lap;
      lSq += lap * lap;
      count++;
    }
  }
  const lMean = count ? lSum / count : 0;
  const sharpness = count ? lSq / count - lMean * lMean : 0;

  return { sharpness, brightness: mean, contrast, clippedHighlights: hi / n, clippedShadows: lo / n };
}

/** Round to ~1.1 km so precise home/school locations are never stored. */
export function coarsen(coord: number | undefined | null): number | null {
  return typeof coord === "number" && Number.isFinite(coord) ? Math.round(coord * 100) / 100 : null;
}

export async function readExif(bytes: Buffer): Promise<{
  capturedAt: Date | null;
  lat: number | null;
  lon: number | null;
  camera: Record<string, unknown>;
}> {
  try {
    const exif = (await exifr.parse(bytes, {
      pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "LensModel", "FNumber", "ExposureTime", "ISO", "FocalLength", "latitude", "longitude", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"],
      gps: true,
    })) as Record<string, unknown> | undefined;
    if (!exif) return { capturedAt: null, lat: null, lon: null, camera: {} };
    const date = (exif.DateTimeOriginal ?? exif.CreateDate) as Date | undefined;
    const camera: Record<string, unknown> = {};
    for (const k of ["Make", "Model", "LensModel", "FNumber", "ExposureTime", "ISO", "FocalLength"]) if (exif[k] !== undefined) camera[k] = exif[k];
    return {
      capturedAt: date instanceof Date && !Number.isNaN(date.getTime()) ? date : null,
      lat: coarsen(exif.latitude as number | undefined),
      lon: coarsen(exif.longitude as number | undefined),
      camera,
    };
  } catch {
    return { capturedAt: null, lat: null, lon: null, camera: {} };
  }
}

/** Decode-able input for sharp: HEIC is converted first (sharp's prebuilt libvips lacks HEVC). */
export async function toDecodable(bytes: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType !== "image/heic" && mimeType !== "image/heif") return bytes;
  const { default: convert } = await import("heic-convert");
  const out = await convert({ buffer: new Uint8Array(bytes), format: "JPEG", quality: 0.92 });
  return Buffer.from(out);
}

export async function analyzeImage(bytes: Buffer, mimeType: string): Promise<ImageAnalysis & { previewJpeg: Buffer }> {
  const exif = await readExif(bytes);
  const decodable = await toDecodable(bytes, mimeType);
  const base = sharp(decodable, { failOn: "none" }).rotate();
  const meta = await sharp(decodable, { failOn: "none" }).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;

  const [metrics, phash, previewJpeg] = await Promise.all([
    measureImage(base),
    perceptualHash(base.clone()),
    // Preview strips all metadata (sharp default) — no EXIF/GPS leaves via previews.
    base.clone().resize(1080, 1350, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
  ]);

  return {
    ...metrics,
    width,
    height,
    phash,
    capturedAt: exif.capturedAt,
    approxLatitude: exif.lat,
    approxLongitude: exif.lon,
    metadata: { format: meta.format, space: meta.space, hasAlpha: meta.hasAlpha, camera: exif.camera },
    previewJpeg,
  };
}
