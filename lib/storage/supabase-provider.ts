import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildEvidenceObjectKey } from "@/lib/storage/object-key";
import type {
  DeleteResult,
  EvidenceStorageRef,
  StorageProvider,
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/lib/storage/types";

const EVIDENCE_BUCKET = "evidence";

// Wraps today's direct supabase.storage.from("evidence") calls exactly as they behaved before
// the Phase 6 refactor — same bucket, same path convention, same error shapes at the call sites.
export class SupabaseStorageProvider implements StorageProvider {
  async uploadEvidenceFile(input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
    const objectKey = buildEvidenceObjectKey(input);
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(objectKey, input.bytes, {
      contentType: input.contentType,
      upsert: false,
    });
    if (error) throw error;
    return { bucket: EVIDENCE_BUCKET, objectKey, path: objectKey, storageProvider: "supabase" };
  }

  async getEvidenceSignedUrl(ref: EvidenceStorageRef, ttlSeconds = 60 * 60): Promise<string | null> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(ref.file_url, ttlSeconds);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  async getEvidenceSignedUrls(refs: EvidenceStorageRef[], ttlSeconds = 60 * 60): Promise<Map<string, string>> {
    if (refs.length === 0) return new Map();
    const supabase = createServerSupabaseClient();
    const { data } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrls(refs.map((ref) => ref.file_url), ttlSeconds);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
    }
    return map;
  }

  async deleteEvidenceFile(ref: EvidenceStorageRef): Promise<DeleteResult> {
    if (!ref.file_url) return { deleted: false };
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([ref.file_url]);
    if (error) return { deleted: false, warning: error.message };
    return { deleted: true };
  }

  async deleteEvidenceFiles(refs: EvidenceStorageRef[]): Promise<DeleteResult> {
    const paths = [...new Set(refs.map((ref) => ref.file_url).filter(Boolean))];
    if (paths.length === 0) return { deleted: true };
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
    if (error) return { deleted: false, warning: error.message };
    return { deleted: true };
  }

  // Phase 9 only — used by lib/storage/media-migration.ts to read bytes out of Supabase before
  // writing them to R2. Not part of the shared StorageProvider interface: nothing else needs raw
  // bytes, everything else works off signed URLs.
  async downloadEvidenceFile(ref: EvidenceStorageRef): Promise<{ bytes: ArrayBuffer; contentType: string | null }> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(ref.file_url);
    if (error || !data) throw error ?? new Error(`No data returned downloading ${ref.file_url}`);
    return { bytes: await data.arrayBuffer(), contentType: data.type || null };
  }
}
