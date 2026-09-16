import type { ResultColumn, ResultSet, SqlValue } from "./types";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}

export function formatRowCount(rows: number): string {
  if (rows < 1000) return String(rows);
  if (rows < 1_000_000) return `${(rows / 1000).toFixed(rows < 10_000 ? 1 : 0)}K`;
  return `${(rows / 1_000_000).toFixed(1)}M`;
}

export function formatDuration(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatCell(value: SqlValue, column: ResultColumn): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (column.type === "decimal" && typeof value === "number") return value.toFixed(2);
  return String(value);
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Escapes an identifier or literal for a generated query. */
export function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

// --- Exporting -------------------------------------------------------------

function csvEscape(input: string): string {
  if (/[",\n\r]/.test(input)) return `"${input.replace(/"/g, '""')}"`;
  return input;
}

export function resultToCsv(result: ResultSet): string {
  const header = result.columns.map((c) => csvEscape(c.name)).join(",");
  const body = result.rows.map((row) =>
    row.map((value) => (value === null ? "" : csvEscape(String(value)))).join(",")
  );
  return [header, ...body].join("\n");
}

export function resultToJson(result: ResultSet): string {
  const objects = result.rows.map((row) => {
    const record: Record<string, SqlValue> = {};
    result.columns.forEach((column, index) => {
      record[column.name] = row[index];
    });
    return record;
  });
  return JSON.stringify(objects, null, 2);
}

export function resultToInsertStatements(result: ResultSet, tableName: string): string {
  const columns = result.columns.map((c) => quoteIdentifier(c.name)).join(", ");
  return result.rows
    .map((row) => {
      const values = row
        .map((value) => {
          if (value === null) return "NULL";
          if (typeof value === "number") return String(value);
          if (typeof value === "boolean") return value ? "1" : "0";
          return `'${String(value).replace(/'/g, "''")}'`;
        })
        .join(", ");
      return `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${values});`;
    })
    .join("\n");
}

export function downloadText(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// --- SQL formatting --------------------------------------------------------

/** A control character that cannot appear in real SQL, so masked literals survive rewriting. */
const SENTINEL = String.fromCharCode(1);
const SENTINEL_PATTERN = new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g");

const NEWLINE_BEFORE = [
  "select", "from", "where", "group by", "order by", "having", "limit",
  "inner join", "left join", "right join", "outer join", "cross join", "join",
  "union all", "union", "values", "set", "on duplicate key update",
];

/**
 * Deliberately simple: enough to tidy a pasted one-liner without pulling in a
 * full SQL parser. Strings and quoted identifiers are protected from rewriting.
 */
export function formatSql(sql: string): string {
  const literals: string[] = [];
  const masked = sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`/g, (match) => {
    literals.push(match);
    return SENTINEL + (literals.length - 1) + SENTINEL;
  });

  let out = masked.replace(/\s+/g, " ").trim();

  for (const keyword of NEWLINE_BEFORE) {
    const pattern = new RegExp(`\\s+${keyword.replace(/ /g, "\\s+")}\\s+`, "gi");
    out = out.replace(pattern, `\n${keyword.toUpperCase()} `);
  }

  out = out.replace(/\s*,\s*/g, ",\n  ");
  out = out.replace(/\s+(and|or)\s+/gi, (_m, op: string) => `\n  ${op.toUpperCase()} `);
  out = out.replace(/^(select)\s+/i, "SELECT ");
  out = out.replace(/\s*;\s*/g, ";\n");

  return out
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(SENTINEL_PATTERN, (_m, index: string) => literals[Number(index)])
    .trim();
}
