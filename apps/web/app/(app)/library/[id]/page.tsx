import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, mediaAnalysis, mediaAssets, mediaSources, ne } from "@intstapost/db";
import { requireUser } from "@/lib/auth";
import { formatBytes, formatDuration } from "@/lib/format";
import { mediaUrl } from "@/lib/media-urls";
import { db } from "@/lib/server";
import { setAssetExcludedAction } from "../../actions";

export const dynamic = "force-dynamic";

const SCORE_LABELS: Array<[string, string]> = [
  ["technicalScore", "Technical quality"],
  ["compositionScore", "Composition"],
  ["personalRelevanceScore", "Personal relevance"],
  ["instagramPotentialScore", "Instagram potential"],
  ["themeMatchScore", "Theme match"],
  ["uniquenessScore", "Uniqueness"],
];

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [row] = await db()
    .select({ asset: mediaAssets, source: mediaSources.name })
    .from(mediaAssets)
    .leftJoin(mediaSources, eq(mediaSources.id, mediaAssets.sourceId))
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, user.id)))
    .limit(1);
  if (!row) notFound();
  const a = row.asset;
  const analyses = await db().select().from(mediaAnalysis).where(eq(mediaAnalysis.assetId, a.id));
  const det = analyses.find((x) => x.stage === "deterministic");
  const ai = analyses.find((x) => x.stage === "ai");
  const siblings = a.duplicateClusterId
    ? await db()
        .select({ id: mediaAssets.id, preview: mediaAssets.previewStorageKey, rep: mediaAssets.isClusterRepresentative })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.duplicateClusterId, a.duplicateClusterId), ne(mediaAssets.id, a.id), eq(mediaAssets.userId, user.id)))
        .limit(24)
    : [];

  const preview = mediaUrl(a.previewStorageKey, user.id);
  const original = mediaUrl(a.originalStorageKey, user.id);
  const camera = (a.metadata.camera ?? {}) as Record<string, unknown>;
  const scoreOf = (k: string) => (ai?.[k as keyof typeof ai] ?? det?.[k as keyof typeof det]) as number | null | undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/library">Library</Link> / {a.kind}
          </p>
          <h1 style={{ fontSize: 24, overflowWrap: "anywhere" }}>{a.originalFilename ?? "Untitled"}</h1>
        </div>
        <div className="btn-row">
          {original ? (
            <a className="btn small" href={original} target="_blank" rel="noopener">
              View original
            </a>
          ) : null}
          <form action={setAssetExcludedAction.bind(null, a.id, !a.excluded)}>
            <button className={`btn small${a.excluded ? "" : " danger"}`}>{a.excluded ? "Allow in content again" : "Never use this"}</button>
          </form>
        </div>
      </div>

      <div className="detail">
        <div className="detail-media">
          {a.kind === "video" && original ? (
            <video src={original} poster={preview ?? undefined} controls playsInline preload="metadata" />
          ) : preview ? (
            <img src={preview} alt="" />
          ) : (
            <div className="empty">Preview not ready ({a.status})</div>
          )}
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <section className="card">
            <h3 style={{ marginBottom: 12 }}>Scores</h3>
            <div className="scores">
              {SCORE_LABELS.map(([k, label]) => {
                const v = scoreOf(k);
                return (
                  <div className="score-row" key={k}>
                    <span>{label}</span>
                    <div className="bar">{typeof v === "number" ? <span style={{ width: `${v}%` }} /> : null}</div>
                    <span className="muted">{typeof v === "number" ? v : "—"}</span>
                  </div>
                );
              })}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Dashes are filled in by AI analysis (Phase 5), which only runs on the best picks.
            </p>
          </section>

          <section className="card">
            <h3 style={{ marginBottom: 12 }}>Details</h3>
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                {a.status}
                {det?.isBlurry ? " · blurry" : ""}
                {a.excluded ? " · never use" : ""}
              </dd>
              <dt>Size</dt>
              <dd>
                {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                {formatBytes(a.sizeBytes)}
                {a.durationMs ? ` · ${formatDuration(a.durationMs)}` : ""}
              </dd>
              <dt>Captured</dt>
              <dd>{a.capturedAt ? a.capturedAt.toLocaleString("en-US", { timeZone: user.timezone, dateStyle: "medium", timeStyle: "short" }) : "Unknown"}</dd>
              <dt>Source</dt>
              <dd>{row.source ?? "—"}</dd>
              {camera.Model ? (
                <>
                  <dt>Camera</dt>
                  <dd>{[camera.Make, camera.Model].filter(Boolean).join(" ")}</dd>
                </>
              ) : null}
              {a.approxLatitude !== null ? (
                <>
                  <dt>Location</dt>
                  <dd>Approximate only (≈1 km). Never added to captions automatically.</dd>
                </>
              ) : null}
              {det ? (
                <>
                  <dt>Exposure</dt>
                  <dd>
                    brightness {Math.round(det.brightness ?? 0)}, contrast {Math.round(det.contrast ?? 0)}, sharpness {Math.round(det.sharpness ?? 0)}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          {siblings.length ? (
            <section className="card">
              <h3 style={{ marginBottom: 6 }}>Similar shots ({siblings.length})</h3>
              <p className="muted small" style={{ marginTop: 0 }}>
                {a.isClusterRepresentative ? "This is one of the best in its group." : "A sharper version from this group will be used instead."}
              </p>
              <div className="grid grid-media" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                {siblings.map((s) => {
                  const u = mediaUrl(s.preview, user.id);
                  return (
                    <Link key={s.id} href={`/library/${s.id}`} className={`tile${s.rep ? "" : " dim"}`}>
                      {u ? <img src={u} alt="" loading="lazy" /> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
