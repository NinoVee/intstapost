import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

/** A detailed synthetic photo: gradients + shapes + noise → sharp. */
export async function makeSharpImage(seed = 1, width = 1200, height = 1500): Promise<Buffer> {
  const shapes = Array.from({ length: 40 }, (_, i) => {
    const x = (i * 97 * seed) % width;
    const y = (i * 61 * seed) % height;
    const r = 20 + ((i * 13 * seed) % 80);
    const hue = (i * 37 * seed) % 360;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${hue},70%,50%)" stroke="black" stroke-width="3"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#235"/><stop offset="1" stop-color="#eda"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${shapes}
    <text x="40" y="120" font-size="90" font-family="sans-serif" fill="white">Seed ${seed}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

export async function blur(bytes: Buffer, sigma = 12): Promise<Buffer> {
  return sharp(bytes).blur(sigma).jpeg({ quality: 90 }).toBuffer();
}

/** Same scene, recompressed + slightly resized: a near-duplicate. */
export async function nearDuplicate(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).resize(1100).modulate({ brightness: 1.03 }).jpeg({ quality: 70 }).toBuffer();
}

export async function makeVideo(seconds = 2): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intstapost-vid-"));
  const out = path.join(dir, "clip.mp4");
  await promisify(execFile)("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", `testsrc2=size=720x1280:rate=30:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
  ]);
  return out;
}
