import { NextResponse } from "next/server";

import { checkStorageHealth } from "@/lib/observability/health";

export async function GET() {
  const result = await checkStorageHealth();
  return NextResponse.json(
    { status: result.status, latencyMs: result.latencyMs },
    { status: result.status === "healthy" ? 200 : 503 }
  );
}
