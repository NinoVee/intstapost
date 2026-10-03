import { constants } from "node:fs";
import { chmod, mkdir, open, readFile, readdir, rename, stat, unlink, access } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { assertDeletable, assertSafeKey, ObjectExistsError, type StorageDriver, type StoredObject } from "./types";

/** Filesystem storage for local/private-server deployments. */
export class LocalStorage implements StorageDriver {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Key escapes storage root: ${key}`);
    return full;
  }

  async putImmutable(key: string, body: Buffer, _contentType?: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new ObjectExistsError(key);
      throw err;
    }
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(full, 0o400); // read-only on disk as a second line of defence
    return { key, sizeBytes: body.length };
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<StoredObject> {
    if (key.startsWith("originals/")) throw new Error("Use putImmutable for originals");
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    const tmp = `${full}.${randomBytes(6).toString("hex")}.partial`;
    const handle = await open(tmp, "w", 0o600);
    try {
      await handle.writeFile(body);
    } finally {
      await handle.close();
    }
    await rename(tmp, full);
    return { key, sizeBytes: body.length };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    assertDeletable(key);
    try {
      await unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async list(prefix: string): Promise<Array<{ key: string; modifiedAt: Date }>> {
    const base = this.resolve(prefix.replace(/\/$/, ""));
    const out: Array<{ key: string; modifiedAt: Date }> = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) out.push({ key: path.relative(this.root, full).split(path.sep).join("/"), modifiedAt: (await stat(full)).mtime });
      }
    };
    await walk(base);
    return out;
  }
}
