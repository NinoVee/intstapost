import sharp, { type Sharp } from "sharp";

const SIZE = 32;
const LOW = 8;

// Precomputed DCT-II cosine table.
const COS: number[][] = Array.from({ length: SIZE }, (_, u) =>
  Array.from({ length: SIZE }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE))),
);

/**
 * 64-bit DCT perceptual hash (pHash). Robust to resizing, recompression and
 * small colour changes — used to find near-duplicate bursts cheaply (§19).
 */
export async function perceptualHash(input: Buffer | Sharp): Promise<string> {
  const img = Buffer.isBuffer(input) ? sharp(input, { failOn: "none" }).rotate() : input;
  const { data } = await img.greyscale().resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });

  const coeffs: number[] = [];
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      let sum = 0;
      for (let x = 0; x < SIZE; x++) {
        const cu = COS[u]![x]!;
        for (let y = 0; y < SIZE; y++) sum += cu * COS[v]![y]! * data[y * SIZE + x]!;
      }
      coeffs.push(sum);
    }
  }
  const ac = coeffs.slice(1); // drop DC term for the median
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]!;
  let bits = 0n;
  for (let i = 0; i < 64; i++) if (coeffs[i]! > median) bits |= 1n << BigInt(63 - i);
  return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}
