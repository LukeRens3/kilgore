"use client";

import { useEffect, useRef, useState } from "react";
import type { Connection } from "@/lib/types";
import { CloseIcon } from "./Icons";

export interface ConnectionDialogProps {
  open: boolean;
  connections: Connection[];
  activeConnectionId: string | null;
  onClose: () => void;
  onConnect: (id: string) => void;
  onSave: (connection: Connection) => void;
}

const BLANK: Connection = {
  id: "",
  name: "",
  host: "127.0.0.1",
  port: 3306,
  username: "root",
  password: "",
  database: "",
  useSsl: false,
  status: "disconnected",
};

export default function ConnectionDialog({
  open,
  connections,
  activeConnectionId,
  onClose,
  onConnect,
  onSave,
}: ConnectionDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(activeConnectionId);
  const [draft, setDraft] = useState<Connection>(BLANK);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const existing = connections.find((c) => c.id === (activeConnectionId ?? ""));
    setSelectedId(activeConnectionId);
    setDraft(existing ? { ...existing, password: "" } : BLANK);
  }, [open, activeConnectionId, connections]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function selectConnection(connection: Connection) {
    setSelectedId(connection.id);
    setDraft({ ...connection, password: "" });
  }

  function startNew() {
    setSelectedId(null);
    setDraft({ ...BLANK, id: `conn_${Date.now().toString(36)}`, name: "New connection" });
  }

  function update<K extends keyof Connection>(key: K, value: Connection[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Connections" ref={dialogRef}>
        <header className="modal-header">
          <h2>Connections</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="modal-body">
          <div className="connection-list">
            {connections.map((connection) => (
              <button
                key={connection.id}
                type="button"
                className={`connection-item${connection.id === selectedId ? " is-active" : ""}`}
                onClick={() => selectConnection(connection)}
              >
                <span className={`status-dot status-${connection.status}`} aria-hidden="true" />
                <span className="connection-item-body">
                  <span className="connection-item-name">{connection.name}</span>
                  <span className="connection-item-host">
                    {connection.host}:{connection.port}
                  </span>
                </span>
              </button>
            ))}
            <button type="button" className="connection-item is-new" onClick={startNew}>
              + New connection
            </button>
          </div>

          <form
            className="connection-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSave(draft);
            }}
          >
            <label className="form-field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Staging"
                required
              />
            </label>

            <div className="form-row">
              <label className="form-field form-field-grow">
                <span>Host</span>
                <input
                  value={draft.host}
                  onChange={(event) => update("host", event.target.value)}
                  placeholder="db.example.com"
                  required
                />
              </label>
              <label className="form-field form-field-port">
                <span>Port</span>
                <input
                  type="number"
                  value={draft.port}
                  onChange={(event) => update("port", Number(event.target.value))}
                  min={1}
                  max={65535}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label className="form-field form-field-grow">
                <span>User</span>
                <input
                  value={draft.username}
                  onChange={(event) => update("username", event.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="form-field form-field-grow">
                <span>Password</span>
                <input
                  type="password"
                  value={draft.password ?? ""}
                  onChange={(event) => update("password", event.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </label>
            </div>

            <label className="form-field">
              <span>Default database</span>
              <input
                value={draft.database ?? ""}
                onChange={(event) => update("database", event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="form-check">
              <input
                type="checkbox"
                checked={draft.useSsl}
                onChange={(event) => update("useSsl", event.target.checked)}
              />
              <span>Require SSL/TLS</span>
            </label>

            <p className="form-note">
              The live connection is configured server-side in <code>.env.local</code> (
              <code>DB_HOST</code>, <code>DB_USER</code>, <code>DB_PASSWORD</code>). Edits here
              affect this session&apos;s list only — credentials never leave the server.
            </p>

            <footer className="modal-footer">
              <button type="submit" className="button button-ghost">
                Save
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  onSave(draft);
                  onConnect(draft.id);
                  onClose();
                }}
              >
                Connect
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
