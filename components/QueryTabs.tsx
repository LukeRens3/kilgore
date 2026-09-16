"use client";

import { CloseIcon, PlayIcon, PlusIcon, StopIcon, WandIcon } from "./Icons";

export interface QueryTabSummary {
  id: string;
  title: string;
  dirty: boolean;
}

export interface QueryTabsProps {
  tabs: QueryTabSummary[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onRun: () => void;
  onCancel: () => void;
  onFormat: () => void;
  running: boolean;
  hasSelection: boolean;
  canRun: boolean;
}

export default function QueryTabs({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCreate,
  onRun,
  onCancel,
  onFormat,
  running,
  hasSelection,
  canRun,
}: QueryTabsProps) {
  return (
    <div className="query-tabs">
      <div className="query-tabs-strip" role="tablist" aria-label="Open queries">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`query-tab${isActive ? " is-active" : ""}`}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(tab.id);
              }}
            >
              <span className="query-tab-title">{tab.title}</span>
              {tab.dirty && <span className="query-tab-dot" aria-label="Unsaved changes" />}
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="query-tab-close"
                  aria-label={`Close ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                >
                  <CloseIcon width={12} height={12} />
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="icon-button query-tab-add" onClick={onCreate} title="New query (Ctrl+T)" aria-label="New query">
          <PlusIcon />
        </button>
      </div>

      <div className="editor-toolbar">
        <button type="button" className="button button-ghost" onClick={onFormat} title="Format SQL (Ctrl+Shift+F)">
          <WandIcon />
          Format
        </button>
        {running ? (
          <button type="button" className="button button-danger" onClick={onCancel}>
            <StopIcon />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={onRun}
            disabled={!canRun}
            title="Run (Ctrl+Enter)"
          >
            <PlayIcon />
            {hasSelection ? "Run selection" : "Run"}
            <kbd className="button-kbd">Ctrl↵</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
