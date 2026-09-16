"use client";

import { useEffect, useRef, useState } from "react";
import type { Credentials, ServerConfig } from "@/lib/api";
import { LockIcon, ServerIcon } from "./Icons";

export interface LoginDialogProps {
  /** Null until /api/config answers; the form stays disabled meanwhile. */
  server: ServerConfig | null;
  /** Set when the server itself has no database configured. */
  configError: string | null;
  /** Why the previous session ended, shown until the next attempt replaces it. */
  notice?: string | null;
  onSignIn: (credentials: Credentials) => Promise<void>;
}

/**
 * The gate. Rendered whenever there are no credentials in memory, which means
 * on every fresh load and after every sign-out - nothing is remembered between
 * page loads by design.
 *
 * Deliberately not dismissable: there is nothing to look at behind it.
 */
export default function LoginDialog({
  server,
  configError,
  notice,
  onSignIn,
}: LoginDialogProps) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const userRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !server) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSignIn({ user: user.trim(), password, database: database.trim() || undefined });
      // On success the parent unmounts this dialog; clear the password either
      // way so it never lingers in component state.
      setPassword("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal-signin" role="dialog" aria-modal="true" aria-label="Sign in">
        <header className="modal-header">
          <h2>Sign in to Kilgore</h2>
        </header>

        <form className="signin-body" onSubmit={handleSubmit}>
          <div className="signin-server">
            <span className="signin-server-icon" aria-hidden="true">
              <ServerIcon />
            </span>
            <span className="signin-server-body">
              {server ? (
                <>
                  <span className="signin-server-host">
                    {server.host}:{server.port}
                  </span>
                  <span className="signin-server-meta">
                    {server.ssl ? "TLS enabled" : "TLS disabled"}
                  </span>
                </>
              ) : (
                <span className="signin-server-host">
                  {configError ?? "Locating server…"}
                </span>
              )}
            </span>
          </div>

          <p className="signin-intro">
            Sign in with your MySQL account. What you can see and do is decided by that
            account&apos;s grants.
          </p>

          <label className="form-field">
            <span>Username</span>
            <input
              ref={userRef}
              value={user}
              onChange={(event) => setUser(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={!server || submitting}
              required
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={!server || submitting}
            />
          </label>

          <label className="form-field">
            <span>Default database (optional)</span>
            <input
              value={database}
              onChange={(event) => setDatabase(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Leave blank to choose later"
              disabled={!server || submitting}
            />
          </label>

          {(error ?? notice) && (
            <p className="signin-error" role="alert">
              {error ?? notice}
            </p>
          )}

          <button
            type="submit"
            className="button button-primary signin-submit"
            disabled={!server || submitting || !user.trim()}
          >
            <LockIcon />
            {submitting ? "Connecting…" : "Connect"}
          </button>

          <p className="form-note signin-note">
            Credentials are kept in this tab only, for as long as it stays open. They are
            sent to the server with each request and never stored there.
          </p>
        </form>
      </div>
    </div>
  );
}
