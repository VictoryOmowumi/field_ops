import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin, writePlatformAuditLog } from "@/lib/platform/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlatformSettingItem } from "@/types/platform";

type PatchPayload = {
  items: Array<{ key: string; value: string }>;
};

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value, section, label")
    .order("section", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const settings: PlatformSettingItem[] = (data ?? []).map((item) => ({
    key: item.key,
    value: item.value,
    section: item.section as PlatformSettingItem["section"],
    label: item.label,
  }));

  return NextResponse.json({ success: true, settings });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const payload = (await request.json()) as Partial<PatchPayload>;
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return NextResponse.json({ success: false, message: "No settings supplied." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const keys = payload.items.map((item) => item.key);
  const { data: existing, error: existingError } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", keys);
  if (existingError) {
    return NextResponse.json({ success: false, message: existingError.message }, { status: 500 });
  }

  for (const item of payload.items) {
    await supabase
      .from("platform_settings")
      .update({ value: item.value, updated_at: new Date().toISOString(), updated_by: auth.user.id })
      .eq("key", item.key);
  }

  await writePlatformAuditLog({
    actorUserId: auth.user.id,
    targetType: "platform_settings",
    targetId: keys.join(","),
    action: "platform_settings.updated",
    beforeState: existing ?? [],
    afterState: payload.items,
  });

  return NextResponse.json({ success: true });
}

