import type { UploadEvidenceInput } from "@/lib/storage/types";

// Shared by every provider so the {organizationId}/{visitId}/… convention — and the tenant
// isolation it provides — stays identical regardless of which bucket a file actually lands in.
// See docs/architecture/commercial-licensing-architecture.md §12, "Access model".
export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildEvidenceObjectKey(input: UploadEvidenceInput) {
  const safeFileName = sanitizeFileName(input.fileName);
  return `${input.organizationId}/${input.visitId}/${input.idempotencyKey || Date.now().toString()}-${safeFileName}`;
}
