import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: true,
    status: "ok",
    serverTime: new Date().toISOString(),
    message: "Sync health endpoint ready",
  });
}
