export interface StoredObject {
  key: string;
  sizeBytes: number;
}

/**
 * Object storage abstraction. Keys under `originals/` are write-once: the
 * driver refuses to overwrite or delete them (§33 non-destructive workflow).
 */
export interface StorageDriver {
  readonly name: string;
  /** Write-once. Fails with ObjectExistsError if the key exists. */
  putImmutable(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  /** Derived/regenerable objects (previews, renders, temp). */
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Refuses `originals/` keys. */
  delete(key: string): Promise<void>;
  /** List keys under a prefix with last-modified times (used by temp cleanup). */
  list(prefix: string): Promise<Array<{ key: string; modifiedAt: Date }>>;
}

export class ObjectExistsError extends Error {
  constructor(key: string) {
    super(`Object already exists: ${key}`);
    this.name = "ObjectExistsError";
  }
}

export const ORIGINALS_PREFIX = "originals/";
export const DERIVED_PREFIX = "derived/";
export const TEMP_PREFIX = "tmp/";

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//") || key.length > 512) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export function assertDeletable(key: string): void {
  assertSafeKey(key);
  if (key.startsWith(ORIGINALS_PREFIX)) throw new Error(`Refusing to delete original media: ${key}`);
}
