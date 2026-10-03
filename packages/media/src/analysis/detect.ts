import { fileTypeFromBuffer } from "file-type";

/** Formats we accept. Detection uses magic bytes, never the filename or client MIME. */
export const SUPPORTED_MEDIA: Record<string, { kind: "image" | "video"; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/avif": { kind: "image", ext: "avif" },
  "image/heic": { kind: "image", ext: "heic" },
  "image/heif": { kind: "image", ext: "heif" },
  "image/tiff": { kind: "image", ext: "tiff" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "video/x-m4v": { kind: "video", ext: "m4v" },
  "video/webm": { kind: "video", ext: "webm" },
};

export interface DetectedType {
  mimeType: string;
  kind: "image" | "video";
  ext: string;
}

export async function detectMediaType(bytes: Buffer): Promise<DetectedType | null> {
  const ft = await fileTypeFromBuffer(bytes);
  if (!ft) return null;
  const mime = ft.mime === "image/heic-sequence" ? "image/heic" : ft.mime === "image/heif-sequence" ? "image/heif" : ft.mime;
  const spec = SUPPORTED_MEDIA[mime];
  return spec ? { mimeType: mime, ...spec } : null;
}
