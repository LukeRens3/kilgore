import { NextResponse } from "next/server";
import { isAuthError, readCredentials, readServerConfig, runStatements } from "@/lib/db";
import { splitStatements } from "@/lib/sql";
import type { QueryRun } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueryRequest {
  sql?: unknown;
  database?: unknown;
  connectionId?: unknown;
}

/**
 * Runs SQL as the signed-in user. There is no allow-list here on purpose: what
 * a statement may do is decided by that user's MySQL grants, so restricting
 * someone is a GRANT/REVOKE, not a change to this file.
 */
export async function POST(request: Request) {
  const config = readServerConfig();
  if (!config) {
    return NextResponse.json(
      { configured: false, reason: "DB_HOST is not set on the server." },
      { status: 503 }
    );
  }

  let body: QueryRequest | null;
  try {
    body = (await request.json()) as QueryRequest;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const credentials = readCredentials(body);
  if (!credentials) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sql = typeof body?.sql === "string" ? body.sql : "";
  const database =
    typeof body?.database === "string" && body.database ? body.database : null;
  if (!sql.trim()) {
    return NextResponse.json({ error: "No SQL supplied" }, { status: 400 });
  }

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    return NextResponse.json({ error: "No statements to run" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const results = await runStatements(credentials, statements, database);
    const run: QueryRun = {
      id: `run_${startedAt.toString(36)}`,
      connectionId: typeof body?.connectionId === "string" ? body.connectionId : "default",
      database,
      statements: results,
      startedAt,
      totalDurationMs: Number(
        results.reduce((sum, r) => sum + r.durationMs, 0).toFixed(1)
      ),
    };
    return NextResponse.json(run);
  } catch (error) {
    // Connection-level failures (host unreachable, auth rejected) land here;
    // per-statement SQL errors are reported inside the run instead.
    const err = error as { message?: string; code?: string };
    return NextResponse.json(
      { error: err.message ?? String(error), code: err.code ?? "UNKNOWN" },
      { status: isAuthError(error) ? 401 : 502 }
    );
  }
}
