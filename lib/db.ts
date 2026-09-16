import "server-only";
import mysql from "mysql2/promise";
import type {
  Column,
  ColumnKey,
  Database,
  ResultColumn,
  SqlValue,
  StatementOutcome,
  Table,
  TableIndex,
} from "./types";
import { SYSTEM_SCHEMAS, statementVerb } from "./sql";

/**
 * Server-side MySQL access.
 *
 * The server owns the *address* of the database (host, port, TLS) and nothing
 * else: there is no service account. Every request carries the credentials of
 * the MySQL user driving it, so permissions are enforced by MySQL's own grant
 * tables rather than by application code.
 *
 * Credentials are never cached, pooled or written to disk. Each request opens a
 * short-lived connection and closes it again, which costs a handshake per call
 * but keeps passwords out of any server-side structure that outlives the
 * request.
 */

/** Most rows we will ship to the browser for a single statement. */
export const ROW_LIMIT = 500;

/** Where the database lives. Fixed by deployment, identical for every visitor. */
export interface ServerConfig {
  host: string;
  port: number;
  ssl: boolean;
}

/** Who is connecting. Supplied per request, never retained. */
export interface Credentials {
  user: string;
  password: string;
  database?: string;
}

export function readServerConfig(): ServerConfig | null {
  const { DB_HOST, DB_PORT, DB_SSL } = process.env;
  if (!DB_HOST) return null;
  return {
    host: DB_HOST,
    port: Number(DB_PORT ?? 3306) || 3306,
    ssl: DB_SSL !== "false",
  };
}

/**
 * RDS terminates TLS with an Amazon CA. Verification stays off unless DB_SSL_CA
 * points at the bundle, so the app works without shipping the CA chain.
 */
function sslOption(config: ServerConfig) {
  if (!config.ssl) return undefined;
  return process.env.DB_SSL_CA
    ? { ca: process.env.DB_SSL_CA, rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

/**
 * Runs `work` against a connection authenticated as `credentials`, closing it
 * whether or not the work succeeds.
 */
export async function withConnection<T>(
  credentials: Credentials,
  work: (connection: mysql.Connection) => Promise<T>
): Promise<T> {
  const config = readServerConfig();
  if (!config) throw new Error("Server is not configured: DB_HOST is unset.");

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: credentials.user,
    password: credentials.password,
    database: credentials.database,
    // Statements are split and run one at a time, so this stays off.
    multipleStatements: false,
    connectTimeout: 10_000,
    ssl: sslOption(config),
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    return await work(connection);
  } finally {
    // Closing must never mask the real error from `work`.
    void connection.end().catch(() => undefined);
  }
}

// --- Request parsing -------------------------------------------------------

/** Pulls credentials out of a request body, or null if the user is missing. */
export function readCredentials(body: unknown): Credentials | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  const user = typeof raw.user === "string" ? raw.user.trim() : "";
  if (!user) return null;

  const database =
    typeof raw.database === "string" && raw.database.trim() ? raw.database.trim() : undefined;

  return {
    user,
    password: typeof raw.password === "string" ? raw.password : "",
    database,
  };
}

interface MysqlError extends Error {
  errno?: number;
  sqlState?: string;
  code?: string;
}

/**
 * MySQL rejecting the *identity* is a 401, not a gateway failure - the UI
 * reopens the sign-in prompt rather than reporting the server as unreachable.
 *
 * ER_DBACCESS_DENIED_ERROR is deliberately absent: it means the user
 * authenticated fine but has no rights on one schema. Treating that as a 401
 * would sign someone out for clicking the wrong database in the sidebar, so it
 * surfaces as an ordinary error instead. The sign-in route opts into it
 * separately, where a bad default schema really should keep you on the form.
 */
export const DB_ACCESS_DENIED = "ER_DBACCESS_DENIED_ERROR";

const AUTH_ERROR_CODES = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_NO_PASSWORD_ERROR",
  "ER_NOT_SUPPORTED_AUTH_MODE",
  "ER_MUST_CHANGE_PASSWORD",
  "ER_MUST_CHANGE_PASSWORD_LOGIN",
  "ER_HOST_NOT_PRIVILEGED",
  "ER_HOST_IS_BLOCKED",
]);

export function isAuthError(error: unknown): boolean {
  const code = (error as MysqlError)?.code;
  return typeof code === "string" && AUTH_ERROR_CODES.has(code);
}

export function toQueryError(error: unknown): StatementOutcome {
  const err = error as MysqlError;
  return {
    kind: "error",
    code: err.errno ?? 0,
    sqlState: err.sqlState ?? "HY000",
    message: err.message ?? String(error),
  };
}

// --- Field type mapping ----------------------------------------------------

/** mysql2 reports column types as protocol codes; map them to grid types. */
function mapFieldType(code: number, columnLength: number): ResultColumn["type"] {
  switch (code) {
    case 1: // TINY - width 1 is the conventional boolean
      return columnLength === 1 ? "boolean" : "int";
    case 2: // SHORT
    case 3: // LONG
    case 8: // LONGLONG
    case 9: // INT24
    case 13: // YEAR
    case 16: // BIT
      return "int";
    case 0: // DECIMAL
    case 4: // FLOAT
    case 5: // DOUBLE
    case 246: // NEWDECIMAL
      return "decimal";
    case 7: // TIMESTAMP
    case 10: // DATE
    case 11: // TIME
    case 12: // DATETIME
    case 14: // NEWDATE
      return "datetime";
    case 245: // JSON
      return "json";
    default:
      return "string";
  }
}

/** Values must survive JSON transport, so coerce driver objects to primitives. */
function normalizeValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString().replace("T", " ").slice(0, 19);
  if (Buffer.isBuffer(value)) return value.toString("base64");
  return JSON.stringify(value);
}

// --- Statement execution ---------------------------------------------------

interface StreamField {
  name: string;
  type: number;
  columnLength: number;
  table?: string;
}

/**
 * Streams one statement so a careless `SELECT *` on a huge table cannot exhaust
 * server memory: rows past ROW_LIMIT are counted but not retained.
 */
function executeOne(
  connection: mysql.Connection,
  sql: string
): Promise<StatementOutcome> {
  return new Promise((resolve) => {
    // The promise wrapper hides the event emitter that streaming needs.
    const core = (connection as unknown as { connection: any }).connection;

    let fields: StreamField[] | null = null;
    const rows: SqlValue[][] = [];
    let totalRows = 0;
    let okPacket: { affectedRows?: number; insertId?: number; info?: string } | null = null;
    let settled = false;

    const emitter = core.query({ sql, rowsAsArray: true });

    emitter.on("fields", (packet: StreamField[]) => {
      fields = packet;
    });

    emitter.on("result", (row: unknown) => {
      if (Array.isArray(row)) {
        totalRows += 1;
        if (rows.length < ROW_LIMIT) rows.push(row.map(normalizeValue));
      } else {
        okPacket = row as typeof okPacket;
      }
    });

    emitter.on("error", (error: unknown) => {
      if (settled) return;
      settled = true;
      resolve(toQueryError(error));
    });

    emitter.on("end", () => {
      if (settled) return;
      settled = true;

      if (fields && fields.length > 0) {
        resolve({
          kind: "rows",
          columns: fields.map((field) => ({
            name: field.name,
            type: mapFieldType(field.type, field.columnLength),
            table: field.table || undefined,
          })),
          rows,
          totalRows,
          truncated: totalRows > rows.length,
        });
        return;
      }

      const affectedRows = okPacket?.affectedRows ?? 0;
      const verb = statementVerb(sql);
      resolve({
        kind: "status",
        message:
          okPacket?.info?.trim() ||
          (verb === "use"
            ? "Database changed"
            : `Query OK, ${affectedRows} row${affectedRows === 1 ? "" : "s"} affected`),
        affectedRows,
        insertId: okPacket?.insertId || undefined,
      });
    });
  });
}

export async function runStatements(
  credentials: Credentials,
  statements: string[],
  database: string | null
): Promise<{ outcome: StatementOutcome; sql: string; durationMs: number }[]> {
  return withConnection(credentials, async (connection) => {
    if (database) {
      // Scope the session without rewriting the user's SQL. A user without
      // rights on this schema gets MySQL's own error, which is the point.
      await connection.query(`USE \`${database.replace(/`/g, "``")}\``);
    }

    const results = [];
    for (const sql of statements) {
      const started = performance.now();
      const outcome = await executeOne(connection, sql);
      results.push({
        sql,
        outcome,
        durationMs: Number((performance.now() - started).toFixed(1)),
      });
    }
    return results;
  });
}

// --- Schema introspection --------------------------------------------------

interface SchemaRow {
  SCHEMA_NAME: string;
  DEFAULT_CHARACTER_SET_NAME: string;
  DEFAULT_COLLATION_NAME: string;
}

interface TableRow {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  TABLE_TYPE: string;
  ENGINE: string | null;
  TABLE_ROWS: number | string | null;
  SIZE_BYTES: number | string | null;
}

interface ColumnRow {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
  COLUMN_COMMENT: string;
}

interface IndexRow {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  INDEX_NAME: string;
  COLUMN_NAME: string;
  NON_UNIQUE: number | string;
}

const EXCLUDED = SYSTEM_SCHEMAS.map(() => "?").join(", ");

/**
 * Builds the schema tree. information_schema only returns rows the connected
 * user can see, so the sidebar automatically reflects that user's grants.
 */
export async function introspect(credentials: Credentials): Promise<{
  databases: Database[];
  version: string;
}> {
  return withConnection(credentials, async (connection) => {
    const [schemas] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
         FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME NOT IN (${EXCLUDED})
        ORDER BY SCHEMA_NAME`,
      SYSTEM_SCHEMAS
    );

    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS,
              COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0) AS SIZE_BYTES
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA NOT IN (${EXCLUDED})
        ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      SYSTEM_SCHEMAS
    );

    const [columns] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
              COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA NOT IN (${EXCLUDED})
        ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
      SYSTEM_SCHEMAS
    );

    const [indexes] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA NOT IN (${EXCLUDED})
        ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      SYSTEM_SCHEMAS
    );

    const [versionRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT VERSION() AS v"
    );

    const columnsByTable = new Map<string, Column[]>();
    for (const raw of columns as unknown as ColumnRow[]) {
      const key = `${raw.TABLE_SCHEMA}.${raw.TABLE_NAME}`;
      const list = columnsByTable.get(key) ?? [];
      list.push({
        name: raw.COLUMN_NAME,
        dataType: raw.COLUMN_TYPE,
        nullable: raw.IS_NULLABLE === "YES",
        key: (raw.COLUMN_KEY || null) as ColumnKey,
        defaultValue: raw.COLUMN_DEFAULT,
        extra: raw.EXTRA ?? "",
        comment: raw.COLUMN_COMMENT || undefined,
      });
      columnsByTable.set(key, list);
    }

    const indexesByTable = new Map<string, Map<string, TableIndex>>();
    for (const raw of indexes as unknown as IndexRow[]) {
      const key = `${raw.TABLE_SCHEMA}.${raw.TABLE_NAME}`;
      const byName = indexesByTable.get(key) ?? new Map<string, TableIndex>();
      const existing = byName.get(raw.INDEX_NAME) ?? {
        name: raw.INDEX_NAME,
        columns: [],
        unique: Number(raw.NON_UNIQUE) === 0,
      };
      existing.columns.push(raw.COLUMN_NAME);
      byName.set(raw.INDEX_NAME, existing);
      indexesByTable.set(key, byName);
    }

    const tablesBySchema = new Map<string, Table[]>();
    for (const raw of tables as unknown as TableRow[]) {
      const key = `${raw.TABLE_SCHEMA}.${raw.TABLE_NAME}`;
      const list = tablesBySchema.get(raw.TABLE_SCHEMA) ?? [];
      list.push({
        name: raw.TABLE_NAME,
        kind: raw.TABLE_TYPE === "VIEW" ? "view" : "table",
        engine: raw.ENGINE ?? "-",
        // TABLE_ROWS is an estimate for InnoDB, which is what every client shows.
        rowCount: Number(raw.TABLE_ROWS ?? 0),
        sizeBytes: Number(raw.SIZE_BYTES ?? 0),
        columns: columnsByTable.get(key) ?? [],
        indexes: Array.from(indexesByTable.get(key)?.values() ?? []),
      });
      tablesBySchema.set(raw.TABLE_SCHEMA, list);
    }

    return {
      databases: (schemas as unknown as SchemaRow[]).map((schema) => ({
        name: schema.SCHEMA_NAME,
        charset: schema.DEFAULT_CHARACTER_SET_NAME,
        collation: schema.DEFAULT_COLLATION_NAME,
        tables: tablesBySchema.get(schema.SCHEMA_NAME) ?? [],
      })),
      version: String(versionRows[0]?.v ?? "unknown"),
    };
  });
}

/** Verifies credentials by connecting as them. Used by the sign-in prompt. */
export async function authenticate(credentials: Credentials): Promise<string> {
  return withConnection(credentials, async (connection) => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT VERSION() AS v");
    return String(rows[0]?.v ?? "unknown");
  });
}
