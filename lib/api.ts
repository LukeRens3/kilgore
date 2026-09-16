import type { Connection, Database, QueryRun } from "./types";
import {
  MOCK_CONNECTIONS,
} from "./mockData";
import {
  fetchDatabases as fetchMockDatabases,
  runQuery as runMockQuery,
} from "./mockEngine";

/**
 * The browser-side data layer.
 *
 * Talks to the API routes, which hold the credentials. When the server reports
 * that no database is configured, everything falls back to the mock engine so
 * the editor still works for anyone without VPC access.
 */

export type DataSource = "mysql" | "mock";

export interface ServerInfo {
  host: string;
  port: number;
  user: string;
  /** Absent when the server could not be reached to ask. */
  version?: string;
  ssl: boolean;
}

export interface SchemaResult {
  source: DataSource;
  databases: Database[];
  server?: ServerInfo;
  /** Set when a real connection was configured but could not be reached. */
  error?: string;
}

export interface PingResult {
  configured: boolean;
  reachable: boolean;
  version?: string;
  latencyMs?: number;
  host?: string;
  port?: number;
  code?: string;
  message?: string;
}

/** Remembered so the connection list and status bar agree with the schema. */
let lastServer: ServerInfo | undefined;
let lastError: string | undefined;

// --- Schema ----------------------------------------------------------------

export async function fetchSchema(): Promise<SchemaResult> {
  try {
    const response = await fetch("/api/schema", { cache: "no-store" });
    const payload = await response.json();

    if (payload.configured === false) {
      lastServer = undefined;
      lastError = undefined;
      return { source: "mock", databases: await fetchMockDatabases("mock") };
    }

    if (!response.ok || payload.error) {
      lastServer = payload.server;
      lastError = payload.error ?? `Schema request failed (${response.status})`;
      return { source: "mysql", databases: [], server: payload.server, error: lastError };
    }

    lastServer = payload.server;
    lastError = undefined;
    return { source: "mysql", databases: payload.databases, server: payload.server };
  } catch (error) {
    // The route itself is unreachable - fall back rather than showing nothing.
    lastError = error instanceof Error ? error.message : String(error);
    return {
      source: "mock",
      databases: await fetchMockDatabases("mock"),
      error: lastError,
    };
  }
}

/** Kept for callers that only need the tree. */
export async function fetchDatabases(): Promise<Database[]> {
  return (await fetchSchema()).databases;
}

// --- Connections -----------------------------------------------------------

export async function listConnections(): Promise<Connection[]> {
  const schema = await fetchSchema();

  if (schema.source === "mock") {
    return MOCK_CONNECTIONS.map((connection) => ({ ...connection }));
  }

  const server = schema.server;
  return [
    {
      id: "env",
      name: server ? server.host.split(".")[0] || server.host : "Configured server",
      host: server?.host ?? "unknown",
      port: server?.port ?? 3306,
      username: server?.user ?? "",
      database: schema.databases[0]?.name,
      useSsl: server?.ssl ?? true,
      status: schema.error ? "error" : "connected",
      serverVersion: server?.version,
    },
  ];
}

export async function connect(connectionId: string): Promise<Connection> {
  const connections = await listConnections();
  const found = connections.find((c) => c.id === connectionId);
  if (found) return found;
  const fallback = MOCK_CONNECTIONS.find((c) => c.id === connectionId);
  if (!fallback) throw new Error(`Unknown connection: ${connectionId}`);
  return { ...fallback, status: "connected" };
}

export async function disconnect(connectionId: string): Promise<Connection> {
  const connections = await listConnections();
  const found =
    connections.find((c) => c.id === connectionId) ??
    MOCK_CONNECTIONS.find((c) => c.id === connectionId);
  if (!found) throw new Error(`Unknown connection: ${connectionId}`);
  return { ...found, status: "disconnected" };
}

export async function ping(): Promise<PingResult> {
  try {
    const response = await fetch("/api/ping", { cache: "no-store" });
    return (await response.json()) as PingResult;
  } catch (error) {
    return {
      configured: false,
      reachable: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Queries ---------------------------------------------------------------

export interface RunQueryInput {
  connectionId: string;
  database: string | null;
  sql: string;
  /** Only consulted by the mock engine. */
  databases: Database[];
}

export async function runQuery(input: RunQueryInput): Promise<QueryRun> {
  try {
    const response = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: input.sql,
        database: input.database,
        connectionId: input.connectionId,
      }),
    });

    if (response.status === 503) {
      // No database configured - the mock engine answers instead.
      return runMockQuery(input);
    }

    const payload = await response.json();

    if (!response.ok) {
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
              message: payload.error ?? `Query failed (${response.status})`,
            },
          },
        ],
      };
    }

    return payload as QueryRun;
  } catch (error) {
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

export function lastServerInfo(): ServerInfo | undefined {
  return lastServer;
}

export function lastSchemaError(): string | undefined {
  return lastError;
}
