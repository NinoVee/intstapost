import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { NotConfiguredError, type ListResult, type MediaProvider, type RemoteMediaItem } from "@intstapost/core";

const MEDIA_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".tif", ".tiff", ".mp4", ".mov", ".m4v", ".webm"]);
const MAX_FILES_PER_SCAN = 500;

/**
 * Reads a server-side folder the user deliberately shared (e.g. an iCloud
 * Photos / Google Takeout export, a camera import folder, a synced Dropbox
 * folder). Only folders inside MEDIA_IMPORT_ROOTS are allowed; symlinks that
 * escape the root are ignored. Files are only ever read, never modified.
 */
export class LocalFolderProvider implements MediaProvider {
  readonly kind = "local_folder" as const;
  readonly capabilities = { canList: true, requiresUserPicker: false, incremental: true };
  readonly displayName: string;

  private constructor(
    private readonly root: string,
    name: string,
  ) {
    this.displayName = name;
  }

  static async create(folder: string, allowedRoots: string[], name = "Local folder"): Promise<LocalFolderProvider> {
    if (allowedRoots.length === 0) throw new NotConfiguredError("MEDIA_IMPORT_ROOTS is empty; no local folders may be read.");
    const real = await realpath(folder);
    const allowed = await Promise.all(allowedRoots.map((r) => realpath(r).catch(() => null)));
    const ok = allowed.some((r) => r !== null && (real === r || real.startsWith(r + path.sep)));
    if (!ok) throw new NotConfiguredError(`Folder ${folder} is not inside MEDIA_IMPORT_ROOTS.`);
    return new LocalFolderProvider(real, name);
  }

  /** Cursor = ISO mtime of the newest file already imported. */
  async listNew(cursor: string | null): Promise<ListResult> {
    const since = cursor ? new Date(cursor).getTime() : 0;
    const found: RemoteMediaItem[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile() && MEDIA_EXT.has(path.extname(e.name).toLowerCase())) {
          const st = await stat(full);
          if (st.mtimeMs > since) {
            found.push({ externalId: path.relative(this.root, full), filename: e.name, sizeBytes: st.size, modifiedAt: st.mtime });
          }
        }
      }
    };
    await walk(this.root);
    found.sort((a, b) => a.modifiedAt!.getTime() - b.modifiedAt!.getTime());
    const items = found.slice(0, MAX_FILES_PER_SCAN);
    const last = items.at(-1)?.modifiedAt;
    return { items, nextCursor: last ? last.toISOString() : cursor };
  }

  async read(item: RemoteMediaItem): Promise<Buffer> {
    const full = path.resolve(this.root, item.externalId);
    const real = await realpath(full);
    if (!real.startsWith(this.root + path.sep)) throw new Error("Path escapes provider root");
    return readFile(real);
  }
}
