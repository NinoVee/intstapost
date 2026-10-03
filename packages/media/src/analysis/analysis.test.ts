import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { blur, makeSharpImage, makeVideo, nearDuplicate } from "../test/fixtures";
import { assignCluster } from "./dedupe";
import { detectMediaType } from "./detect";
import { analyzeImage, BLUR_THRESHOLD, coarsen } from "./image";
import { hammingDistance, perceptualHash } from "./phash";
import { technicalScore } from "./scoring";
import { analyzeVideo } from "./video";

describe("detectMediaType", () => {
  it("uses magic bytes, not names", async () => {
    expect(await detectMediaType(await makeSharpImage())).toMatchObject({ mimeType: "image/jpeg", kind: "image" });
    expect(await detectMediaType(Buffer.from("<html>not an image</html>"))).toBeNull();
  });
});

describe("perceptual hash", () => {
  it("is close for near-duplicates and far for different scenes", async () => {
    const a = await makeSharpImage(1);
    const [ha, hdup, hother] = await Promise.all([perceptualHash(a), perceptualHash(await nearDuplicate(a)), perceptualHash(await makeSharpImage(7))]);
    expect(ha).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistance(ha, hdup)).toBeLessThanOrEqual(6);
    expect(hammingDistance(ha, hother)).toBeGreaterThan(14);
  });
});

describe("image analysis", () => {
  it("flags blurry images and scores sharp ones higher", async () => {
    const crisp = await makeSharpImage(2);
    const soft = await blur(crisp);
    const [a, b] = await Promise.all([analyzeImage(crisp, "image/jpeg"), analyzeImage(soft, "image/jpeg")]);
    expect(a.sharpness).toBeGreaterThan(BLUR_THRESHOLD);
    expect(b.sharpness).toBeLessThan(BLUR_THRESHOLD);
    expect(technicalScore(a, a.width, a.height)).toBeGreaterThan(technicalScore(b, b.width, b.height));
    expect(a.width).toBe(1200);
    expect(a.height).toBe(1500);
  });

  it("previews contain no EXIF/GPS metadata", async () => {
    const withExif = await sharp(await makeSharpImage(3)).withExif({ IFD0: { Make: "TestCam", Model: "X1" } }).jpeg().toBuffer();
    const r = await analyzeImage(withExif, "image/jpeg");
    const meta = await sharp(r.previewJpeg).metadata();
    expect(meta.exif).toBeUndefined();
    expect((r.metadata.camera as Record<string, unknown>).Make).toBe("TestCam");
  });

  it("coarsens coordinates to ~1km", () => {
    expect(coarsen(40.712776)).toBe(40.71);
    expect(coarsen(undefined)).toBeNull();
  });
});

describe("near-duplicate clustering", () => {
  it("keeps only the best few of a burst as representatives", () => {
    const base = "ffffffff00000000";
    const burst = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, phash: base, clusterId: "c1", technicalScore: 50 + i }));
    const d = assignCluster({ id: "new", phash: base, technicalScore: 99 }, burst, () => "fresh", 3);
    expect(d.clusterId).toBe("c1");
    expect([...d.representatives].sort()).toEqual(["b4", "b5", "new"]);
    expect(d.members).toHaveLength(7);
  });
  it("creates no cluster for unique media", () => {
    const d = assignCluster({ id: "n", phash: "0000000000000000", technicalScore: 50 }, [{ id: "x", phash: "ffffffffffffffff", clusterId: null, technicalScore: 50 }], () => "c");
    expect(d.clusterId).toBeNull();
  });
});

describe("video analysis (ffmpeg)", () => {
  it("probes and samples frames", async () => {
    const file = await makeVideo(2);
    try {
      const r = await analyzeVideo(file);
      expect(r.probe.width).toBe(720);
      expect(r.probe.height).toBe(1280);
      expect(r.probe.durationMs).toBeGreaterThan(1500);
      expect(r.probe.videoCodec).toBe("h264");
      expect(r.phash).toMatch(/^[0-9a-f]{16}$/);
      expect((await sharp(r.previewJpeg).metadata()).format).toBe("jpeg");
    } finally {
      await rm(path.dirname(file), { recursive: true, force: true });
    }
  });
});
