import { asc, brandProfiles, contentThemes, desc, eq, schedules } from "@intstapost/db";
import { EDIT_INTENSITY_LABELS, brandProfileSchema, type EditIntensity } from "@intstapost/core";
import { requireUser } from "@/lib/auth";
import { integrationStatuses } from "@/lib/integrations";
import { db, env } from "@/lib/server";
import { addThemeAction, deleteThemeAction, renameThemeAction, setThemeEnabledAction, setThemePriorityAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const themes = await db()
    .select()
    .from(contentThemes)
    .where(eq(contentThemes.userId, user.id))
    .orderBy(desc(contentThemes.enabled), desc(contentThemes.priority), asc(contentThemes.name));
  const [profileRow] = await db().select().from(brandProfiles).where(eq(brandProfiles.userId, user.id)).limit(1);
  const profile = brandProfileSchema.parse(profileRow?.settings ?? {});
  const jobs = await db().select().from(schedules).orderBy(asc(schedules.jobName));
  const e = env();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Studio settings</h1>
        </div>
      </div>

      <h2>Safety</h2>
      <div className="card">
        <dl className="kv">
          <dt>Publishing</dt>
          <dd>
            {e.PUBLISHING_ENABLED ? (
              <span className="pill warn">Enabled globally. Still requires your approval of the exact content</span>
            ) : (
              <span className="pill ok">Off. Nothing is ever posted automatically</span>
            )}
          </dd>
          <dt>Identity protection</dt>
          <dd>
            Faces are never reshaped, swapped, aged or de-aged. People edits capped at level {profile.peopleMaxIntensity} (
            {EDIT_INTENSITY_LABELS[profile.peopleMaxIntensity as EditIntensity]}); children at level 1.
          </dd>
          <dt>Default edit level</dt>
          <dd>
            {profile.editingIntensity}: {EDIT_INTENSITY_LABELS[profile.editingIntensity as EditIntensity]}
          </dd>
          <dt>Training on your media</dt>
          <dd>{e.ALLOW_EXTERNAL_TRAINING || profile.allowExternalTraining ? "Opted in" : "Not allowed (default)"}</dd>
          <dt>AI budget</dt>
          <dd>
            ${(e.AI_DAILY_BUDGET_CENTS / 100).toFixed(2)}/day · ${(e.AI_MONTHLY_BUDGET_CENTS / 100).toFixed(2)}/month
          </dd>
        </dl>
      </div>

      <h2>Themes</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Theme</th>
              <th>Priority</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {themes.map((t) => (
              <tr key={t.id}>
                <td>
                  <form action={renameThemeAction.bind(null, t.id)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="text" name="name" defaultValue={t.name} aria-label={`Rename ${t.name}`} style={{ maxWidth: 200, padding: "6px 10px" }} />
                    <button className="btn small" type="submit">Save</button>
                    {t.sensitive ? <span className="pill warn">Family-sensitive</span> : null}
                  </form>
                </td>
                <td>
                  <form action={setThemePriorityAction.bind(null, t.id)} style={{ display: "flex", gap: 6 }}>
                    <select name="priority" defaultValue={String(t.priority)} aria-label={`Priority for ${t.name}`} style={{ width: 80, padding: "6px 8px" }}>
                      {[0, 1, 2, 3, 4, 5].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <button className="btn small" type="submit">Set</button>
                  </form>
                </td>
                <td>
                  <form action={setThemeEnabledAction.bind(null, t.id, !t.enabled)}>
                    <button className={`btn small${t.enabled ? "" : " primary"}`}>{t.enabled ? "Disable" : "Enable"}</button>
                  </form>
                </td>
                <td>
                  <form action={deleteThemeAction.bind(null, t.id)}>
                    <button className="btn small danger" aria-label={`Delete ${t.name}`}>Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={addThemeAction} style={{ display: "flex", gap: 8, marginTop: 12, maxWidth: 420 }}>
          <input type="text" name="name" placeholder="New theme name" required minLength={2} maxLength={40} />
          <button className="btn primary" type="submit">Add</button>
        </form>
      </div>

      <h2>Integrations</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Status</th>
              <th>What the official API allows</th>
            </tr>
          </thead>
          <tbody>
            {integrationStatuses(e).map((i) => (
              <tr key={i.name}>
                <td>
                  <strong>{i.name}</strong>
                  <div className="muted small">{i.purpose}</div>
                </td>
                <td>
                  <span className={`pill ${i.configured ? "ok" : ""}`}>{i.configured ? "Configured" : i.phase}</span>
                </td>
                <td className="small">{i.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Schedules</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Cron</th>
              <th>Timezone</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.jobName}</td>
                <td>
                  <code>{j.cron}</code>
                </td>
                <td>{j.timezone}</td>
                <td>{j.enabled ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Schedules live in the <code>schedules</code> table; the worker reloads them on start.
        </p>
      </div>

      <h2>Personal brand profile</h2>
      <div className="card">
        <dl className="kv">
          <dt>Caption length</dt>
          <dd>{profile.captionLength}</dd>
          <dt>Caption styles</dt>
          <dd>{profile.captionStyles.join(", ")}</dd>
          <dt>Tone</dt>
          <dd>
            humour {profile.humorLevel}/10 · professional {profile.professionalismLevel}/10 · confidence {profile.confidenceLevel}/10 · luxury {profile.luxuryLevel}/10
          </dd>
          <dt>Emoji / hashtags</dt>
          <dd>
            {profile.emojiUsage} · {profile.hashtagCount} hashtags
          </dd>
          <dt>Reels</dt>
          <dd>
            {profile.reelSeconds.min}–{profile.reelSeconds.max}s · Stories: {profile.storySlides} slides
          </dd>
          <dt>Daily drafts</dt>
          <dd>
            {Object.entries(profile.dailyDraftTarget)
              .map(([k, v]) => `${v} ${k}`)
              .join(" · ")}
          </dd>
        </dl>
        <p className="muted small" style={{ marginBottom: 0 }}>
          The full editor for these settings, plus learning from your decisions, arrives in Phase 14.
        </p>
      </div>
    </>
  );
}
