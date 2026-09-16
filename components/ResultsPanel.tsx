"use client";

import { useEffect, useMemo, useState } from "react";
import type { HistoryEntry, QueryRun, ResultSet, SqlValue } from "@/lib/types";
import {
  downloadText,
  formatDuration,
  formatRelativeTime,
  resultToCsv,
  resultToInsertStatements,
  resultToJson,
} from "@/lib/format";
import { AlertIcon, CheckIcon, ClockIcon, DownloadIcon } from "./Icons";
import ResultsGrid from "./ResultsGrid";

type PanelTab = { kind: "statement"; index: number } | { kind: "messages" } | { kind: "history" };

export interface ResultsPanelProps {
  run: QueryRun | null;
  running: boolean;
  history: HistoryEntry[];
  onUseHistory: (sql: string) => void;
  onClearHistory: () => void;
}

export default function ResultsPanel({
  run,
  running,
  history,
  onUseHistory,
  onClearHistory,
}: ResultsPanelProps) {
  const [tab, setTab] = useState<PanelTab>({ kind: "statement", index: 0 });
  const [inspected, setInspected] = useState<{ column: string; value: SqlValue } | null>(null);
  // Set after mount so server and client render the same markup, then ticked
  // so "2m ago" in the history list stays honest.
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // A fresh run should land on its first result, not whatever tab was open before.
  useEffect(() => {
    if (!run) return;
    setInspected(null);
    const firstRows = run.statements.findIndex((s) => s.outcome.kind === "rows");
    setTab(
      firstRows >= 0 ? { kind: "statement", index: firstRows } : { kind: "messages" }
    );
  }, [run]);

  const rowTabs = useMemo(
    () =>
      (run?.statements ?? [])
        .map((statement, index) => ({ statement, index }))
        .filter(({ statement }) => statement.outcome.kind === "rows"),
    [run]
  );

  const errorCount = (run?.statements ?? []).filter((s) => s.outcome.kind === "error").length;

  const activeResult: ResultSet | null =
    tab.kind === "statement" && run?.statements[tab.index]?.outcome.kind === "rows"
      ? (run.statements[tab.index].outcome as ResultSet)
      : null;

  function exportAs(kind: "csv" | "json" | "sql") {
    if (!activeResult) return;
    const stamp = run?.id ?? "result";
    if (kind === "csv") {
      downloadText(`${stamp}.csv`, resultToCsv(activeResult), "text/csv;charset=utf-8");
    } else if (kind === "json") {
      downloadText(`${stamp}.json`, resultToJson(activeResult), "application/json");
    } else {
      const table = activeResult.columns[0]?.table ?? "exported_rows";
      downloadText(
        `${stamp}.sql`,
        resultToInsertStatements(activeResult, table),
        "application/sql"
      );
    }
  }

  return (
    <section className="results">
      <div className="results-tabs" role="tablist" aria-label="Query results">
        {rowTabs.map(({ statement, index }) => {
          const outcome = statement.outcome as ResultSet;
          const isActive = tab.kind === "statement" && tab.index === index;
          return (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`results-tab${isActive ? " is-active" : ""}`}
              onClick={() => setTab({ kind: "statement", index })}
            >
              Result {rowTabs.length > 1 ? rowTabs.findIndex((t) => t.index === index) + 1 : ""}
              <span className="results-tab-count">{outcome.rows.length}</span>
            </button>
          );
        })}

        <button
          type="button"
          role="tab"
          aria-selected={tab.kind === "messages"}
          className={`results-tab${tab.kind === "messages" ? " is-active" : ""}`}
          onClick={() => setTab({ kind: "messages" })}
        >
          Messages
          {errorCount > 0 && <span className="results-tab-badge">{errorCount}</span>}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab.kind === "history"}
          className={`results-tab${tab.kind === "history" ? " is-active" : ""}`}
          onClick={() => setTab({ kind: "history" })}
        >
          <ClockIcon className="results-tab-icon" />
          History
        </button>

        <div className="results-tabs-spacer" />

        {activeResult && (
          <div className="results-toolbar">
            <span className="results-summary">
              {activeResult.totalRows.toLocaleString()} rows
              {activeResult.truncated && (
                <span className="results-truncated" title="Only the first rows were fetched">
                  · showing {activeResult.rows.length}
                </span>
              )}
            </span>
            <div className="export-group">
              <DownloadIcon className="export-icon" />
              <button type="button" className="link-button" onClick={() => exportAs("csv")}>
                CSV
              </button>
              <button type="button" className="link-button" onClick={() => exportAs("json")}>
                JSON
              </button>
              <button type="button" className="link-button" onClick={() => exportAs("sql")}>
                SQL
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="results-body">
        {running && (
          <div className="results-overlay">
            <span className="spinner" />
            Running query…
          </div>
        )}

        {!run && !running && (
          <div className="results-placeholder">
            <p>Run a query to see results here.</p>
            <p className="results-hint">
              Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run, or double-click a table in the
              sidebar to preview its rows.
            </p>
          </div>
        )}

        {tab.kind === "statement" && activeResult && (
          <ResultsGrid
            result={activeResult}
            onCellSelect={(value, column) => setInspected({ value, column })}
          />
        )}

        {tab.kind === "messages" && run && (
          <div className="messages">
            {run.statements.map((statement, index) => {
              const { outcome } = statement;
              return (
                <div
                  key={index}
                  className={`message message-${outcome.kind === "error" ? "error" : "ok"}`}
                >
                  <span className="message-icon">
                    {outcome.kind === "error" ? <AlertIcon /> : <CheckIcon />}
                  </span>
                  <div className="message-body">
                    <code className="message-sql">{statement.sql}</code>
                    <p className="message-text">
                      {outcome.kind === "error"
                        ? `Error ${outcome.code} (${outcome.sqlState}): ${outcome.message}`
                        : outcome.kind === "status"
                          ? outcome.message
                          : `${outcome.rows.length} row${outcome.rows.length === 1 ? "" : "s"} returned`}
                    </p>
                  </div>
                  <span className="message-duration">{formatDuration(statement.durationMs)}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab.kind === "history" && (
          <div className="history">
            {history.length === 0 ? (
              <div className="results-placeholder">
                <p>No queries yet this session.</p>
              </div>
            ) : (
              <>
                <div className="history-header">
                  <span>{history.length} queries</span>
                  <button type="button" className="link-button" onClick={onClearHistory}>
                    Clear
                  </button>
                </div>
                <ul className="history-list">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="history-item"
                        onClick={() => onUseHistory(entry.sql)}
                        title="Load into the editor"
                      >
                        <span
                          className={`history-dot ${entry.succeeded ? "is-ok" : "is-error"}`}
                          aria-hidden="true"
                        />
                        <code className="history-sql">{entry.sql}</code>
                        <span className="history-meta">
                          {entry.database ?? "—"} · {formatDuration(entry.durationMs)}
                          {entry.rowCount !== null && ` · ${entry.rowCount} rows`}
                        </span>
                        <span className="history-time">
                          {now === 0 ? "" : formatRelativeTime(entry.ranAt, now)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {inspected && (
        <div className="cell-inspector">
          <span className="cell-inspector-label">{inspected.column}</span>
          <code className={inspected.value === null ? "is-null" : undefined}>
            {inspected.value === null ? "NULL" : String(inspected.value)}
          </code>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void navigator.clipboard?.writeText(
                inspected.value === null ? "NULL" : String(inspected.value)
              );
            }}
          >
            Copy
          </button>
          <button type="button" className="link-button" onClick={() => setInspected(null)}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
