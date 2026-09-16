"use client";

import { useMemo, useState } from "react";
import type { Database, Table } from "@/lib/types";
import { formatBytes, formatRowCount } from "@/lib/format";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ColumnIcon,
  DatabaseIcon,
  KeyIcon,
  RefreshIcon,
  SearchIcon,
  TableIcon,
  ViewIcon,
} from "./Icons";

export interface SchemaSidebarProps {
  databases: Database[];
  loading: boolean;
  activeDatabase: string | null;
  onSelectDatabase: (name: string) => void;
  onPreviewTable: (database: string, table: Table) => void;
  onDescribeTable: (database: string, table: Table) => void;
  onInsertText: (text: string) => void;
  onRefresh: () => void;
}

export default function SchemaSidebar({
  databases,
  loading,
  activeDatabase,
  onSelectDatabase,
  onPreviewTable,
  onDescribeTable,
  onInsertText,
  onRefresh,
}: SchemaSidebarProps) {
  const [filter, setFilter] = useState("");
  const [openDatabases, setOpenDatabases] = useState<Set<string>>(
    () => new Set(activeDatabase ? [activeDatabase] : [])
  );
  const [openTables, setOpenTables] = useState<Set<string>>(() => new Set());

  const needle = filter.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return databases;
    return databases
      .map((database) => ({
        ...database,
        tables: database.tables.filter(
          (table) =>
            table.name.toLowerCase().includes(needle) ||
            table.columns.some((c) => c.name.toLowerCase().includes(needle))
        ),
      }))
      .filter(
        (database) => database.tables.length > 0 || database.name.toLowerCase().includes(needle)
      );
  }, [databases, needle]);

  // A filter should reveal what it matched rather than make the user expand by hand.
  const expandedDatabases = needle
    ? new Set(visible.map((d) => d.name))
    : openDatabases;

  function toggleDatabase(name: string) {
    setOpenDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleTable(key: string) {
    setOpenTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Schema</span>
        <button
          type="button"
          className="icon-button"
          onClick={onRefresh}
          title="Refresh schema"
          aria-label="Refresh schema"
        >
          <RefreshIcon className={loading ? "spinning" : undefined} />
        </button>
      </div>

      <div className="sidebar-search">
        <SearchIcon className="sidebar-search-icon" />
        <input
          type="search"
          value={filter}
          placeholder="Filter tables and columns"
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter schema"
        />
      </div>

      <div className="sidebar-tree" role="tree">
        {loading && databases.length === 0 ? (
          <div className="sidebar-empty">Loading schema…</div>
        ) : visible.length === 0 ? (
          <div className="sidebar-empty">
            {needle
              ? `No tables or columns match “${filter}”`
              : "No databases. Check the connection settings and try refreshing."}
          </div>
        ) : (
          visible.map((database) => {
            const isOpen = expandedDatabases.has(database.name);
            const isActive = database.name === activeDatabase;
            return (
              <div key={database.name} className="tree-group">
                <div
                  className={`tree-row tree-database${isActive ? " is-active" : ""}`}
                  role="treeitem"
                  aria-expanded={isOpen}
                  tabIndex={0}
                  onClick={() => toggleDatabase(database.name)}
                  onDoubleClick={() => onSelectDatabase(database.name)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSelectDatabase(database.name);
                    if (event.key === " ") {
                      event.preventDefault();
                      toggleDatabase(database.name);
                    }
                  }}
                  title={`${database.name} · ${database.charset}`}
                >
                  <span className="tree-chevron">
                    {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                  <DatabaseIcon className="tree-icon" />
                  <span className="tree-label">{database.name}</span>
                  <span className="tree-meta">{database.tables.length}</span>
                </div>

                {isOpen &&
                  database.tables.map((table) => {
                    const key = `${database.name}.${table.name}`;
                    const tableOpen = openTables.has(key);
                    return (
                      <div key={key} className="tree-group">
                        <div
                          className="tree-row tree-table"
                          role="treeitem"
                          aria-expanded={tableOpen}
                          tabIndex={0}
                          onClick={() => toggleTable(key)}
                          onDoubleClick={() => onPreviewTable(database.name, table)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") onPreviewTable(database.name, table);
                          }}
                          title={`${table.rowCount.toLocaleString()} rows · ${formatBytes(table.sizeBytes)} · ${table.engine}`}
                        >
                          <span className="tree-chevron">
                            {tableOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                          </span>
                          {table.kind === "view" ? (
                            <ViewIcon className="tree-icon tree-icon-view" />
                          ) : (
                            <TableIcon className="tree-icon" />
                          )}
                          <span className="tree-label">{table.name}</span>
                          <span className="tree-meta">{formatRowCount(table.rowCount)}</span>
                          <span className="tree-actions">
                            <button
                              type="button"
                              className="tree-action"
                              onClick={(event) => {
                                event.stopPropagation();
                                onPreviewTable(database.name, table);
                              }}
                              title="Select first 200 rows"
                            >
                              rows
                            </button>
                            <button
                              type="button"
                              className="tree-action"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDescribeTable(database.name, table);
                              }}
                              title="Describe table"
                            >
                              info
                            </button>
                          </span>
                        </div>

                        {tableOpen &&
                          table.columns.map((column) => (
                            <div
                              key={column.name}
                              className="tree-row tree-column"
                              role="treeitem"
                              tabIndex={0}
                              onClick={() => onInsertText(column.name)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") onInsertText(column.name);
                              }}
                              title={`${column.dataType}${column.nullable ? " NULL" : " NOT NULL"}${
                                column.defaultValue ? ` DEFAULT ${column.defaultValue}` : ""
                              }`}
                            >
                              <span className="tree-chevron" />
                              {column.key === "PRI" ? (
                                <KeyIcon className="tree-icon tree-icon-key" />
                              ) : (
                                <ColumnIcon className="tree-icon tree-icon-column" />
                              )}
                              <span className="tree-label">{column.name}</span>
                              <span className="tree-type">{column.dataType}</span>
                            </div>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
