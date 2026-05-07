"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import GuidedVisitFlow from "@/components/agent/workflow/GuidedVisitFlow";
import SectionHeader from "@/components/agent/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authorizedFetch } from "@/lib/api/client";
import { db } from "@/lib/offline/db";
import { enqueueSyncRecord } from "@/lib/offline/queue";
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
    setGpsReady(false);
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
    queryFn: async () =>
      (
        await authorizedFetch<{ success: boolean; campaign: CampaignResponse }>(`/api/agent/campaigns/${campaignId}`)
      ).campaign,
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
    requestGps();

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

    const submissionId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

    if (!isOnline) {
      await enqueueSyncRecord({
        id: submissionId,
        entityType: "visit",
        entityId: visitId,
        campaignId,
        payload: {
          id: visitId,
          campaign_id: campaignId,
          outlet_id: payload.selectedOutletRef.outletId ?? null,
          outcome: "pending",
          task_type: payload.activityPayloads[0]?.activityId ?? "register_outlet",
          task_payload: {
            activities: payload.activityPayloads,
            clientSubmissionMeta: enrichedPayload.clientSubmissionMeta ?? {},
          },
          visit_outcome_code: payload.outcome.code,
          visit_outcome_label: payload.outcome.label,
          state: payload.selectedOutletRef.outlet?.state ?? campaignQuery.data?.state ?? null,
          lga: payload.selectedOutletRef.outlet?.lga ?? null,
          latitude: payload.gps?.latitude ?? null,
          longitude: payload.gps?.longitude ?? null,
          location_accuracy: payload.gps?.locationAccuracy ?? null,
          sync_status: "pending",
          client_created_at: enrichedPayload.clientCreatedAt,
        },
        idempotencyKey: submissionId,
        retryCount: 0,
        createdAt: new Date().toISOString(),
      });

      for (const file of photos) {
        const photoQueueId = clientId("photo");
        const evidenceId = clientUuid();
        await db.evidenceBlobs.put({
          id: clientId("blob"),
          queueId: photoQueueId,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          blob: file,
          createdAt: new Date().toISOString(),
        });
        await enqueueSyncRecord({
          id: photoQueueId,
          entityType: "photo",
          entityId: photoQueueId,
          campaignId,
          dependencyIds: [submissionId],
          payload: {
            id: evidenceId,
            visit_id: visitId,
            file_name: file.name,
            file_type: file.type || null,
            file_size: file.size,
            file_url: `offline://${photoQueueId}`,
          },
          idempotencyKey: photoQueueId,
          retryCount: 0,
          createdAt: new Date().toISOString(),
        });
      }

      toast.success("Offline: visit saved to sync queue.");
      router.push(`/agent/campaigns/${campaignId}`);
      return;
    }

    const visitResponse = await authorizedFetch<{ success: boolean; visit: { id: string } }>("/api/agent/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrichedPayload),
    });

    for (const file of photos) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("idempotencyKey", clientId("photo"));
      await authorizedFetch(`/api/agent/visits/${visitResponse.visit.id}/evidence`, {
        method: "POST",
        body: formData,
      });
    }

    toast.success("Visit captured successfully.");
    router.push(`/agent/campaigns/${campaignId}`);
  }

  if (campaignQuery.isLoading || !gpsReady) {
    return (
      <main className="space-y-4 pt-4">
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
    return (
      <main className="space-y-4 pt-4">
        <SectionHeader title="Start Visit" subtitle="Campaign workflow" />
        <section className="rounded-2xl border border-border/70 bg-card p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {(campaignQuery.error as Error | undefined)?.message ?? "Campaign workflow not found."}
          </p>
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
      <section>
        <div className="flex items-start justify-between gap-3">
          <SectionHeader title="Start Visit" subtitle={campaignQuery.data.name} />
          <Badge variant="outline" className="rounded-full">
            {isOnline ? "Online" : "Offline"}
          </Badge>
        </div>
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
