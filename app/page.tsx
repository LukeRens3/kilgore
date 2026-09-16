"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connection, Database, HistoryEntry, QueryRun, Table } from "@/lib/types";
import {
  AuthError,
  fetchSchema,
  fetchServerConfig,
  runQuery,
  signIn,
  type Credentials,
  type ServerConfig,
} from "@/lib/api";
import { formatDuration, formatSql, quoteIdentifier } from "@/lib/format";
import TopBar from "@/components/TopBar";
import SchemaSidebar from "@/components/SchemaSidebar";
import QueryTabs from "@/components/QueryTabs";
import SqlEditor, { type SqlEditorHandle } from "@/components/SqlEditor";
import ResultsPanel from "@/components/ResultsPanel";
import LoginDialog from "@/components/LoginDialog";
import Splitter from "@/components/Splitter";

interface QueryTab {
  id: string;
  title: string;
  sql: string;
  dirty: boolean;
}

const STARTER_SQL = `-- Kilgore SQL editor
-- Ctrl+Enter runs the query (or just the selection).

SHOW DATABASES;`;

const THEME_KEY = "kilgore.theme";
let tabSequence = 1;

function newTab(sql = ""): QueryTab {
  tabSequence += 1;
  return { id: `tab_${tabSequence}`, title: `Query ${tabSequence - 1}`, sql, dirty: false };
}

export default function Page() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Credentials live here and nowhere else: no cookie, no storage, no server
  // session. Closing or reloading the tab signs you out.
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);

  const [databases, setDatabases] = useState<Database[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [activeDatabase, setActiveDatabase] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);

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

  // --- Which server are we pointed at? -------------------------------------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchServerConfig();
        if (!cancelled) setServer(config);
      } catch (error) {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Session -------------------------------------------------------------

  /** Drops every trace of the session from memory. */
  const signOut = useCallback((reason: string | null = null) => {
    setCredentials(null);
    setConnection(null);
    setDatabases([]);
    setActiveDatabase(null);
    setSchemaError(null);
    setSignedOutReason(reason);
    // Results and history came out of the database; they go with the session.
    setRuns({});
    setHistory([]);
    setRunningTabs({});
  }, []);

  const loadSchema = useCallback(
    async (active: Credentials) => {
      setSchemaLoading(true);
      try {
        const result = await fetchSchema(active);
        setDatabases(result.databases);
        setSchemaError(result.error ?? null);
        setConnection((prev) =>
          prev
            ? {
                ...prev,
                status: result.error ? "error" : "connected",
                serverVersion: result.server?.version ?? prev.serverVersion,
              }
            : prev
        );
        // Land on something real if sign-in did not name a database.
        setActiveDatabase((prev) =>
          prev && result.databases.some((d) => d.name === prev)
            ? prev
            : (result.databases[0]?.name ?? null)
        );
      } catch (error) {
        if (error instanceof AuthError) {
          signOut(error.message);
          return;
        }
        setSchemaError(error instanceof Error ? error.message : String(error));
      } finally {
        setSchemaLoading(false);
      }
    },
    [signOut]
  );

  const handleSignIn = useCallback(
    async (next: Credentials) => {
      if (!server) throw new Error("The server address is not known yet.");

      // Throws on bad credentials; LoginDialog renders the message.
      const version = await signIn(next);

      setCredentials(next);
      setSignedOutReason(null);
      setConnection({
        id: "session",
        name: server.host.split(".")[0] || server.host,
        host: server.host,
        port: server.port,
        username: next.user,
        database: next.database,
        useSsl: server.ssl,
        status: "connected",
        serverVersion: version,
      });
      setActiveDatabase(next.database ?? null);
      await loadSchema(next);
    },
    [server, loadSchema]
  );

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
      if (!tab || !credentials) return;
      const sql = (overrideSql ?? (selection.trim() ? selection : tab.sql)).trim();
      if (!sql) return;

      const token = runToken.current;
      setRunningTabs((prev) => ({ ...prev, [tab.id]: true }));
      try {
        const result = await runQuery({
          credentials,
          connectionId: "session",
          database: activeDatabase,
          sql,
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
      } catch (error) {
        // The session died underneath us - MySQL revoked or dropped the user.
        if (error instanceof AuthError) signOut(error.message);
      } finally {
        setRunningTabs((prev) => ({ ...prev, [tab.id]: false }));
      }
    },
    [tabs, activeTabId, credentials, activeDatabase, selection, signOut]
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
        connection={connection}
        onSignOut={() => signOut()}
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
          onRefresh={() => {
            if (credentials) void loadSchema(credentials);
          }}
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
            canRun={Boolean(credentials) && activeTab.sql.trim().length > 0}
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
        <span>{connection ? connection.name : "Not signed in"}</span>
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
        {connection && <span className="source-pill source-mysql">Live MySQL</span>}
      </footer>

      {!credentials && (
        <LoginDialog
          server={server}
          configError={configError}
          notice={signedOutReason}
          onSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
