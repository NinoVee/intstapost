import { NotConfiguredError, NotSupportedError, type MediaProvider, type MediaProviderKind } from "@intstapost/core";
import { LocalFolderProvider } from "./local-folder";

export interface SourceRecord {
  kind: MediaProviderKind;
  name: string;
  config: Record<string, unknown>;
}

/**
 * Status of each provider. Anything not "available" is listed with the exact
 * official API / credential still needed (see docs/INTEGRATIONS.md).
 */
export const MEDIA_PROVIDER_STATUS: Record<MediaProviderKind, { status: "available" | "planned"; note: string }> = {
  upload: { status: "available", note: "Browser/phone uploads." },
  local_folder: { status: "available", note: "Allow-listed server folders (MEDIA_IMPORT_ROOTS). Use for iCloud Photos / camera exports — iCloud has no public photos API." },
  google_photos_picker: { status: "planned", note: "Google Photos Picker API (user selects items). The Library API can no longer read the full library since 2025-03-31. Needs GOOGLE_CLIENT_ID/SECRET." },
  google_drive: { status: "planned", note: "Drive API v3 with drive.file / drive.readonly scope on a chosen folder. Needs GOOGLE_CLIENT_ID/SECRET." },
  dropbox: { status: "planned", note: "Dropbox API v2 with files.content.read on an app folder. Needs DROPBOX_APP_KEY/SECRET." },
  instagram: { status: "planned", note: "Instagram Graph API /{ig-user-id}/media for your own posts. Needs META_APP_ID/SECRET and a Business/Creator account." },
};

export async function createMediaProvider(source: SourceRecord, importRoots: string[]): Promise<MediaProvider> {
  switch (source.kind) {
    case "local_folder": {
      const folder = source.config.path;
      if (typeof folder !== "string") throw new NotConfiguredError(`Source "${source.name}" has no folder path`);
      return LocalFolderProvider.create(folder, importRoots, source.name);
    }
    case "upload":
      throw new NotSupportedError("Uploads are pushed by the browser, not pulled by a scan.");
    default:
      throw new NotConfiguredError(`${source.kind}: ${MEDIA_PROVIDER_STATUS[source.kind].note}`);
  }
}
