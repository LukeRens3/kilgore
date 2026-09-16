/**
 * Pure SQL text helpers, shared by the browser bundle and the API routes.
 * Nothing here may import a driver or any Node built-in.
 */

/**
 * Splits a script into statements on unquoted semicolons, respecting string
 * literals, backtick identifiers, and both comment styles - so a semicolon
 * inside 'a;b' or a -- comment does not split the statement.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "-" && next === "-") {
        inLineComment = true;
        current += ch;
        continue;
      }
      if (ch === "#") {
        inLineComment = true;
        current += ch;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        current += ch;
        continue;
      }
    }

    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === "`" && !inSingle && !inDouble) inBacktick = !inBacktick;

    if (ch === ";" && !inSingle && !inDouble && !inBacktick) {
      statements.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)(--|#).*$/gm, " ")
    .trim();
}

/** The leading keyword, lowercased - used to decide how to report a result. */
export function statementVerb(sql: string): string {
  return /^\s*(\w+)/.exec(stripComments(sql))?.[1]?.toLowerCase() ?? "";
}

/** Schemas that are noise for a table browser. */
export const SYSTEM_SCHEMAS = ["mysql", "performance_schema", "sys"];
