import { getPlatformSettingValue } from "@/lib/platform/server";
import { R2StorageProvider } from "@/lib/storage/r2-provider";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";
import type {
  DeleteResult,
  EvidenceStorageRef,
  StorageProvider,
  StorageProviderName,
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/lib/storage/types";

// Exported (not just module-local) so lib/storage/media-migration.ts (Phase 9) can call the
// Supabase-only downloadEvidenceFile and R2-only putEvidenceFileAtKey primitives directly — those
// aren't part of the shared StorageProvider interface since they're inherently single-provider
// operations that only the migration job needs.
export const supabaseProvider = new SupabaseStorageProvider();
export const r2Provider = new R2StorageProvider();

function providerFor(name: StorageProviderName | null | undefined): StorageProvider {
  return name === "r2" ? r2Provider : supabaseProvider;
}

function groupByProvider(refs: EvidenceStorageRef[]) {
  const groups = new Map<StorageProviderName, EvidenceStorageRef[]>();
  for (const ref of refs) {
    const name: StorageProviderName = ref.storage_provider === "r2" ? "r2" : "supabase";
    const bucket = groups.get(name) ?? [];
    bucket.push(ref);
    groups.set(name, bucket);
  }
  return groups;
}

async function mergeDeleteResults(results: DeleteResult[]): Promise<DeleteResult> {
  const warnings = results.map((r) => r.warning).filter(Boolean) as string[];
  return { deleted: results.every((r) => r.deleted), warning: warnings.length ? warnings.join("; ") : undefined };
}

// Phase 7: dispatches a batch of visit_evidence rows across Supabase and R2 based on each row's
// `storage_provider` column — the gallery, submissions, and delete routes never need to know or
// care that a page of results might be a mix of both.
//
// This is the piece that makes the *real* archival model work later: active/completed-in-
// retention campaigns stay on Supabase as a lifecycle fact (Phase 8), and only the Phase 9
// migration job ever flips an existing row's storage_provider to 'r2' after archiving a
// campaign. This dispatcher just needs to read whatever that column says — it doesn't decide it.
//
// `uploadEvidenceFile` is the one exception: it reads `platform_settings.default_storage_provider`
// to pick a provider for a brand-new file. That flag is a one-off Phase 7 test knob (prove R2
// works end-to-end before Phase 9 exists), not an ongoing archival lever — expect it to stay
// 'supabase' permanently in normal operation.
class MultiStorageProvider implements StorageProvider {
  async uploadEvidenceFile(input: UploadEvidenceInput): Promise<UploadEvidenceResult> {
    const defaultProvider = await getPlatformSettingValue("default_storage_provider");
    const provider = providerFor(defaultProvider === "r2" ? "r2" : "supabase");
    return provider.uploadEvidenceFile(input);
  }

  async getEvidenceSignedUrl(ref: EvidenceStorageRef, ttlSeconds?: number): Promise<string | null> {
    return providerFor(ref.storage_provider).getEvidenceSignedUrl(ref, ttlSeconds);
  }

  async getEvidenceSignedUrls(refs: EvidenceStorageRef[], ttlSeconds?: number): Promise<Map<string, string>> {
    const groups = groupByProvider(refs);
    const merged = new Map<string, string>();
    for (const [name, group] of groups) {
      const partial = await providerFor(name).getEvidenceSignedUrls(group, ttlSeconds);
      for (const [key, value] of partial) merged.set(key, value);
    }
    return merged;
  }

  async deleteEvidenceFile(ref: EvidenceStorageRef): Promise<DeleteResult> {
    return providerFor(ref.storage_provider).deleteEvidenceFile(ref);
  }

  async deleteEvidenceFiles(refs: EvidenceStorageRef[]): Promise<DeleteResult> {
    const groups = groupByProvider(refs);
    const results = await Promise.all(
      [...groups.entries()].map(([name, group]) => providerFor(name).deleteEvidenceFiles(group))
    );
    return mergeDeleteResults(results);
  }
}

// Single instance for the whole app, matching how every other lib/* singleton in this codebase
// is consumed (no DI container).
export const storageProvider: StorageProvider = new MultiStorageProvider();

export type {
  StorageProvider,
  StorageProviderName,
  EvidenceStorageRef,
  EvidenceLocation,
  UploadEvidenceInput,
  UploadEvidenceResult,
} from "@/lib/storage/types";
