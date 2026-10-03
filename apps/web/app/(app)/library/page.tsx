import Link from "next/link";
import { and, desc, eq, mediaAnalysis, mediaAssets, type SQL } from "@intstapost/db";
import { Uploader } from "@/components/Uploader";
import { requireUser } from "@/lib/auth";
import { formatDuration } from "@/lib/format";
import { mediaUrl } from "@/lib/media-urls";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";

const FILTERS = {
  all: "All",
  best: "Best picks",
  duplicates: "Near-duplicates",
  unusable: "Unusable",
  excluded: "Never use",
} as const;
type Filter = keyof typeof FILTERS;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter: Filter = sp.filter && sp.filter in FILTERS ? (sp.filter as Filter) : "all";

  const conds: SQL[] = [eq(mediaAssets.userId, user.id)];
  if (filter === "best") conds.push(eq(mediaAssets.status, "analyzed"), eq(mediaAssets.isClusterRepresentative, true), eq(mediaAssets.excluded, false));
  if (filter === "duplicates") conds.push(eq(mediaAssets.isClusterRepresentative, false));
  if (filter === "unusable") conds.push(eq(mediaAssets.status, "unusable"));
  if (filter === "excluded") conds.push(eq(mediaAssets.excluded, true));

  const rows = await db()
    .select({
      id: mediaAssets.id,
      kind: mediaAssets.kind,
      status: mediaAssets.status,
      preview: mediaAssets.previewStorageKey,
      durationMs: mediaAssets.durationMs,
      rep: mediaAssets.isClusterRepresentative,
      cluster: mediaAssets.duplicateClusterId,
      excluded: mediaAssets.excluded,
      tech: mediaAnalysis.technicalScore,
      blurry: mediaAnalysis.isBlurry,
    })
    .from(mediaAssets)
    .leftJoin(mediaAnalysis, and(eq(mediaAnalysis.assetId, mediaAssets.id), eq(mediaAnalysis.stage, "deterministic")))
    .where(and(...conds))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(120);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Your media</h1>
        </div>
      </div>
      <Uploader />
      <div className="btn-row" style={{ margin: "20px 0 12px" }}>
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link key={f} href={f === "all" ? "/library" : `/library?filter=${f}`} className={`btn small${f === filter ? " primary" : ""}`}>
            {FILTERS[f]}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <div className="grid grid-media">
          {rows.map((r) => {
            const url = mediaUrl(r.preview, user.id);
            return (
              <Link key={r.id} href={`/library/${r.id}`} className={`tile${!r.rep || r.excluded || r.status === "unusable" ? " dim" : ""}`}>
                {url ? <img src={url} alt="" loading="lazy" /> : <div className="tile-placeholder">{r.status === "failed" ? "Analysis failed" : "Analysing…"}</div>}
                <div className="badges">
                  {r.kind === "video" ? <span className="pill">▶ {formatDuration(r.durationMs)}</span> : null}
                  {r.tech !== null ? <span className="pill">{r.tech}</span> : null}
                  {r.blurry ? <span className="pill">Blurry</span> : null}
                  {!r.rep ? <span className="pill">Duplicate</span> : r.cluster ? <span className="pill">Similar</span> : null}
                  {r.excluded ? <span className="pill">Never use</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty">Nothing here yet.</div>
      )}
    </>
  );
}
