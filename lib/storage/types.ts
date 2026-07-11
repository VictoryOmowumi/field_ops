// Phase 6: Storage Abstraction, extended in Phase 7 for dual-provider dispatch. One seam for
// storage operations so R2 can exist alongside Supabase without touching every route that used
// to hardcode `supabase.storage.from("evidence")`.
// See docs/architecture/commercial-licensing-architecture.md §12.

export type StorageProviderName = "supabase" | "r2";

export type EvidenceLocation = {
  bucket: string;
  objectKey: string;
};

export type UploadEvidenceInput = {
  organizationId: string;
  visitId: string;
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
  idempotencyKey?: string;
};

export type UploadEvidenceResult = EvidenceLocation & {
  path: string;
  storageProvider: StorageProviderName;
};

// The minimal shape every provider method needs from a visit_evidence row. Real rows carry a lot
// more (file_size, mime_type, etc.) — every provider operation resolves its target from file_url
// (the path/object key) plus storage_provider, which is what the resolver in lib/storage/index.ts
// uses to route a batch of mixed Supabase/R2 rows to the right underlying provider.
export type EvidenceStorageRef = {
  file_url: string;
  storage_provider?: StorageProviderName | null;
};

export type DeleteResult = {
  deleted: boolean;
  warning?: string;
};

export type MigrationResult = {
  migrated: number;
  skipped: number;
  failed: number;
};

// Read/write/delete only — what every provider does to its own bucket. Archiving is inherently
// cross-provider (copy Supabase -> R2), which doesn't fit as "a thing one provider does to
// itself", so it deliberately isn't part of this shared interface. See lib/storage/media-migration.ts
// (Phase 9), which orchestrates both concrete providers directly instead.
export interface StorageProvider {
  uploadEvidenceFile(input: UploadEvidenceInput): Promise<UploadEvidenceResult>;

  // Batched, not just the roadmap's originally-sketched single-row signature — the two real call
  // sites (submission detail, campaign evidence gallery) both need N signed URLs per request, and
  // routing that through a per-row method would turn one Storage API call into N.
  getEvidenceSignedUrl(ref: EvidenceStorageRef, ttlSeconds?: number): Promise<string | null>;
  getEvidenceSignedUrls(refs: EvidenceStorageRef[], ttlSeconds?: number): Promise<Map<string, string>>;

  deleteEvidenceFile(ref: EvidenceStorageRef): Promise<DeleteResult>;
  deleteEvidenceFiles(refs: EvidenceStorageRef[]): Promise<DeleteResult>;
}
