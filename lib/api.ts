import type { Database, QueryRun } from "./types";

/**
 * The browser-side data layer.
 *
 * There is no service account behind these routes: the signed-in user's MySQL
 * credentials travel in the body of every request and are held only in React
 * state, so a refresh signs you out. Nothing is written to a cookie, to
 * localStorage, or to any server-side session.
 */

export interface Credentials {
  user: string;
  password: string;
  /** Optional schema the session opens with; the UI can switch freely after. */
  database?: string;
}

/** Where the server is pointed. Fixed by deployment, same for every visitor. */
export interface ServerConfig {
  host: string;
  port: number;
  ssl: boolean;
}

export interface ServerInfo extends ServerConfig {
  user: string;
  /** Absent when the server could not be reached to ask. */
  version?: string;
}

export interface SchemaResult {
  databases: Database[];
  server?: ServerInfo;
  /** Set when the schema could not be read. */
  error?: string;
}

/** Thrown when MySQL rejects the credentials, so callers can re-prompt. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

async function postJson(path: string, body: unknown): Promise<any> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new AuthError(payload.message ?? payload.error ?? "Access denied.");
  }
  if (!response.ok) {
    throw new Error(
      payload.message ?? payload.error ?? payload.reason ?? `Request failed (${response.status})`
    );
  }
  return payload;
}

// --- Server identity -------------------------------------------------------

/** Reads which server the sign-in prompt will authenticate against. */
export async function fetchServerConfig(): Promise<ServerConfig> {
  const response = await fetch("/api/config", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!payload.configured) {
    throw new Error(payload.reason ?? "The server has no database configured.");
  }
  return { host: payload.host, port: payload.port, ssl: payload.ssl };
}

// --- Sign in ---------------------------------------------------------------

/**
 * Verifies credentials by opening a real MySQL connection as that user.
 * Resolves with the server version; throws AuthError if MySQL says no.
 */
export async function signIn(credentials: Credentials): Promise<string> {
  const payload = await postJson("/api/ping", credentials);
  return payload.version ?? "unknown";
}

// --- Schema ----------------------------------------------------------------

export async function fetchSchema(credentials: Credentials): Promise<SchemaResult> {
  try {
    const payload = await postJson("/api/schema", credentials);
    return { databases: payload.databases ?? [], server: payload.server };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return {
      databases: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Queries ---------------------------------------------------------------

export interface RunQueryInput {
  credentials: Credentials;
  connectionId: string;
  database: string | null;
  sql: string;
}

export async function runQuery(input: RunQueryInput): Promise<QueryRun> {
  try {
    return (await postJson("/api/query", {
      ...input.credentials,
      sql: input.sql,
      database: input.database,
      connectionId: input.connectionId,
    })) as QueryRun;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    // A transport or connection failure, not a SQL error: surface it as one
    // failed statement so it shows up in the Messages tab like anything else.
    return {
      id: `run_err_${Date.now().toString(36)}`,
      connectionId: input.connectionId,
      database: input.database,
      startedAt: Date.now(),
      totalDurationMs: 0,
      statements: [
        {
          sql: input.sql,
          durationMs: 0,
          outcome: {
            kind: "error",
            code: 2002,
            sqlState: "HY000",
            message: error instanceof Error ? error.message : String(error),
          },
        },
      ],
    };
  }
}
