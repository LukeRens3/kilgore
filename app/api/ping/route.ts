import { NextResponse } from "next/server";
import {
  authenticate,
  DB_ACCESS_DENIED,
  isAuthError,
  readCredentials,
  readServerConfig,
} from "@/lib/db";
import { clientKey, recordFailure, recordSuccess, retryAfter } from "@/lib/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Credential check behind the sign-in prompt: connects to MySQL as the supplied
 * user and reports what happened. Also handy for diagnosing network problems,
 * since an unreachable host and a rejected password land in different branches.
 *
 * POST rather than GET so the password stays out of URLs, logs and referrers.
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
    return NextResponse.json({ error: "A MySQL username is required." }, { status: 400 });
  }

  const key = clientKey(request);
  const wait = retryAfter(key);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many failed sign-in attempts. Try again in ${wait}s.` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  const started = Date.now();
  try {
    const version = await authenticate(credentials);
    recordSuccess(key);
    return NextResponse.json({
      configured: true,
      reachable: true,
      authenticated: true,
      version,
      latencyMs: Date.now() - started,
      host: config.host,
      port: config.port,
      user: credentials.user,
      ssl: config.ssl,
    });
  } catch (error) {
    const err = error as { message?: string; code?: string; errno?: number };
    // At sign-in a default schema the user cannot open is also a reason to stay
    // on the form, so it counts as a rejection here but nowhere else.
    const rejected = isAuthError(error) || err.code === DB_ACCESS_DENIED;
    if (rejected) recordFailure(key);

    return NextResponse.json(
      {
        configured: true,
        // A rejected password proves the server answered.
        reachable: rejected,
        authenticated: false,
        host: config.host,
        port: config.port,
        code: err.code ?? "UNKNOWN",
        errno: err.errno,
        message: err.message ?? String(error),
        latencyMs: Date.now() - started,
      },
      { status: rejected ? 401 : 502 }
    );
  }
}
