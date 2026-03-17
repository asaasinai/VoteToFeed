import { NextRequest, NextResponse } from "next/server";

/**
 * Verify the cron request is authorized via CRON_SECRET.
 * Supports both Vercel cron Authorization header and manual x-cron-secret triggers.
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function verifyCronSecret(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const xCronSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    console.error("[cron-auth] CRON_SECRET env var is not set — blocking request");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }

  const isAuthorized = authHeader === `Bearer ${cronSecret}` || xCronSecret === cronSecret;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
