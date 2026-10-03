import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { measureImage, type ImageMetrics } from "./image";
import { perceptualHash } from "./phash";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  rotation: number;
  capturedAt: Date | null;
}

/** ffprobe via execFile (no shell) — the path is always an app-generated temp file. */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 },
  );
  const json = JSON.parse(stdout) as {
    format?: { duration?: string; tags?: Record<string, string> };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      tags?: Record<string, string>;
      side_data_list?: Array<{ rotation?: number }>;
    }>;
  };
  const v = json.streams?.find((s) => s.codec_type === "video");
  const a = json.streams?.find((s) => s.codec_type === "audio");
  const rotation = Math.abs(Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0)) % 360;
  const [num, den] = (v?.avg_frame_rate ?? "0/0").split("/").map(Number);
  const swap = rotation === 90 || rotation === 270;
  const created = json.format?.tags?.creation_time;
  return {
    durationMs: Math.round(Number(json.format?.duration ?? 0) * 1000),
    width: (swap ? v?.height : v?.width) ?? 0,
    height: (swap ? v?.width : v?.height) ?? 0,
    fps: num && den ? Math.round((num / den) * 100) / 100 : null,
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    rotation,
    capturedAt: created && !Number.isNaN(Date.parse(created)) ? new Date(created) : null,
  };
}

export async function extractFrame(filePath: string, atSeconds: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-ss", atSeconds.toFixed(3), "-i", filePath, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "3", "pipe:1"],
    { encoding: "buffer", maxBuffer: 50 * 1024 * 1024, timeout: 60_000 },
  );
  return stdout as unknown as Buffer;
}

export interface VideoAnalysis extends ImageMetrics {
  probe: ProbeResult;
  phash: string;
  previewJpeg: Buffer;
}

/** Samples frames at 20/50/80% and averages their quality metrics. */
export async function analyzeVideo(filePath: string): Promise<VideoAnalysis> {
  const probe = await probeVideo(filePath);
  const dur = probe.durationMs / 1000;
  const points = dur > 0.5 ? [0.2, 0.5, 0.8].map((p) => p * dur) : [0];
  const frames: Buffer[] = [];
  for (const t of points) {
    const f = await extractFrame(filePath, t);
    if (f.length > 0) frames.push(f);
  }
  if (frames.length === 0) throw new Error("Could not extract any video frames");
  const metrics = await Promise.all(frames.map((f) => measureImage(sharp(f))));
  const avg = (k: keyof ImageMetrics) => metrics.reduce((s, m) => s + m[k], 0) / metrics.length;
  const poster = frames[Math.floor(frames.length / 2)]!;
  return {
    probe,
    sharpness: avg("sharpness"),
    brightness: avg("brightness"),
    contrast: avg("contrast"),
    clippedHighlights: avg("clippedHighlights"),
    clippedShadows: avg("clippedShadows"),
    phash: await perceptualHash(poster),
    previewJpeg: await sharp(poster).resize(1080, 1920, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(),
  };
}
