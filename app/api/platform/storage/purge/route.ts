import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { purgeVerifiedSupabaseOriginals } from "@/lib/storage/media-migration";

type PurgePayload = { minAgeDays?: number; dryRun?: boolean };

// Deliberately manual-only, never scheduled — deleting the last remaining copy of a file is the
// one truly irreversible action anywhere in this rollout, so a human triggers it explicitly every
// time, always after reviewing a dry-run first.
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const payload = (await request.json().catch(() => ({}))) as PurgePayload;
  const minAgeDays = Number.isFinite(payload.minAgeDays) && Number(payload.minAgeDays) > 0 ? Number(payload.minAgeDays) : 30;

  try {
    const result = await purgeVerifiedSupabaseOriginals({
      minAgeDays,
      dryRun: payload.dryRun !== false,
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Purge failed." },
      { status: 500 }
    );
  }
}
