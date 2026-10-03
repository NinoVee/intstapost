/**
 * MediaProvider (§1): a source of the user's photos/videos. New sources plug in
 * here without touching the content engine. Providers only ever read media the
 * user intentionally made available, via official APIs or user-provided files.
 */
export const MEDIA_PROVIDER_KINDS = [
  "upload", // browser / phone uploads into the app
  "local_folder", // a server directory on an allow-list (also used for iCloud/Photos exports)
  "google_photos_picker", // Google Photos Picker API (user picks items; Library API no longer lists all media)
  "google_drive",
  "dropbox",
  "instagram", // the user's own IG media via the Instagram Graph API
] as const;
export type MediaProviderKind = (typeof MEDIA_PROVIDER_KINDS)[number];

export interface RemoteMediaItem {
  /** Stable ID within the provider (path, cloud file ID, …). */
  externalId: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  modifiedAt?: Date;
  capturedAt?: Date;
}

export interface MediaProviderCapabilities {
  /** Can enumerate new media without user interaction. */
  canList: boolean;
  /** Requires the user to pick items in a provider UI (e.g. Google Photos Picker). */
  requiresUserPicker: boolean;
  /** Supports incremental scans via a cursor. */
  incremental: boolean;
}

export interface ListResult {
  items: RemoteMediaItem[];
  /** Opaque cursor persisted on media_sources.cursor. */
  nextCursor: string | null;
}

export interface MediaProvider {
  readonly kind: MediaProviderKind;
  readonly displayName: string;
  readonly capabilities: MediaProviderCapabilities;
  listNew(cursor: string | null): Promise<ListResult>;
  /** Read bytes for a single item. Never mutates the source. */
  read(item: RemoteMediaItem): Promise<Buffer>;
}
