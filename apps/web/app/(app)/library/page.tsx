import Link from "next/link";
import { Uploader } from "@/components/Uploader";
import { requireUser } from "@/lib/auth";
import { formatDuration } from "@/lib/format";
import { listMedia, MEDIA_FILTERS, parseMediaFilter, type MediaFilter } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const filter = parseMediaFilter((await searchParams).filter);
  const rows = await listMedia(user.id, filter);

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
        {(Object.keys(MEDIA_FILTERS) as MediaFilter[]).map((f) => (
          <Link key={f} href={f === "all" ? "/library" : `/library?filter=${f}`} className={`btn small${f === filter ? " primary" : ""}`}>
            {MEDIA_FILTERS[f]}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <div className="grid grid-media">
          {rows.map((r) => {
            const url = r.previewUrl;
            return (
              <Link key={r.id} href={`/library/${r.id}`} className={`tile${!r.isRepresentative || r.excluded || r.status === "unusable" ? " dim" : ""}`}>
                {url ? <img src={url} alt="" loading="lazy" /> : <div className="tile-placeholder">{r.status === "failed" ? "Analysis failed" : "Analysing…"}</div>}
                <div className="badges">
                  {r.kind === "video" ? <span className="pill">▶ {formatDuration(r.durationMs)}</span> : null}
                  {r.technicalScore !== null ? <span className="pill">{r.technicalScore}</span> : null}
                  {r.isBlurry ? <span className="pill">Blurry</span> : null}
                  {!r.isRepresentative ? <span className="pill">Duplicate</span> : r.clusterId ? <span className="pill">Similar</span> : null}
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
