import { NextResponse } from "next/server";
import { introspect, readConfig, serverVersion } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Schema introspection. Reports `configured: false` so the UI can fall back. */
export async function GET() {
  const config = readConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      reason: "DB_HOST and DB_USER are not set. Copy .env.example to .env.local.",
    });
  }

  try {
    const [databases, version] = await Promise.all([introspect(), serverVersion()]);
    return NextResponse.json({
      configured: true,
      databases,
      server: {
        host: config.host,
        port: config.port,
        user: config.user,
        version,
        ssl: config.ssl,
      },
    });
  } catch (error) {
    const err = error as { message?: string; code?: string };
    return NextResponse.json(
      {
        configured: true,
        error: err.message ?? String(error),
        code: err.code ?? "UNKNOWN",
        // Still report where we tried, so the UI can name the failing host.
        server: {
          host: config.host,
          port: config.port,
          user: config.user,
          ssl: config.ssl,
        },
      },
      { status: 502 }
    );
  }
}
