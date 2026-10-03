import "server-only";
import type { Env } from "@intstapost/core/env";
import { MEDIA_PROVIDER_STATUS } from "@intstapost/media";

export interface IntegrationStatus {
  name: string;
  purpose: string;
  configured: boolean;
  phase: string;
  /** What the official API can and cannot do (verified Oct 2026; see docs/INTEGRATIONS.md). */
  notes: string;
}

export function integrationStatuses(env: Env): IntegrationStatus[] {
  return [
    {
      name: "Instagram (Meta Graph API)",
      purpose: "Publishing after approval; reading your own media",
      configured: Boolean(env.META_APP_ID && env.META_APP_SECRET),
      phase: "Phase 11",
      notes: "Business/Creator account required. Feed, carousel (≤10), Stories and Reels can be published by API. There is no native-draft endpoint, so drafts stay internal.",
    },
    {
      name: "Higgsfield",
      purpose: "Preferred AI photo/video editor",
      configured: Boolean(env.HIGGSFIELD_CREDENTIALS && env.HIGGSFIELD_IMAGE_EDIT_ENDPOINT),
      phase: "Phase 9",
      notes: "Official API at api.higgsfield.ai (Authorization: Key id:secret, async requests + webhooks). Model endpoint is configured, never hard-coded.",
    },
    {
      name: "Spotify",
      purpose: "Music taste (recommendation only)",
      configured: Boolean(env.SPOTIFY_CLIENT_ID),
      phase: "Phase 10",
      notes: "Top artists/tracks, playlists, recently played via OAuth. Audio-features and recommendations endpoints are unavailable to new apps.",
    },
    {
      name: "Apple Music",
      purpose: "Music taste (recommendation only)",
      configured: Boolean(env.APPLE_MUSIC_TEAM_ID && env.APPLE_MUSIC_KEY_ID && env.APPLE_MUSIC_PRIVATE_KEY),
      phase: "Phase 10",
      notes: "Developer token (JWT) + Music-User-Token via MusicKit JS; library, recently played, catalog search.",
    },
    {
      name: "SoundCloud",
      purpose: "Music taste (recommendation only)",
      configured: Boolean(env.SOUNDCLOUD_CLIENT_ID),
      phase: "Phase 10",
      notes: "OAuth 2.1 + PKCE. New apps need an approved API application.",
    },
    {
      name: "AI vision & captions",
      purpose: "Media understanding, captions (behind cost limits)",
      configured: Boolean(env.ANTHROPIC_API_KEY),
      phase: "Phase 5",
      notes: "Only the best near-duplicate representatives are sent, downscaled, within daily/monthly budgets.",
    },
    ...Object.entries(MEDIA_PROVIDER_STATUS).map(([kind, s]) => ({
      name: `Media source: ${kind.replace(/_/g, " ")}`,
      purpose: "Media intake",
      configured: s.status === "available",
      phase: s.status === "available" ? "Available" : "Planned",
      notes: s.note,
    })),
  ];
}
