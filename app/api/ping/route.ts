import { NextResponse } from "next/server";
import { readConfig, serverVersion } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection check, used by the UI and handy for diagnosing VPC/SG problems. */
export async function GET() {
  const config = readConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      reason: "DB_HOST and DB_USER are not set.",
    });
  }

  const started = Date.now();
  try {
    const version = await serverVersion();
    return NextResponse.json({
      configured: true,
      reachable: true,
      version,
      latencyMs: Date.now() - started,
      host: config.host,
      port: config.port,
      user: config.user,
      ssl: config.ssl,
    });
  } catch (error) {
    const err = error as { message?: string; code?: string; errno?: number };
    return NextResponse.json(
      {
        configured: true,
        reachable: false,
        host: config.host,
        port: config.port,
        code: err.code ?? "UNKNOWN",
        errno: err.errno,
        message: err.message ?? String(error),
        latencyMs: Date.now() - started,
      },
      { status: 502 }
    );
  }
}
