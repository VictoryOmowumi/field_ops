import { NextRequest, NextResponse } from "next/server";

import { isAgentAssignedToCampaign } from "@/lib/auth/agent-access";
import { getPrimaryOrgMembership } from "@/lib/auth/org-context";
import { getAuthenticatedUserFromRequest, hasRequiredRole } from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) return unauthorized();
  if (!hasRequiredRole(user, ["agent", "admin", "super_admin"])) return forbidden();
  const membership = await getPrimaryOrgMembership(user.id);
  if (!membership) return forbidden();

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const radius = Number(request.nextUrl.searchParams.get("radius") ?? "250");

  if (!campaignId || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ success: false, message: "campaignId, lat and lng are required." }, { status: 400 });
  }

  const assigned = await isAgentAssignedToCampaign(membership.organizationId, campaignId, user.id);
  if (!assigned) return forbidden();

  const supabase = createServerSupabaseClient();
  const { data: outlets, error } = await supabase
    .from("outlets")
    .select("id, name, outlet_type, phone, latitude, longitude, created_at")
    .eq("organization_id", membership.organizationId)
    .eq("campaign_id", campaignId)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const nearby = (outlets ?? [])
    .map((outlet) => ({
      ...outlet,
      distanceMeters: distanceMeters(lat, lng, Number(outlet.latitude), Number(outlet.longitude)),
    }))
    .filter((outlet) => outlet.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return NextResponse.json({ success: true, outlets: nearby });
}

