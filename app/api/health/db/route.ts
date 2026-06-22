import { NextResponse } from "next/server";

import { checkDatabaseHealth } from "@/lib/observability/health";

export async function GET() {
  const result = await checkDatabaseHealth();
  return NextResponse.json(
    { status: result.status, latencyMs: result.latencyMs },
    { status: result.status === "healthy" ? 200 : 503 }
  );
}
