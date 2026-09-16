import { NextResponse } from "next/server";
import { readConfig, runStatements } from "@/lib/db";
import { splitStatements } from "@/lib/sql";
import type { QueryRun } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueryRequest {
  sql?: unknown;
  database?: unknown;
  connectionId?: unknown;
}

export async function POST(request: Request) {
  const config = readConfig();
  if (!config) {
    return NextResponse.json(
      { configured: false, reason: "Database is not configured." },
      { status: 503 }
    );
  }

  let body: QueryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const sql = typeof body.sql === "string" ? body.sql : "";
  const database = typeof body.database === "string" && body.database ? body.database : null;
  if (!sql.trim()) {
    return NextResponse.json({ error: "No SQL supplied" }, { status: 400 });
  }

  const statements = splitStatements(sql);
  if (statements.length === 0) {
    return NextResponse.json({ error: "No statements to run" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const results = await runStatements(statements, database);
    const run: QueryRun = {
      id: `run_${startedAt.toString(36)}`,
      connectionId: typeof body.connectionId === "string" ? body.connectionId : "default",
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
      { status: 502 }
    );
  }
}
