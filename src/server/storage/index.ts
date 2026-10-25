import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

/**
 * Where supporting files live. Keys are random UUIDs chosen by the server; user input
 * never becomes part of a key or a path.
 */
export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^[0-9a-f-]{36}$/;
function checkKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error("invalid storage key");
}

/** Local disk, outside public/: development, tests, or a single-server deployment with a backed-up volume. */
export function diskStorage(root: string): FileStorage {
  const resolve = (key: string) => {
    checkKey(key);
    return path.join(root, key.slice(0, 2), key);
  };
  return {
    async put(key, bytes) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    },
    async get(key) {
      try {
        const buf = await readFile(resolve(key));
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      } catch (err) {
        if ((err as { code?: string }).code === "ENOENT") return null;
        throw err;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

/** S3 or any S3-compatible service (MinIO, Azure via gateway, Wasabi). Server-side encryption on. */
export function s3Storage(cfg: { bucket: string; region: string; endpoint?: string }): FileStorage {
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: !!cfg.endpoint,
    // Bounded waits: a hung storage service fails the upload instead of hanging it.
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
  });
  return {
    async put(key, bytes, contentType) {
      checkKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          ServerSideEncryption: "AES256",
        }),
      );
    },
    async get(key) {
      checkKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return res.Body ? new Uint8Array(await res.Body.transformToByteArray()) : null;
      } catch (err) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        // AWS names it; some S3-compatible services only send the status.
        if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async delete(key) {
      checkKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

let instance: FileStorage | undefined;
export function storage(): FileStorage {
  if (instance) return instance;
  const e = env();
  instance =
    e.STORAGE_DRIVER === "s3"
      ? s3Storage({ bucket: e.S3_BUCKET!, region: e.S3_REGION!, endpoint: e.S3_ENDPOINT })
      : diskStorage(path.resolve(e.STORAGE_DIR));
  return instance;
}
