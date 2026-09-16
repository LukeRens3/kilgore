import { NextResponse } from "next/server";
import { readServerConfig } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only unauthenticated endpoint: it tells the sign-in prompt which server
 * it is about to authenticate against. No credentials, no schema, no data.
 */
export async function GET() {
  const config = readServerConfig();
  if (!config) {
    return NextResponse.json(
      { configured: false, reason: "DB_HOST is not set on the server." },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { configured: true, host: config.host, port: config.port, ssl: config.ssl },
    { headers: { "Cache-Control": "no-store" } }
  );
}
