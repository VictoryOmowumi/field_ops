import { NextResponse } from "next/server";

import { checkDatabaseHealth, checkStorageHealth } from "@/lib/observability/health";

export async function GET() {
  const startedAt = Date.now();
  const [database, storage] = await Promise.all([checkDatabaseHealth(), checkStorageHealth()]);
  const latencyMs = Date.now() - startedAt;

  const status = database.status === "unhealthy" ? "unhealthy" : storage.status === "unhealthy" ? "degraded" : "healthy";

  return NextResponse.json(
    {
      status,
      database: database.status,
      storage: storage.status,
      latencyMs,
    },
    { status: status === "unhealthy" ? 503 : 200 }
  );
}
