import { MOCK_CONNECTIONS, MOCK_DATABASES } from "./mockData";
import type {
  Column,
  Connection,
  Database,
  QueryRun,
  ResultColumn,
  StatementOutcome,
  StatementResult,
  SqlValue,
  Table,
} from "./types";
import { splitStatements, stripComments } from "./sql";

export { splitStatements };

/**
 * Offline fallback engine.
 *
 * Used only when the server reports that no database is configured, so the
 * editor stays usable for anyone without access to the real instance. The live
 * path is lib/api.ts -> /api/query -> lib/db.ts.
 */

const LATENCY_MS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

// --- Connections -----------------------------------------------------------

export async function listConnections(): Promise<Connection[]> {
  await sleep(LATENCY_MS);
  return MOCK_CONNECTIONS.map((c) => ({ ...c }));
}

export async function connect(connectionId: string): Promise<Connection> {
  await sleep(LATENCY_MS * 3);
  const found = MOCK_CONNECTIONS.find((c) => c.id === connectionId);
  if (!found) throw new Error(`Unknown connection: ${connectionId}`);
  return { ...found, status: "connected" };
}

export async function disconnect(connectionId: string): Promise<Connection> {
  await sleep(LATENCY_MS);
  const found = MOCK_CONNECTIONS.find((c) => c.id === connectionId);
  if (!found) throw new Error(`Unknown connection: ${connectionId}`);
  return { ...found, status: "disconnected" };
}

// --- Schema ----------------------------------------------------------------

export async function fetchDatabases(_connectionId: string): Promise<Database[]> {
  await sleep(LATENCY_MS * 2);
  return MOCK_DATABASES;
}

export function findTable(
  databases: Database[],
  databaseName: string | null,
  tableName: string
): { database: Database; table: Table } | null {
  const search = databaseName
    ? databases.filter((d) => d.name === databaseName)
    : databases;
  for (const database of search) {
    const table = database.tables.find(
      (t) => t.name.toLowerCase() === tableName.toLowerCase()
    );
    if (table) return { database, table };
  }
  // Fall back to any database when the query did not qualify the table.
  for (const database of databases) {
    const table = database.tables.find(
      (t) => t.name.toLowerCase() === tableName.toLowerCase()
    );
    if (table) return { database, table };
  }
  return null;
}

// --- Deterministic value generation ---------------------------------------

/** Mulberry32 - small, fast, and stable across renders so the grid never flickers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FIRST_NAMES = ["Ana", "Marcus", "Priya", "Tobias", "Wren", "Kofi", "Ines", "Dmitri", "Lena", "Rafael", "Yuki", "Nadia", "Owen", "Sofia", "Emeka", "Clara"];
const LAST_NAMES = ["Okafor", "Lindqvist", "Nakamura", "Duarte", "Petrov", "Hassan", "Moreau", "Silva", "Kowalski", "Bennett", "Rossi", "Andersen", "Mwangi", "Vargas"];
const COUNTRIES = ["US", "GB", "DE", "FR", "JP", "BR", "CA", "AU", "NL", "SE", "KE", "IN"];
const CITIES = ["Portland", "Bristol", "Leipzig", "Lyon", "Osaka", "Recife", "Halifax", "Perth", "Utrecht", "Malmo", "Nairobi", "Pune"];
const PRODUCTS = ["Cast Iron Skillet", "Merino Base Layer", "Titanium Spork", "Field Notebook", "Espresso Tamper", "Canvas Duffel", "Ceramic Pour Over", "Wool Blanket", "Bench Vise", "Linen Apron", "Copper Mug", "Leather Belt"];
const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "refunded"];
const PROVIDERS = ["stripe", "adyen", "braintree", "paypal"];
const PATHS = ["/", "/products", "/products/cast-iron-skillet", "/cart", "/checkout", "/account/orders", "/search?q=wool"];

function pick<T>(items: T[], r: number): T {
  return items[Math.floor(r * items.length) % items.length];
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

/** Dates are derived from a fixed epoch so results are stable between runs. */
const EPOCH = Date.UTC(2024, 0, 1);

function makeDate(r: number, withTime: boolean): string {
  const ms = EPOCH + Math.floor(r * 640 * 24 * 3600 * 1000);
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (!withTime) return date;
  return `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function baseType(dataType: string): ResultColumn["type"] {
  const t = dataType.toLowerCase();
  if (t.startsWith("tinyint(1)")) return "boolean";
  if (t.includes("int")) return "int";
  if (t.startsWith("decimal") || t.startsWith("float") || t.startsWith("double")) return "decimal";
  if (t.startsWith("json")) return "json";
  if (t.includes("date") || t.includes("time")) return "datetime";
  return "string";
}

function generateValue(column: Column, rowIndex: number, seed: number): SqlValue {
  const r = rng(seed + rowIndex * 2654435761)();
  const r2 = rng(seed + rowIndex * 40503 + 7)();
  const name = column.name.toLowerCase();
  const type = baseType(column.dataType);

  // Nullable columns are empty roughly a fifth of the time, like real data.
  if (column.nullable && r2 > 0.82) return null;

  if (column.extra.includes("auto_increment") || (name === "id" && type === "int")) {
    return rowIndex + 1;
  }
  if (column.dataType.startsWith("char(36)")) {
    const hex = (n: number) => Math.floor(rng(seed + rowIndex + n)() * 0xffffffff).toString(16).padStart(8, "0");
    return `${hex(1)}-${hex(2).slice(0, 4)}-4${hex(3).slice(0, 3)}-a${hex(4).slice(0, 3)}-${hex(5)}${hex(6).slice(0, 4)}`;
  }
  if (name.includes("email")) {
    const f = pick(FIRST_NAMES, r).toLowerCase();
    const l = pick(LAST_NAMES, r2).toLowerCase();
    return `${f}.${l}${rowIndex}@example.com`;
  }
  if (name === "first_name") return pick(FIRST_NAMES, r);
  if (name === "last_name") return pick(LAST_NAMES, r);
  if (name.includes("country")) return pick(COUNTRIES, r);
  if (name === "city") return pick(CITIES, r);
  if (name === "phone") return `+1-${200 + Math.floor(r * 700)}-${pad(Math.floor(r2 * 900) + 100, 3)}-${pad(Math.floor(r * 9000) + 1000, 4)}`;
  if (name.includes("status")) return pick(ORDER_STATUSES, r);
  if (name === "provider") return pick(PROVIDERS, r);
  if (name === "path") return pick(PATHS, r);
  if (name === "sku") return `SKU-${pad(Math.floor(r * 9000) + 1000, 4)}-${pick(["S", "M", "L", "XL"], r2)}`;
  if (name === "order_number") return `ORD-2024-${pad(rowIndex + 10001, 5)}`;
  if (name === "name" || name.includes("product")) return pick(PRODUCTS, r);
  if (name === "currency") return "USD";
  if (name.includes("password") || name.includes("token_hash")) {
    return Array.from({ length: 8 }, (_, i) => Math.floor(rng(seed + rowIndex + i)() * 0xffffffff).toString(16).padStart(8, "0")).join("").slice(0, 60);
  }
  if (name === "line1") return `${Math.floor(r * 9000) + 100} ${pick(["Alder", "Birch", "Cedar", "Dover", "Elm"], r2)} St`;
  if (name === "postal_code") return pad(Math.floor(r * 99999), 5);

  switch (type) {
    case "boolean":
      return r > 0.3;
    case "int": {
      if (name.includes("quantity")) return Math.floor(r * 8) + 1;
      if (name.endsWith("_id")) return Math.floor(r * 5000) + 1;
      return Math.floor(r * 100000);
    }
    case "decimal": {
      const magnitude = name.includes("total") || name.includes("value") || name.includes("revenue") ? 2000 : 200;
      return Number((r * magnitude).toFixed(2));
    }
    case "datetime":
      return makeDate(r, !column.dataType.toLowerCase().startsWith("date") || column.dataType.toLowerCase().includes("time"));
    case "json":
      return JSON.stringify({ color: pick(["black", "olive", "rust"], r), size: pick(["S", "M", "L"], r2) });
    default:
      return `${column.name}_${rowIndex + 1}`;
  }
}

// --- A very small SQL "engine" --------------------------------------------



const ROW_LIMIT = 500;

function unquote(identifier: string): string {
  return identifier.replace(/[`"']/g, "");
}

function resultColumnsFor(table: Table, selectList: string): { columns: ResultColumn[]; source: Column[] } {
  const trimmed = selectList.trim();
  if (trimmed === "*" || trimmed === "") {
    return {
      columns: table.columns.map((c) => ({ name: c.name, type: baseType(c.dataType), table: table.name })),
      source: table.columns,
    };
  }
  const requested = trimmed.split(",").map((part) => {
    const cleaned = part.trim().replace(/\s+as\s+.*$/i, "");
    const alias = /\s+as\s+(.+)$/i.exec(part.trim());
    const bare = unquote(cleaned.split(".").pop() ?? cleaned).trim();
    return { bare, label: alias ? unquote(alias[1]).trim() : bare };
  });

  const columns: ResultColumn[] = [];
  const source: Column[] = [];
  for (const req of requested) {
    const match = table.columns.find((c) => c.name.toLowerCase() === req.bare.toLowerCase());
    if (match) {
      columns.push({ name: req.label, type: baseType(match.dataType), table: table.name });
      source.push(match);
    } else {
      // An expression, aggregate, or literal - render it as a synthetic column.
      const aggregate = /^(count|sum|avg|min|max)\s*\(/i.exec(req.bare);
      columns.push({ name: req.label, type: aggregate ? "int" : "string" });
      source.push({
        name: req.label,
        dataType: aggregate ? "bigint" : "varchar(255)",
        nullable: false,
        key: null,
        defaultValue: null,
        // Tagged so an ungrouped COUNT can be answered with the real row count.
        extra: aggregate ? `AGGREGATE:${aggregate[1].toLowerCase()}` : "",
      });
    }
  }
  return { columns, source };
}

function runSelect(sql: string, databases: Database[], activeDatabase: string | null): StatementOutcome {
  const clean = stripComments(sql);
  const fromMatch = /\bfrom\s+([`"\w.]+)/i.exec(clean);

  if (!fromMatch) {
    // SELECT with no FROM - e.g. SELECT 1, SELECT NOW(), SELECT VERSION()
    const selectList = /select\s+([\s\S]+)$/i.exec(clean)?.[1] ?? "1";
    const parts = selectList.split(",").map((p) => p.trim());
    return {
      kind: "rows",
      columns: parts.map((p) => ({ name: unquote(p), type: "string" as const })),
      rows: [
        parts.map((p): SqlValue => {
          if (/version\s*\(/i.test(p)) return "8.4.2";
          if (/now\s*\(|current_timestamp/i.test(p)) return "2024-10-01 12:00:00";
          if (/database\s*\(/i.test(p)) return activeDatabase;
          const n = Number(p);
          return Number.isNaN(n) ? unquote(p) : n;
        }),
      ],
      totalRows: 1,
      truncated: false,
    };
  }

  const qualified = unquote(fromMatch[1]);
  const [maybeDb, maybeTable] = qualified.includes(".")
    ? qualified.split(".")
    : [activeDatabase, qualified];

  const found = findTable(databases, maybeDb, maybeTable);
  if (!found) {
    return {
      kind: "error",
      code: 1146,
      sqlState: "42S02",
      message: `Table '${maybeDb ?? "?"}.${maybeTable}' doesn't exist`,
    };
  }

  const selectList = /select\s+(?:distinct\s+)?([\s\S]*?)\s+from\b/i.exec(clean)?.[1] ?? "*";
  const { columns, source } = resultColumnsFor(found.table, selectList);

  const limitMatch = /\blimit\s+(\d+)(?:\s*,\s*(\d+))?/i.exec(clean);
  const requestedLimit = limitMatch
    ? Number(limitMatch[2] ?? limitMatch[1])
    : found.table.rowCount;

  const hasAggregate = /\b(count|sum|avg|min|max)\s*\(/i.test(selectList);
  const groupBy = /\bgroup\s+by\b/i.test(clean);

  // How many rows the statement would yield on a real server, before we cap
  // what actually gets shipped to the grid.
  let matching: number;
  if (hasAggregate && !groupBy) matching = 1;
  else if (groupBy) matching = Math.min(requestedLimit, 24);
  else matching = Math.min(requestedLimit, found.table.rowCount);

  const rowTarget = Math.min(matching, ROW_LIMIT);

  const seed = hash(`${found.database.name}.${found.table.name}`);
  let rows: SqlValue[][] = [];
  for (let i = 0; i < rowTarget; i += 1) {
    rows.push(source.map((c) => generateValue(c, i, seed + hash(c.name))));
  }

  // Group keys are distinct by definition, so drop duplicates the generator made.
  if (groupBy) {
    const seen = new Set<string>();
    rows = rows.filter((row) => {
      const key = row
        .filter((_, index) => !source[index].extra.startsWith("AGGREGATE:"))
        .join("");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // An ungrouped COUNT should agree with the row count shown in the sidebar.
  if (hasAggregate && !groupBy && rows.length > 0) {
    source.forEach((column, index) => {
      if (column.extra === "AGGREGATE:count") rows[0][index] = found.table.rowCount;
    });
  }

  // Deduping collapsed some groups, so the group count is whatever survived.
  const totalRows = groupBy ? rows.length : matching;
  return {
    kind: "rows",
    columns,
    rows,
    totalRows,
    truncated: rows.length < totalRows,
  };
}

function runShow(sql: string, databases: Database[], activeDatabase: string | null): StatementOutcome {
  const clean = stripComments(sql);

  if (/^show\s+databases/i.test(clean)) {
    return {
      kind: "rows",
      columns: [{ name: "Database", type: "string" }],
      rows: databases.map((d) => [d.name]),
      totalRows: databases.length,
      truncated: false,
    };
  }
  if (/^show\s+(full\s+)?tables/i.test(clean)) {
    const dbName = /\bfrom\s+([`"\w]+)/i.exec(clean)?.[1];
    const db = databases.find((d) => d.name === unquote(dbName ?? activeDatabase ?? ""));
    if (!db) {
      return { kind: "error", code: 1046, sqlState: "3D000", message: "No database selected" };
    }
    return {
      kind: "rows",
      columns: [
        { name: `Tables_in_${db.name}`, type: "string" },
        { name: "Table_type", type: "string" },
      ],
      rows: db.tables.map((t) => [t.name, t.kind === "view" ? "VIEW" : "BASE TABLE"]),
      totalRows: db.tables.length,
      truncated: false,
    };
  }
  if (/^(show\s+columns|describe|desc)\b/i.test(clean)) {
    const target = /(?:from|desc(?:ribe)?)\s+([`"\w.]+)/i.exec(clean)?.[1];
    if (!target) {
      return { kind: "error", code: 1064, sqlState: "42000", message: "You have an error in your SQL syntax" };
    }
    const qualified = unquote(target);
    const [db, tbl] = qualified.includes(".") ? qualified.split(".") : [activeDatabase, qualified];
    const found = findTable(databases, db, tbl);
    if (!found) {
      return { kind: "error", code: 1146, sqlState: "42S02", message: `Table '${qualified}' doesn't exist` };
    }
    return {
      kind: "rows",
      columns: [
        { name: "Field", type: "string" },
        { name: "Type", type: "string" },
        { name: "Null", type: "string" },
        { name: "Key", type: "string" },
        { name: "Default", type: "string" },
        { name: "Extra", type: "string" },
      ],
      rows: found.table.columns.map((c) => [
        c.name,
        c.dataType,
        c.nullable ? "YES" : "NO",
        c.key ?? "",
        c.defaultValue,
        c.extra,
      ]),
      totalRows: found.table.columns.length,
      truncated: false,
    };
  }
  return {
    kind: "rows",
    columns: [{ name: "Variable_name", type: "string" }, { name: "Value", type: "string" }],
    rows: [["version", "8.4.2"], ["character_set_server", "utf8mb4"]],
    totalRows: 2,
    truncated: false,
  };
}

function runStatement(
  sql: string,
  databases: Database[],
  activeDatabase: string | null
): StatementOutcome {
  const clean = stripComments(sql);
  const verb = /^\s*(\w+)/.exec(clean)?.[1]?.toLowerCase() ?? "";

  switch (verb) {
    case "select":
    case "with":
      return runSelect(clean, databases, activeDatabase);
    case "show":
    case "describe":
    case "desc":
      return runShow(clean, databases, activeDatabase);
    case "explain":
      return {
        kind: "rows",
        columns: [
          { name: "id", type: "int" },
          { name: "select_type", type: "string" },
          { name: "table", type: "string" },
          { name: "type", type: "string" },
          { name: "key", type: "string" },
          { name: "rows", type: "int" },
          { name: "Extra", type: "string" },
        ],
        rows: [[1, "SIMPLE", /from\s+([`"\w.]+)/i.exec(clean)?.[1] ?? "?", "ref", "PRIMARY", 1204, "Using where"]],
        totalRows: 1,
        truncated: false,
      };
    case "insert":
      return { kind: "status", message: "Query OK, 1 row affected", affectedRows: 1, insertId: 48214 };
    case "update":
      return { kind: "status", message: "Query OK, 3 rows affected (Rows matched: 3  Changed: 3  Warnings: 0)", affectedRows: 3 };
    case "delete":
      return { kind: "status", message: "Query OK, 1 row affected", affectedRows: 1 };
    case "create":
    case "alter":
    case "drop":
    case "truncate":
      return { kind: "status", message: "Query OK, 0 rows affected", affectedRows: 0 };
    case "use": {
      const target = unquote(/^use\s+([`"\w]+)/i.exec(clean)?.[1] ?? "");
      if (!databases.some((d) => d.name === target)) {
        return { kind: "error", code: 1049, sqlState: "42000", message: `Unknown database '${target}'` };
      }
      return { kind: "status", message: "Database changed", affectedRows: 0 };
    }
    case "set":
    case "start":
    case "commit":
    case "rollback":
      return { kind: "status", message: "Query OK, 0 rows affected", affectedRows: 0 };
    default:
      return {
        kind: "error",
        code: 1064,
        sqlState: "42000",
        message: `You have an error in your SQL syntax; check the manual for the right syntax to use near '${clean.slice(0, 40)}' at line 1`,
      };
  }
}

export interface RunQueryInput {
  connectionId: string;
  database: string | null;
  sql: string;
  databases: Database[];
}

export async function runQuery(input: RunQueryInput): Promise<QueryRun> {
  const startedAt = EPOCH;
  const statements = splitStatements(input.sql);

  const results: StatementResult[] = [];
  let total = 0;
  for (const statement of statements) {
    const outcome = runStatement(statement, input.databases, input.database);
    // Fake a plausible server time proportional to how much data came back.
    const rowsBack = outcome.kind === "rows" ? outcome.rows.length : 0;
    const durationMs = Number((2 + rowsBack * 0.06 + (hash(statement) % 40) / 10).toFixed(1));
    total += durationMs;
    results.push({ sql: statement, outcome, durationMs });
  }

  await sleep(Math.min(120 + total * 4, 900));

  return {
    id: nextId("run"),
    connectionId: input.connectionId,
    database: input.database,
    statements: results,
    startedAt,
    totalDurationMs: Number(total.toFixed(1)),
  };
}
