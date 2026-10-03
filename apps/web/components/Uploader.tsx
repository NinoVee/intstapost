"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Row = { name: string; state: "uploading" | "done" | "duplicate" | "error"; message?: string };

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/tiff,video/mp4,video/quicktime,video/webm,.heic,.heif,.mov";

export function Uploader() {
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    setRows((r) => [...list.map((f) => ({ name: f.name, state: "uploading" as const })), ...r].slice(0, 50));
    // Upload in small batches so a large selection doesn't become one huge request.
    for (let i = 0; i < list.length; i += 5) {
      const batch = list.slice(i, i + 5);
      const body = new FormData();
      for (const f of batch) body.append("files", f);
      try {
        const res = await fetch("/api/media/upload", { method: "POST", body });
        const json = (await res.json()) as { results?: Array<{ filename: string; duplicate?: boolean; error?: string }>; error?: string };
        setRows((rows) =>
          rows.map((row) => {
            if (!batch.some((f) => f.name === row.name) || row.state !== "uploading") return row;
            const r = json.results?.find((x) => x.filename === row.name);
            if (!res.ok || !r) return { ...row, state: "error", message: json.error ?? "Upload failed" };
            if (r.error) return { ...row, state: "error", message: r.error };
            return { ...row, state: r.duplicate ? "duplicate" : "done" };
          }),
        );
      } catch {
        setRows((rows) => rows.map((row) => (batch.some((f) => f.name === row.name) && row.state === "uploading" ? { ...row, state: "error", message: "Network error" } : row)));
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div
      className={`dropzone${active ? " active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Drop photos and videos here</p>
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Originals are stored privately and never modified. JPEG, PNG, HEIC, WebP, MP4, MOV.
      </p>
      <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
      <button className="btn primary" type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : "Choose files"}
      </button>
      {rows.length ? (
        <ul className="upload-list" aria-live="polite">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span className={r.state === "error" ? "error" : "muted"}>
                {r.state === "uploading" ? "Uploading…" : r.state === "done" ? "Added — analysing" : r.state === "duplicate" ? "Already in library" : r.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
