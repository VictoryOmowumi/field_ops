import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { extendCampaignRetention, forceArchiveCampaign, unarchiveCampaign } from "@/lib/billing/archival-scheduler";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

type ArchiveActionPayload = {
  action: "archive" | "unarchive" | "extend";
  additionalDays?: number;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const { id: campaignId } = await context.params;
  const payload = (await request.json()) as Partial<ArchiveActionPayload>;

  try {
    if (payload.action === "archive") {
      const campaign = await forceArchiveCampaign({ campaignId, actorUserId: auth.user.id });
      return NextResponse.json({ success: true, campaign });
    }

    if (payload.action === "unarchive") {
      const campaign = await unarchiveCampaign({ campaignId, actorUserId: auth.user.id });
      return NextResponse.json({ success: true, campaign });
    }

    if (payload.action === "extend") {
      const additionalDays = Number(payload.additionalDays);
      if (!Number.isFinite(additionalDays) || additionalDays <= 0) {
        return NextResponse.json({ success: false, message: "additionalDays must be a positive number." }, { status: 400 });
      }
      const supabase = createServerSupabaseClient();
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .select("organization_id")
        .eq("id", campaignId)
        .maybeSingle();
      if (error || !campaign) {
        return NextResponse.json({ success: false, message: error?.message ?? "Campaign not found." }, { status: 404 });
      }
      await extendCampaignRetention({ organizationId: campaign.organization_id, additionalDays, actorUserId: auth.user.id });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update campaign archival state." },
      { status: 500 }
    );
  }
}
