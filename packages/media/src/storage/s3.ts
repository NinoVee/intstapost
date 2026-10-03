import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertDeletable, assertSafeKey, ObjectExistsError, type StorageDriver, type StoredObject } from "./types";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** S3-compatible private bucket (AWS S3, MinIO, R2 …). Objects are never public. */
export class S3Storage implements StorageDriver {
  readonly name = "s3";
  private readonly client: S3Client;

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async putImmutable(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    assertSafeKey(key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          IfNoneMatch: "*", // conditional write: fail if the object exists
          ServerSideEncryption: this.cfg.endpoint ? undefined : "AES256",
        }),
      );
    } catch (err) {
      if (err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 412 || err.name === "PreconditionFailed"))
        throw new ObjectExistsError(key);
      throw err;
    }
    return { key, sizeBytes: body.length };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    if (key.startsWith("originals/")) throw new Error("Use putImmutable for originals");
    assertSafeKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    return { key, sizeBytes: body.length };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty object: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return true;
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertDeletable(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  async list(prefix: string): Promise<Array<{ key: string; modifiedAt: Date }>> {
    const out: Array<{ key: string; modifiedAt: Date }> = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, modifiedAt: o.LastModified ?? new Date(0) });
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /** Short-lived presigned GET (e.g. for Instagram to fetch media at publish time). */
  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    assertSafeKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }), { expiresIn: ttlSeconds });
  }
}
