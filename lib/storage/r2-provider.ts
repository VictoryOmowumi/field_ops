import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { buildEvidenceObjectKey } from "@/lib/storage/object-key";
import type {
  DeleteResult,
  EvidenceLocation,
  EvidenceStorageRef,
  StorageProvider,
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/lib/storage/types";

// Constructed lazily, on first real use — not at module load — so an environment that hasn't
// configured R2 yet (the common case while default_storage_provider stays 'supabase') never
// fails to start over it. Once something DOES try to use R2, a missing/broken credential throws
// immediately rather than silently no-op-ing or falling back to Supabase — see the Phase 7 risk
// note in docs/architecture/commercial-implementation-roadmap.md ("fail loudly, don't fall back").
let client: S3Client | null = null;
let configuredBucket: string | null = null;

function getClient() {
  if (client && configuredBucket) return { client, bucket: configuredBucket };

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  const missing = [
    !accountId && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !bucket && "R2_BUCKET_NAME",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`R2 storage is not configured — missing environment variable(s): ${missing.join(", ")}.`);
  }

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    // Without this, the SDK defaults to virtual-hosted-style URLs (bucket name prepended to the
    // hostname, e.g. "{bucket}.{accountId}.r2.cloudflarestorage.com") for any DNS-compatible
    // bucket name. That means next.config.ts would need a new allow-listed hostname every time a
    // bucket is added. Path-style keeps every request under the one hostname above regardless of
    // bucket name or count.
    forcePathStyle: true,
  });
  configuredBucket = bucket!;
  return { client, bucket: configuredBucket };
}

// Second, working implementation of the Phase 6 interface — same object-key convention as
// Supabase (buildEvidenceObjectKey), so tenant isolation via the {organizationId}/{visitId}/…
// prefix holds regardless of which provider a given row lives on.
export class R2StorageProvider implements StorageProvider {
  async uploadEvidenceFile(input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
    const { client, bucket } = getClient();
    const objectKey = buildEvidenceObjectKey(input);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: new Uint8Array(input.bytes),
        ContentType: input.contentType,
      })
    );
    return { bucket, objectKey, path: objectKey, storageProvider: "r2" };
  }

  async getEvidenceSignedUrl(ref: EvidenceStorageRef, ttlSeconds = 60 * 60): Promise<string | null> {
    if (!ref.file_url) return null;
    const { client, bucket } = getClient();
    try {
      return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: ref.file_url }), {
        expiresIn: ttlSeconds,
      });
    } catch {
      return null;
    }
  }

  async getEvidenceSignedUrls(refs: EvidenceStorageRef[], ttlSeconds = 60 * 60): Promise<Map<string, string>> {
    if (refs.length === 0) return new Map();
    const map = new Map<string, string>();
    // R2's S3 API has no batch-presign endpoint (unlike Supabase's createSignedUrls) — sign
    // concurrently instead of sequentially so an R2-heavy gallery page doesn't pay N round trips
    // in series.
    const results = await Promise.all(
      refs.map(async (ref) => ({ path: ref.file_url, signedUrl: await this.getEvidenceSignedUrl(ref, ttlSeconds) }))
    );
    for (const result of results) {
      if (result.signedUrl) map.set(result.path, result.signedUrl);
    }
    return map;
  }

  async deleteEvidenceFile(ref: EvidenceStorageRef): Promise<DeleteResult> {
    if (!ref.file_url) return { deleted: false };
    const { client, bucket } = getClient();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: ref.file_url }));
      return { deleted: true };
    } catch (error) {
      return { deleted: false, warning: error instanceof Error ? error.message : "Failed to delete R2 object." };
    }
  }

  async deleteEvidenceFiles(refs: EvidenceStorageRef[]): Promise<DeleteResult> {
    const keys = [...new Set(refs.map((ref) => ref.file_url).filter(Boolean))];
    if (keys.length === 0) return { deleted: true };
    const { client, bucket } = getClient();
    try {
      // S3's DeleteObjects caps at 1000 keys per request; batch defensively even though evidence
      // volumes per campaign are unlikely to hit that today.
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        await client.send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })) } })
        );
      }
      return { deleted: true };
    } catch (error) {
      return { deleted: false, warning: error instanceof Error ? error.message : "Failed to delete R2 objects." };
    }
  }

  // Phase 9 only — used by lib/storage/media-migration.ts to place bytes at the *same* key the
  // file already has on Supabase, rather than generating a new one via uploadEvidenceFile/
  // buildEvidenceObjectKey. Keeping the key identical means file_url never has to change, only
  // storage_provider/bucket — nothing else about the row needs updating.
  async putEvidenceFileAtKey(
    objectKey: string,
    bytes: ArrayBuffer,
    contentType: string | null
  ): Promise<EvidenceLocation & { etag: string | null }> {
    const { client, bucket } = getClient();
    const result = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: new Uint8Array(bytes),
        ContentType: contentType ?? "application/octet-stream",
      })
    );
    return { bucket, objectKey, etag: result.ETag?.replaceAll('"', "") ?? null };
  }
}
