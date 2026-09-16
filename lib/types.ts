/**
 * Domain types for the SQL editor.
 *
 * These are deliberately transport-agnostic: whatever backend we wire up later
 * (Amplify Data, a REST route, a Lambda proxying mysql2) only has to produce
 * these shapes. Nothing in `components/` imports anything but this file and
 * `lib/api.ts`.
 */

export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

/**
 * The session's live connection, derived from the server's fixed address plus
 * whoever signed in. Deliberately holds no password: credentials live only in
 * the page's own state (see `lib/api.ts`).
 */
export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  database?: string;
  useSsl: boolean;
  status: ConnectionStatus;
  serverVersion?: string;
}

export type ColumnKey = "PRI" | "UNI" | "MUL" | null;

export interface Column {
  name: string;
  dataType: string;
  nullable: boolean;
  key: ColumnKey;
  defaultValue: string | null;
  extra: string;
  comment?: string;
}

export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export type TableKind = "table" | "view";

export interface Table {
  name: string;
  kind: TableKind;
  engine: string;
  rowCount: number;
  sizeBytes: number;
  columns: Column[];
  indexes: TableIndex[];
}

export interface Database {
  name: string;
  charset: string;
  collation: string;
  tables: Table[];
}

export type SqlValue = string | number | boolean | null;

export interface ResultColumn {
  name: string;
  /** MySQL-ish type, used by the grid to right-align numbers, format dates, etc. */
  type: "int" | "decimal" | "string" | "datetime" | "boolean" | "json";
  table?: string;
}

/** A statement that returned rows (SELECT, SHOW, DESCRIBE...). */
export interface ResultSet {
  kind: "rows";
  columns: ResultColumn[];
  rows: SqlValue[][];
  /** Rows the server reports as matching, which may exceed `rows.length` if truncated. */
  totalRows: number;
  truncated: boolean;
}

/** A statement that returned no rows (INSERT, UPDATE, DDL...). */
export interface StatusResult {
  kind: "status";
  message: string;
  affectedRows: number;
  insertId?: number;
}

export interface QueryError {
  kind: "error";
  /** MySQL error number, e.g. 1064 for a syntax error. */
  code: number;
  sqlState: string;
  message: string;
}

export type StatementOutcome = ResultSet | StatusResult | QueryError;

/** One executed statement — a query may contain several separated by `;`. */
export interface StatementResult {
  sql: string;
  outcome: StatementOutcome;
  /** Milliseconds spent on the server. */
  durationMs: number;
}

export interface QueryRun {
  id: string;
  connectionId: string;
  database: string | null;
  statements: StatementResult[];
  startedAt: number;
  totalDurationMs: number;
}

export interface HistoryEntry {
  id: string;
  sql: string;
  database: string | null;
  ranAt: number;
  durationMs: number;
  succeeded: boolean;
  rowCount: number | null;
}
