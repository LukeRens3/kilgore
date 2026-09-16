"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connection, Database, HistoryEntry, QueryRun, Table } from "@/lib/types";
import {
  connect,
  fetchSchema,
  listConnections,
  runQuery,
  type DataSource,
} from "@/lib/api";
import { formatDuration, formatSql, quoteIdentifier } from "@/lib/format";
import TopBar from "@/components/TopBar";
import SchemaSidebar from "@/components/SchemaSidebar";
import QueryTabs from "@/components/QueryTabs";
import SqlEditor, { type SqlEditorHandle } from "@/components/SqlEditor";
import ResultsPanel from "@/components/ResultsPanel";
import ConnectionDialog from "@/components/ConnectionDialog";
import Splitter from "@/components/Splitter";

interface QueryTab {
  id: string;
  title: string;
  sql: string;
  dirty: boolean;
}

const STARTER_SQL = `-- Kilgore SQL editor
-- Ctrl+Enter runs the query (or just the selection).

SELECT
  o.order_number,
  o.status,
  o.total,
  c.email,
  o.placed_at
FROM shop.orders o
JOIN shop.customers c ON c.id = o.customer_id
WHERE o.status = 'paid'
ORDER BY o.placed_at DESC
LIMIT 50;`;

const THEME_KEY = "kilgore.theme";
let tabSequence = 1;

function newTab(sql = ""): QueryTab {
  tabSequence += 1;
  return { id: `tab_${tabSequence}`, title: `Query ${tabSequence - 1}`, sql, dirty: false };
}

export default function Page() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [databases, setDatabases] = useState<Database[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [activeDatabase, setActiveDatabase] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>("mock");
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: "tab_1", title: "Query 1", sql: STARTER_SQL, dirty: false },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab_1");
  const [selection, setSelection] = useState("");

  const [runs, setRuns] = useState<Record<string, QueryRun | null>>({});
  const [runningTabs, setRunningTabs] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [sidebarWidth, setSidebarWidth] = useState(272);
  const [editorHeight, setEditorHeight] = useState(320);

  const editorRef = useRef<SqlEditorHandle | null>(null);
  /** Bumped on cancel so a resolved-but-abandoned run is discarded. */
  const runToken = useRef(0);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeConnection =
    connections.find((connection) => connection.id === activeConnectionId) ?? null;
  const running = Boolean(runningTabs[activeTab.id]);
  const currentRun = runs[activeTab.id] ?? null;

  // --- Theme ---------------------------------------------------------------

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // --- Bootstrap connections and schema -----------------------------------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await listConnections();
      if (cancelled) return;
      setConnections(loaded);
      const first = loaded.find((c) => c.status === "connected") ?? loaded[0] ?? null;
      setActiveConnectionId(first?.id ?? null);
      setActiveDatabase(first?.database ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSchema = useCallback(async () => {
    setSchemaLoading(true);
    try {
      const result = await fetchSchema();
      setDatabases(result.databases);
      setDataSource(result.source);
      setSchemaError(result.error ?? null);
      // Land on something real if the connection did not name a database.
      setActiveDatabase((prev) =>
        prev && result.databases.some((d) => d.name === prev)
          ? prev
          : (result.databases[0]?.name ?? null)
      );
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConnectionId) return;
    void loadSchema();
  }, [activeConnectionId, loadSchema]);

  // --- Actions -------------------------------------------------------------

  const updateActiveTab = useCallback(
    (patch: Partial<QueryTab>) => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab))
      );
    },
    [activeTabId]
  );

  const handleRun = useCallback(
    async (overrideSql?: string) => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab || !activeConnectionId) return;
      const sql = (overrideSql ?? (selection.trim() ? selection : tab.sql)).trim();
      if (!sql) return;

      const token = runToken.current;
      setRunningTabs((prev) => ({ ...prev, [tab.id]: true }));
      try {
        const result = await runQuery({
          connectionId: activeConnectionId,
          database: activeDatabase,
          sql,
          databases,
        });
        if (token !== runToken.current) return;

        setRuns((prev) => ({ ...prev, [tab.id]: result }));
        setHistory((prev) =>
          [
            ...result.statements.map((statement, index) => ({
              id: `${result.id}_${index}`,
              sql: statement.sql,
              database: result.database,
              ranAt: Date.now(),
              durationMs: statement.durationMs,
              succeeded: statement.outcome.kind !== "error",
              rowCount:
                statement.outcome.kind === "rows" ? statement.outcome.rows.length : null,
            })),
            ...prev,
          ].slice(0, 100)
        );
      } finally {
        setRunningTabs((prev) => ({ ...prev, [tab.id]: false }));
      }
    },
    [tabs, activeTabId, activeConnectionId, activeDatabase, databases, selection]
  );

  function cancelRun() {
    runToken.current += 1;
    setRunningTabs((prev) => ({ ...prev, [activeTab.id]: false }));
  }

  const runRef = useRef(handleRun);
  runRef.current = handleRun;

  function formatActiveSql() {
    updateActiveTab({ sql: formatSql(activeTab.sql), dirty: true });
  }

  function openTable(database: string, table: Table, mode: "rows" | "describe") {
    const target = `${quoteIdentifier(database)}.${quoteIdentifier(table.name)}`;
    const sql =
      mode === "rows" ? `SELECT * FROM ${target} LIMIT 200;` : `DESCRIBE ${target};`;
    const tab = newTab(sql);
    setTabs((prev) => [...prev, { ...tab, title: table.name }]);
    setActiveTabId(tab.id);
    setSelection("");
    void handleRun(sql);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      if (prev.length === 1) return prev;
      const index = prev.findIndex((tab) => tab.id === id);
      const next = prev.filter((tab) => tab.id !== id);
      if (id === activeTabId) {
        setActiveTabId(next[Math.max(0, index - 1)].id);
      }
      return next;
    });
    setRuns((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // --- Global shortcuts ----------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        formatActiveSql();
      }
      if (mod && event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        const tab = newTab("");
        setTabs((prev) => [...prev, tab]);
        setActiveTabId(tab.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const tabSummaries = useMemo(
    () => tabs.map((tab) => ({ id: tab.id, title: tab.title, dirty: tab.dirty })),
    [tabs]
  );

  const lastRunSummary = currentRun
    ? `${currentRun.statements.length} statement${
        currentRun.statements.length === 1 ? "" : "s"
      } · ${formatDuration(currentRun.totalDurationMs)}`
    : "Ready";

  return (
    <div className="app">
      <TopBar
        connections={connections}
        activeConnection={activeConnection}
        onSelectConnection={(id) => {
          setActiveConnectionId(id);
          const next = connections.find((c) => c.id === id);
          setActiveDatabase(next?.database ?? null);
          void (async () => {
            const updated = await connect(id);
            setConnections((prev) => prev.map((c) => (c.id === id ? updated : c)));
          })();
        }}
        onManageConnections={() => setDialogOpen(true)}
        databases={databases}
        activeDatabase={activeDatabase}
        onSelectDatabase={setActiveDatabase}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      />

      <div className="workspace" style={{ gridTemplateColumns: `${sidebarWidth}px auto 1fr` }}>
        <SchemaSidebar
          databases={databases}
          loading={schemaLoading}
          activeDatabase={activeDatabase}
          onSelectDatabase={setActiveDatabase}
          onPreviewTable={(database, table) => openTable(database, table, "rows")}
          onDescribeTable={(database, table) => openTable(database, table, "describe")}
          onInsertText={(text) => editorRef.current?.insertText(text)}
          onRefresh={() => void loadSchema()}
        />

        <Splitter
          orientation="vertical"
          value={sidebarWidth}
          onChange={setSidebarWidth}
          min={200}
          max={520}
          label="Resize sidebar"
        />

        <main className="main">
          <QueryTabs
            tabs={tabSummaries}
            activeTabId={activeTab.id}
            onSelect={(id) => {
              setActiveTabId(id);
              setSelection("");
            }}
            onClose={closeTab}
            onCreate={() => {
              const tab = newTab("");
              setTabs((prev) => [...prev, tab]);
              setActiveTabId(tab.id);
              setSelection("");
            }}
            onRun={() => void handleRun()}
            onCancel={cancelRun}
            onFormat={formatActiveSql}
            running={running}
            hasSelection={selection.trim().length > 0}
            canRun={Boolean(activeConnection) && activeTab.sql.trim().length > 0}
          />

          <div className="editor-pane" style={{ height: editorHeight }}>
            <SqlEditor
              key={activeTab.id}
              ref={editorRef}
              value={activeTab.sql}
              onChange={(value) => updateActiveTab({ sql: value, dirty: true })}
              onRun={() => void runRef.current()}
              onSelectionChange={setSelection}
              databases={databases}
              defaultDatabase={activeDatabase}
            />
          </div>

          <Splitter
            orientation="horizontal"
            value={editorHeight}
            onChange={setEditorHeight}
            min={120}
            max={640}
            label="Resize editor"
          />

          <ResultsPanel
            run={currentRun}
            running={running}
            history={history}
            onUseHistory={(sql) => {
              updateActiveTab({ sql, dirty: true });
              setSelection("");
            }}
            onClearHistory={() => setHistory([])}
          />
        </main>
      </div>

      <footer className="statusbar">
        <span>{activeConnection ? activeConnection.name : "No connection"}</span>
        <span className="statusbar-sep" />
        <span>{activeDatabase ?? "no database selected"}</span>
        <span className="statusbar-sep" />
        <span>{lastRunSummary}</span>
        <span className="statusbar-spacer" />
        {schemaError && (
          <span className="statusbar-error" title={schemaError}>
            {schemaError}
          </span>
        )}
        <span className={`source-pill source-${dataSource}`}>
          {dataSource === "mysql" ? "Live MySQL" : "Mock data"}
        </span>
      </footer>

      <ConnectionDialog
        open={dialogOpen}
        connections={connections}
        activeConnectionId={activeConnectionId}
        onClose={() => setDialogOpen(false)}
        onConnect={(id) => {
          setActiveConnectionId(id);
          void (async () => {
            const updated = await connect(id);
            setConnections((prev) => prev.map((c) => (c.id === id ? updated : c)));
          })();
        }}
        onSave={(connection) => {
          setConnections((prev) => {
            const exists = prev.some((c) => c.id === connection.id);
            return exists
              ? prev.map((c) => (c.id === connection.id ? connection : c))
              : [...prev, connection];
          });
        }}
      />
    </div>
  );
}
