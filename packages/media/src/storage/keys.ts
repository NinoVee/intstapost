export function originalKey(userId: string, sha256: string, ext: string): string {
  return `originals/${userId}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
}

export function previewKey(userId: string, assetId: string): string {
  return `derived/${userId}/${assetId}/preview.jpg`;
}

export function editVersionKey(userId: string, assetId: string, version: number, ext: string): string {
  return `derived/${userId}/${assetId}/v${version}.${ext}`;
}

export function tempKey(userId: string, name: string): string {
  return `tmp/${userId}/${Date.now()}-${name}`;
}
