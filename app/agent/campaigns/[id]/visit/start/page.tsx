"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import AgentBackButton from "@/components/agent/AgentBackButton";
import GuidedVisitFlow from "@/components/agent/workflow/GuidedVisitFlow";
import SectionHeader from "@/components/agent/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";
import {
  cacheAgentCampaignDetail,
  getCachedAgentCampaignDetail,
  isLikelyOfflineError,
  isOfflinePreloadRequiredError,
  OfflinePreloadRequiredError,
  type OfflineAware,
} from "@/lib/offline/agent-cache";
import { db } from "@/lib/offline/db";
import { enqueueSyncRecord } from "@/lib/offline/queue";
import { deriveVisitTaskType } from "@/lib/workflow";
import type { NearbyOutlet } from "@/types/campaign-form";
import type { CampaignWorkflowConfigV1, WorkflowSubmissionPayload } from "@/types/workflow";

type CampaignResponse = {
  id: string;
  name: string;
  state?: string | null;
  outlet_types?: string[];
  products?: Array<{ sku?: string; name?: string }>;
  workflow?: CampaignWorkflowConfigV1;
  agentCopy?: CampaignWorkflowConfigV1["agentCopy"];
};

type NearbyOutletResponse = {
  id: string;
  name: string;
  distanceMeters: number;
  latitude?: number | null;
  longitude?: number | null;
};

function clientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clientUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const hex = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
    .replace(/[^a-f0-9]/gi, "")
    .padEnd(32, "0")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type CompressedEvidence = {
  file: File;
  originalFileName: string;
  originalFileSize: number;
  compressedFileSize: number;
  mimeType: string;
};

async function compressEvidencePhoto(file: File): Promise<CompressedEvidence> {
  const originalFileName = file.name;
  const originalFileSize = file.size;
  const fallback = {
    file,
    originalFileName,
    originalFileSize,
    compressedFileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };

  if (!file.type.startsWith("image/")) return fallback;

  try {
    const bitmap = await createImageBitmap(file);
    const maxWidth = 1280;
    const targetWidth = Math.min(bitmap.width, maxWidth);
    const ratio = bitmap.width > 0 ? targetWidth / bitmap.width : 1;
    const targetHeight = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const quality = 0.7;
    const preferWebp = typeof HTMLCanvasElement !== "undefined" && canvas.toDataURL("image/webp").startsWith("data:image/webp");
    const outputMime = preferWebp ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), outputMime, quality);
    });
    if (!blob) return fallback;

    const baseName = originalFileName.replace(/\.[^/.]+$/, "");
    const ext = outputMime === "image/webp" ? "webp" : "jpg";
    const compressedFile = new File([blob], `${baseName}.${ext}`, { type: outputMime, lastModified: Date.now() });

    return {
      file: compressedFile,
      originalFileName,
      originalFileSize,
      compressedFileSize: compressedFile.size,
      mimeType: outputMime,
    };
  } catch {
    return fallback;
  }
}

export default function AgentVisitStartPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;
  const hasGeolocation = typeof navigator !== "undefined" && "geolocation" in navigator;

  const [gps, setGps] = useState<{ latitude?: number; longitude?: number; locationAccuracy?: number }>({});
  const [gpsError, setGpsError] = useState<string | null>(
    hasGeolocation ? null : "GPS is not available on this device."
  );
  const [gpsReady, setGpsReady] = useState(!hasGeolocation);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  function requestGps() {
    if (!hasGeolocation) {
      setGpsError("GPS is not available on this device.");
      setGpsReady(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationAccuracy: position.coords.accuracy,
        });
        setGpsError(null);
        setGpsReady(true);
      },
      () => {
        setGpsError("Unable to get GPS location. Please retry.");
        setGpsReady(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const campaignQuery = useQuery({
    queryKey: ["agent-campaign-workflow", campaignId],
    retry: (_, error) => !isLikelyOfflineError(error) && !isOfflinePreloadRequiredError(error),
    queryFn: async (): Promise<OfflineAware<CampaignResponse>> => {
      try {
        const campaign = (
          await authorizedFetch<{ success: boolean; campaign: CampaignResponse }>(`/api/agent/campaigns/${campaignId}`)
        ).campaign;
        await cacheAgentCampaignDetail(campaign);
        return { ...campaign, offlineStatus: "fresh" };
      } catch (error) {
        if (isLikelyOfflineError(error)) {
          const cached = await getCachedAgentCampaignDetail<CampaignResponse>(campaignId);
          if (cached) return { ...cached, offlineStatus: "cached" };
          throw new OfflinePreloadRequiredError("Reconnect once and open this campaign before starting visits offline.");
        }
        throw error;
      }
    },
  });
  const gpsRequired = campaignQuery.data?.workflow?.validationRules.requireGpsBeforeSubmit ?? false;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!hasGeolocation) {
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationAccuracy: position.coords.accuracy,
        });
        setGpsError(null);
        setGpsReady(true);
      },
      () => {
        setGpsError("Unable to get GPS location. Please retry.");
        setGpsReady(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [hasGeolocation]);

  const nearbyQuery = useQuery({
    queryKey: ["agent-nearby-outlets-workflow", campaignId, gps.latitude, gps.longitude],
    enabled: Boolean(campaignId && gps.latitude && gps.longitude),
    queryFn: async () =>
      (
        await authorizedFetch<{ success: boolean; outlets: NearbyOutletResponse[] }>(
          `/api/agent/outlets/nearby?campaignId=${campaignId}&lat=${gps.latitude}&lng=${gps.longitude}&radius=250`
        )
      ).outlets,
  });

  async function handleSubmit(payload: WorkflowSubmissionPayload, photos: File[]) {
    if (
      campaignQuery.data?.workflow?.validationRules.requireGpsBeforeSubmit &&
      (typeof payload.gps?.latitude !== "number" || typeof payload.gps?.longitude !== "number")
    ) {
      throw new Error("GPS capture is required by campaign configuration.");
    }

    if (payload.selectedOutletRef.mode === "existing" && !payload.selectedOutletRef.outletId) {
      throw new Error("Existing outlet selection is required.");
    }

    const submittedKey =
      typeof payload.idempotencyKey === "string" && payload.idempotencyKey.trim().length > 0
        ? payload.idempotencyKey.trim()
        : typeof payload.clientSubmissionMeta?.idempotencyKey === "string" && payload.clientSubmissionMeta.idempotencyKey.trim().length > 0
          ? payload.clientSubmissionMeta.idempotencyKey.trim()
          : null;
    const submissionId = submittedKey ?? `wf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const visitId = clientUuid();
    const enrichedPayload: WorkflowSubmissionPayload = {
      ...payload,
      idempotencyKey: submissionId,
      clientCreatedAt: new Date().toISOString(),
      syncStatus: isOnline ? "synced" : "pending",
      clientSubmissionMeta: {
        ...(payload.clientSubmissionMeta ?? {}),
        idempotencyKey: submissionId,
        offlineQueued: !isOnline,
      },
    };

    const compressedPhotos = await Promise.all(photos.map((file) => compressEvidencePhoto(file)));

    // Queue logic shared between true-offline and server-unreachable fallback cases.
    async function doOfflineQueue(toastMsg: string) {
      const outletDependencyIds: string[] = [];
      let resolvedOutletId: string;
      let visitState: string | null;
      let visitLga: string | null;

      if (payload.selectedOutletRef.mode === "existing") {
        resolvedOutletId = payload.selectedOutletRef.outletId;
        visitState = campaignQuery.data?.state ?? null;
        visitLga = null;
      } else {
        const outletInput = payload.selectedOutletRef.outlet;
        const outletQueueId = clientId("outlet");
        const outletEntityId = clientUuid();
        resolvedOutletId = outletEntityId;
        visitState = outletInput.state ?? campaignQuery.data?.state ?? null;
        visitLga = outletInput.lga ?? null;
        outletDependencyIds.push(outletQueueId);

        await enqueueSyncRecord({
          id: outletQueueId,
          entityType: "outlet",
          entityId: outletEntityId,
          campaignId,
          payload: {
            id: outletEntityId,
            campaign_id: campaignId,
            name: outletInput.name,
            outlet_type: outletInput.outletType ?? null,
            contact_person: outletInput.contactPerson,
            phone: outletInput.phone,
            address: outletInput.address,
            state: visitState,
            lga: outletInput.lga,
            latitude: payload.gps?.latitude ?? null,
            longitude: payload.gps?.longitude ?? null,
            location_accuracy: payload.gps?.locationAccuracy ?? null,
            sync_status: "pending",
          },
          idempotencyKey: outletQueueId,
          retryCount: 0,
          createdAt: new Date().toISOString(),
        });
      }

      await enqueueSyncRecord({
        id: submissionId,
        entityType: "visit",
        entityId: visitId,
        campaignId,
        dependencyIds: outletDependencyIds.length > 0 ? outletDependencyIds : undefined,
        payload: {
          id: visitId,
          campaign_id: campaignId,
          outlet_id: resolvedOutletId,
          outlet_ref_mode: payload.selectedOutletRef.mode,
          outcome: "pending",
          task_type: deriveVisitTaskType(
            payload.activityPayloads.map((item) => item.activityId),
            payload.selectedOutletRef.mode
          ),
          task_payload: {
            activities: payload.activityPayloads,
            clientSubmissionMeta: {
              ...(enrichedPayload.clientSubmissionMeta ?? {}),
              clientCreatedAt: enrichedPayload.clientCreatedAt,
            },
          },
          visit_outcome_code: payload.outcome.code,
          visit_outcome_label: payload.outcome.label,
          state: visitState,
          lga: visitLga,
          latitude: payload.gps?.latitude ?? null,
          longitude: payload.gps?.longitude ?? null,
          location_accuracy: payload.gps?.locationAccuracy ?? null,
          sync_status: "pending",
        },
        idempotencyKey: submissionId,
        retryCount: 0,
        createdAt: new Date().toISOString(),
      });

      for (const photo of compressedPhotos) {
        const photoQueueId = clientId("photo");
        const evidenceId = clientUuid();
        await db.evidenceBlobs.put({
          id: clientId("blob"),
          queueId: photoQueueId,
          fileName: photo.file.name,
          fileType: photo.file.type || "application/octet-stream",
          blob: photo.file,
          createdAt: new Date().toISOString(),
        });
        await enqueueSyncRecord({
          id: photoQueueId,
          entityType: "photo",
          entityId: photoQueueId,
          campaignId,
          dependencyIds: [submissionId],
          // No file_url here — syncPhotoRecord (lib/offline/sync.ts) uploads the actual blob
          // from db.evidenceBlobs via multipart when this record syncs, and the server assigns
          // the real file_url at that point, the same as the online capture path.
          payload: {
            id: evidenceId,
            visit_id: visitId,
            file_name: photo.file.name,
            file_type: photo.file.type || null,
            file_size: photo.file.size,
            original_file_name: photo.originalFileName,
            original_file_size: photo.originalFileSize,
            compressed_file_size: photo.compressedFileSize,
            mime_type: photo.mimeType,
          },
          idempotencyKey: photoQueueId,
          retryCount: 0,
          createdAt: new Date().toISOString(),
        });
      }

      toast.success(toastMsg);
      // Full navigation so the SW handles it (network-first + cache fallback); router.push() triggers an RSC fetch that always fails offline.
      window.location.assign(`/agent/campaigns/${campaignId}`);
    }

    if (!isOnline) {
      await doOfflineQueue("Offline: visit saved to sync queue.");
      return;
    }

    try {
      const visitResponse = await authorizedFetch<{ success: boolean; visit: { id: string } }>("/api/agent/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enrichedPayload),
      });

      if (compressedPhotos.length > 0) {
        void (async () => {
          const uploadResults = await Promise.allSettled(
            compressedPhotos.map(async (photo) => {
              const formData = new FormData();
              formData.append("file", photo.file);
              formData.append("idempotencyKey", clientId("photo"));
              formData.append("originalFileName", photo.originalFileName);
              formData.append("originalFileSize", String(photo.originalFileSize));
              formData.append("compressedFileSize", String(photo.compressedFileSize));
              formData.append("mimeType", photo.mimeType);
              await authorizedFetch(`/api/agent/visits/${visitResponse.visit.id}/evidence`, {
                method: "POST",
                body: formData,
              });
            })
          );

          const failedUploads = uploadResults.filter((result) => result.status === "rejected").length;
          if (failedUploads > 0) {
            toast.error(
              `${failedUploads} photo${failedUploads === 1 ? "" : "s"} failed to upload. Open this visit later to retry evidence upload.`
            );
          }
        })();
      }

      toast.success(
        photos.length > 0
          ? "Visit captured. Photos are uploading in the background."
          : "Visit captured successfully."
      );
      router.push(`/agent/campaigns/${campaignId}`);
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        // Server-side connectivity failure (auth provider DNS down, Supabase unreachable).
        // Queue the visit for later sync instead of losing the agent's work.
        await doOfflineQueue("Server temporarily unavailable. Visit saved to sync queue.");
        return;
      }
      throw error;
    }
  }

  if (campaignQuery.isLoading || !gpsReady) {
    return (
      <main className="space-y-4 pt-4">
        <AgentBackButton href={`/agent/campaigns/${campaignId}`} />
        <SectionHeader title="Start Visit" subtitle="Loading guided visit flow..." />
        <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full" />
        </section>
      </main>
    );
  }

  if (campaignQuery.error || !campaignQuery.data?.workflow) {
    const needsOnlinePreload = isOfflinePreloadRequiredError(campaignQuery.error);
    return (
      <main className="space-y-4 pt-4">
        <AgentBackButton href={`/agent/campaigns/${campaignId}`} />
        <SectionHeader title="Start Visit" subtitle={needsOnlinePreload ? "Offline preparation needed" : "Campaign workflow"} />
        <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-3">
          {needsOnlinePreload ? (
            <>
              <Badge variant="outline" className="w-fit rounded-full border-amber-300 bg-amber-50 text-amber-900">
                Needs online preload
              </Badge>
              <p className="text-sm text-muted-foreground">
                Reconnect once and open this campaign before going offline. The visit form needs the cached campaign workflow.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {(campaignQuery.error as Error | undefined)?.message ?? "Campaign workflow not found."}
            </p>
          )}
          <Button asChild className="rounded-full">
            <Link href={`/agent/campaigns/${campaignId}`}>Back to Campaign</Link>
          </Button>
        </section>
      </main>
    );
  }

  const nearbyOutlets: NearbyOutlet[] = (nearbyQuery.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    distanceMeters: item.distanceMeters,
    latitude: item.latitude ?? undefined,
    longitude: item.longitude ?? undefined,
  }));

  return (
    <main className="space-y-4 pt-4">
      <AgentBackButton href={`/agent/campaigns/${campaignId}`} />
      <section>
        <div className="flex items-start justify-between gap-3">
          <SectionHeader title="Start Visit" subtitle={campaignQuery.data.name} />
          <Badge variant="outline" className="rounded-full">
            {campaignQuery.data.offlineStatus === "cached" ? "Cached workflow" : isOnline ? "Online" : "Offline"}
          </Badge>
        </div>
        {campaignQuery.data.offlineStatus === "cached" ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            Offline mode: this visit form is using the campaign workflow saved on this device.
          </div>
        ) : null}
        {gpsError ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{gpsError}</p>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={requestGps}>
              Retry GPS
            </Button>
          </div>
        ) : null}
        {gpsRequired && (typeof gps.latitude !== "number" || typeof gps.longitude !== "number") ? (
          <p className="mt-2 text-xs text-amber-500">GPS is required for this campaign before submission.</p>
        ) : null}
      </section>

      <GuidedVisitFlow
        campaignId={campaignId}
        workflow={campaignQuery.data.workflow}
        outletTypes={campaignQuery.data.outlet_types ?? []}
        productOptions={campaignQuery.data.products ?? []}
        stateName={campaignQuery.data.state}
        nearbyOutlets={nearbyOutlets}
        gps={gps}
        isOnline={isOnline}
        onSubmit={handleSubmit}
      />
    </main>
  );
}


