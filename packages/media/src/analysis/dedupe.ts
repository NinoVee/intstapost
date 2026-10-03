import { hammingDistance } from "./phash";

/** ≤ this many differing bits (of 64) counts as a near-duplicate. */
export const NEAR_DUPLICATE_DISTANCE = 10;

export interface ClusterCandidate {
  id: string;
  phash: string;
  clusterId: string | null;
  technicalScore: number;
}

export interface ClusterDecision {
  clusterId: string | null;
  /** Members (including the new asset) whose representative flag should be set. */
  representatives: Set<string>;
  members: string[];
}

/**
 * Assign a new asset to a near-duplicate cluster. Within each cluster only the
 * top `keepPerCluster` by technical score stay representatives, so a burst of
 * 20 shots sends only the best few on to expensive AI stages.
 */
export function assignCluster(
  asset: { id: string; phash: string; technicalScore: number },
  candidates: ClusterCandidate[],
  newClusterId: () => string,
  keepPerCluster = 3,
): ClusterDecision {
  const near = candidates.filter((c) => c.id !== asset.id && hammingDistance(asset.phash, c.phash) <= NEAR_DUPLICATE_DISTANCE);
  if (near.length === 0) return { clusterId: null, representatives: new Set([asset.id]), members: [asset.id] };

  const clusterId = near.find((c) => c.clusterId)?.clusterId ?? newClusterId();
  const others = candidates.filter((c) => c.id !== asset.id && (c.clusterId === clusterId || near.includes(c)));
  const uniq = [...new Map([asset, ...others].map((m) => [m.id, m])).values()].sort((a, b) => b.technicalScore - a.technicalScore);
  return {
    clusterId,
    representatives: new Set(uniq.slice(0, keepPerCluster).map((m) => m.id)),
    members: uniq.map((m) => m.id),
  };
}
