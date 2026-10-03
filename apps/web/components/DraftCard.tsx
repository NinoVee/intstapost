import { REJECTION_REASONS } from "@intstapost/core";
import { FORMAT_LABEL, STATUS_LABEL } from "@/lib/format";
import { approveDraftAction, rejectDraftAction, saveForLaterAction } from "@/app/(app)/actions";

export interface DraftCardData {
  id: string;
  format: string;
  status: string;
  theme: string | null;
  coverUrl: string | null;
  slides: number;
  qualityScore: number | null;
  aiModified: boolean;
  containsChildren: boolean;
  containsFamily: boolean;
}

const REASON_LABEL: Record<string, string> = {
  too_edited: "Too edited",
  bad_song: "Bad song",
  bad_caption: "Bad caption",
  wrong_theme: "Wrong theme",
  dont_like_photo: "Don't like photo",
  too_personal: "Too personal",
  not_flattering: "Not flattering",
  repetitive: "Repetitive",
  save_for_later: "Save for later",
};

const statusTone = (s: string) => (s === "approved" ? "ok" : s === "ready_for_review" ? "info" : s === "failed" || s === "rejected" ? "danger" : "");

export function DraftCard({ d }: { d: DraftCardData }) {
  const reviewable = d.status === "ready_for_review";
  return (
    <article className="card draft-card">
      <div className="draft-cover">{d.coverUrl ? <img src={d.coverUrl} alt="" /> : <span>No preview yet</span>}</div>
      <div className="draft-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="draft-format">{FORMAT_LABEL[d.format] ?? d.format}</span>
          <span className={`pill ${statusTone(d.status)}`}>
            <span className="dot" />
            {STATUS_LABEL[d.status] ?? d.status}
          </span>
        </div>
        <dl className="kv">
          <dt>Theme</dt>
          <dd>{d.theme ?? "—"}</dd>
          {d.format === "story" || d.format === "carousel" ? (
            <>
              <dt>Slides</dt>
              <dd>{d.slides}</dd>
            </>
          ) : null}
          {d.qualityScore !== null ? (
            <>
              <dt>Quality</dt>
              <dd>{d.qualityScore}/100</dd>
            </>
          ) : null}
        </dl>
        <div className="btn-row">
          <span className="pill">Internal draft</span>
          {d.aiModified ? <span className="pill warn">AI-modified</span> : null}
          {d.containsChildren || d.containsFamily ? <span className="pill warn">Family — review carefully</span> : null}
        </div>
        <div className="btn-row">
          <button className="btn small" disabled title="Review screen arrives in Phase 12">Review</button>
          <form action={approveDraftAction.bind(null, d.id)}>
            <button className="btn small primary" disabled={!reviewable}>Approve</button>
          </form>
          <form action={saveForLaterAction.bind(null, d.id)}>
            <button className="btn small" disabled={!reviewable}>Save for later</button>
          </form>
          <button className="btn small" disabled title="Regeneration arrives with the content engine (Phase 7)">Regenerate</button>
          <button className="btn small" disabled title="Editing arrives in Phase 8">Edit</button>
          <button className="btn small" disabled title="Export arrives in Phase 11">Export</button>
          {reviewable ? (
            <details className="reject">
              <summary className="btn small danger">Reject…</summary>
              <form action={rejectDraftAction.bind(null, d.id)}>
                <div className="reasons">
                  {REJECTION_REASONS.filter((r) => r !== "save_for_later").map((r) => (
                    <label key={r}>
                      <input type="checkbox" name="reasons" value={r} /> {REASON_LABEL[r]}
                    </label>
                  ))}
                </div>
                <button className="btn small danger" type="submit">Reject draft</button>
              </form>
            </details>
          ) : null}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Approving never publishes. You post to Instagram yourself.
        </p>
      </div>
    </article>
  );
}
