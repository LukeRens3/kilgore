"use client";

import type { Connection, Database } from "@/lib/types";
import { DatabaseIcon, MoonIcon, ServerIcon, SunIcon } from "./Icons";

export interface TopBarProps {
  connections: Connection[];
  activeConnection: Connection | null;
  onSelectConnection: (id: string) => void;
  onManageConnections: () => void;
  databases: Database[];
  activeDatabase: string | null;
  onSelectDatabase: (name: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

const STATUS_LABEL: Record<Connection["status"], string> = {
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Disconnected",
  error: "Connection error",
};

export default function TopBar({
  connections,
  activeConnection,
  onSelectConnection,
  onManageConnections,
  databases,
  activeDatabase,
  onSelectDatabase,
  theme,
  onToggleTheme,
}: TopBarProps) {
  const status = activeConnection?.status ?? "disconnected";

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <ServerIcon />
        </span>
        <span className="brand-name">Kilgore</span>
        <span className="brand-tag">MySQL</span>
      </div>

      <div className="topbar-controls">
        <label className="field">
          <span className="field-label">Connection</span>
          <div className="select-wrap">
            <span className={`status-dot status-${status}`} aria-hidden="true" />
            <select
              value={activeConnection?.id ?? ""}
              onChange={(event) => onSelectConnection(event.target.value)}
              aria-label="Active connection"
            >
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Database</span>
          <div className="select-wrap">
            <DatabaseIcon className="select-icon" />
            <select
              value={activeDatabase ?? ""}
              onChange={(event) => onSelectDatabase(event.target.value)}
              aria-label="Active database"
              disabled={databases.length === 0}
            >
              {databases.length === 0 && <option value="">No databases</option>}
              {databases.map((database) => (
                <option key={database.name} value={database.name}>
                  {database.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        <button type="button" className="button button-ghost" onClick={onManageConnections}>
          Manage
        </button>
      </div>

      <div className="topbar-right">
        <span className="connection-detail" title={activeConnection?.host}>
          {activeConnection
            ? `${activeConnection.username}@${activeConnection.host}:${activeConnection.port}`
            : "No connection"}
          {activeConnection?.serverVersion && (
            <span className="connection-version">MySQL {activeConnection.serverVersion}</span>
          )}
        </span>
        <span className={`status-pill status-${status}`}>{STATUS_LABEL[status]}</span>
        <button
          type="button"
          className="icon-button"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
