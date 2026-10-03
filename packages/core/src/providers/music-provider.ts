/**
 * MusicProvider (§12): Spotify, Apple Music, SoundCloud are taste/discovery
 * sources ONLY. This interface intentionally has no method that returns audio
 * bytes or stream URLs for download — music is never downloaded, ripped,
 * embedded, or attached to exported media. The user adds the chosen song in
 * Instagram's own music library at posting time.
 */
export type MusicService = "spotify" | "apple_music" | "soundcloud";

export interface MusicProviderCapabilities {
  playlists: boolean;
  savedTracks: boolean;
  topArtists: boolean;
  recentlyPlayed: boolean;
  search: boolean;
  /** Spotify removed audio-features/recommendations for new apps (Nov 2024). */
  audioFeatures: boolean;
  deepLinks: boolean;
}

export interface TrackRef {
  service: MusicService;
  trackId: string;
  title: string;
  artists: string[];
  url: string | null;
  durationMs?: number;
  popularity?: number;
  genres?: string[];
}

export interface TasteSignals {
  topArtists: Array<{ name: string; id?: string; genres?: string[]; weight: number }>;
  topTracks: TrackRef[];
  recentTracks: TrackRef[];
  playlists: Array<{ id: string; name: string; trackCount?: number }>;
}

export interface MusicProvider {
  readonly service: MusicService;
  readonly capabilities: MusicProviderCapabilities;
  fetchTasteSignals(): Promise<TasteSignals>;
  search(query: string, limit?: number): Promise<TrackRef[]>;
}
