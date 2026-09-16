"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type ForwardedRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  drawSelection,
  rectangularSelection,
  highlightSpecialChars,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { sql, MySQL, type SQLNamespace } from "@codemirror/lang-sql";
import { tags } from "@lezer/highlight";
import type { Database } from "@/lib/types";

/**
 * Colours come from CSS custom properties so the editor follows the app theme
 * without needing to be reconfigured on toggle.
 */
const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syn-keyword)", fontWeight: "600" },
  { tag: tags.string, color: "var(--syn-string)" },
  { tag: tags.number, color: "var(--syn-number)" },
  { tag: tags.bool, color: "var(--syn-number)" },
  { tag: tags.null, color: "var(--syn-number)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syn-operator)" },
  { tag: tags.punctuation, color: "var(--syn-punct)" },
  { tag: tags.typeName, color: "var(--syn-type)" },
  { tag: tags.function(tags.variableName), color: "var(--syn-function)" },
  { tag: tags.variableName, color: "var(--syn-ident)" },
  { tag: tags.special(tags.string), color: "var(--syn-string)" },
  { tag: tags.invalid, color: "var(--danger)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "var(--editor-bg)",
    color: "var(--text)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
  ".cm-gutters": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--text-faint)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--editor-active-line)",
    color: "var(--text-muted)",
  },
  ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--editor-selection)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--editor-bracket)",
    outline: "1px solid var(--border-strong)",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--editor-match)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-raised)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "var(--shadow-lg)",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    padding: "4px 10px",
    color: "var(--text)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent-strong)",
  },
  ".cm-completionIcon": { paddingRight: "14px", opacity: 0.7 },
  ".cm-completionDetail": { color: "var(--text-faint)", fontStyle: "normal", marginLeft: "8px" },
});

/** Shapes the schema the way lang-sql expects: db.table -> column names. */
function toNamespace(databases: Database[]): SQLNamespace {
  const namespace: SQLNamespace = {};
  for (const database of databases) {
    const tables: SQLNamespace = {};
    for (const table of database.tables) {
      tables[table.name] = table.columns.map((c) => ({
        label: c.name,
        type: c.key === "PRI" ? "property" : "property",
        detail: c.dataType,
      }));
    }
    namespace[database.name] = { self: { label: database.name, type: "type" }, children: tables };
  }
  return namespace;
}

export interface SqlEditorHandle {
  /** Inserts at the cursor, replacing the selection if there is one. */
  insertText: (text: string) => void;
  focus: () => void;
}

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires on Cmd/Ctrl+Enter - the parent decides whether to run all or just the selection. */
  onRun: () => void;
  onSelectionChange?: (selectedText: string) => void;
  databases: Database[];
  defaultDatabase: string | null;
  readOnly?: boolean;
}

function SqlEditor(
  {
    value,
    onChange,
    onRun,
    onSelectionChange,
    databases,
    defaultDatabase,
    readOnly = false,
  }: SqlEditorProps,
  ref: ForwardedRef<SqlEditorHandle>
) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const schemaCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  // Latest callbacks, so the editor never has to be torn down to pick them up.
  const handlers = useRef({ onChange, onRun, onSelectionChange });
  handlers.current = { onChange, onRun, onSelectionChange };

  useEffect(() => {
    if (!host.current) return undefined;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: true, maxRenderedOptions: 30 }),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(highlightStyle),
        keymap.of([
          {
            key: "Mod-Enter",
            preventDefault: true,
            run: () => {
              handlers.current.onRun();
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        schemaCompartment.current.of(
          sql({
            dialect: MySQL,
            schema: toNamespace(databases),
            defaultSchema: defaultDatabase ?? undefined,
            upperCaseKeywords: true,
          })
        ),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            handlers.current.onChange(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const { from, to } = update.state.selection.main;
            handlers.current.onSelectionChange?.(
              from === to ? "" : update.state.sliceDoc(from, to)
            );
          }
        }),
      ],
    });

    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mount once - value/schema/readOnly are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external value changes in (tab switches, "insert into editor" actions).
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.min(value.length, instance.state.selection.main.anchor) },
    });
  }, [value]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    instance.dispatch({
      effects: schemaCompartment.current.reconfigure(
        sql({
          dialect: MySQL,
          schema: toNamespace(databases),
          defaultSchema: defaultDatabase ?? undefined,
          upperCaseKeywords: true,
        })
      ),
    });
  }, [databases, defaultDatabase]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    instance.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string) {
        const instance = view.current;
        if (!instance) return;
        const { from, to } = instance.state.selection.main;
        instance.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        });
        instance.focus();
      },
      focus() {
        view.current?.focus();
      },
    }),
    []
  );

  return <div className="sql-editor" ref={host} />;
}

export default forwardRef(SqlEditor);
