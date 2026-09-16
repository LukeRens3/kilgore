import { NextResponse } from "next/server";
import { introspect, isAuthError, readCredentials, readServerConfig } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Schema introspection as the signed-in user. What comes back is whatever that
 * user's grants let information_schema show them, so the sidebar is scoped by
 * MySQL rather than trimmed here.
 */
export async function POST(request: Request) {
  const config = readServerConfig();
  if (!config) {
    return NextResponse.json(
      { configured: false, reason: "DB_HOST is not set on the server." },
      { status: 503 }
    );
  }

  const credentials = readCredentials(await request.json().catch(() => null));
  if (!credentials) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const { databases, version } = await introspect(credentials);
    return NextResponse.json({
      configured: true,
      databases,
      server: {
        host: config.host,
        port: config.port,
        user: credentials.user,
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
          user: credentials.user,
          ssl: config.ssl,
        },
      },
      { status: isAuthError(error) ? 401 : 502 }
    );
  }
}
