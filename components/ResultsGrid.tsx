"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ResultSet, SqlValue } from "@/lib/types";
import { formatCell } from "@/lib/format";

type SortDirection = "asc" | "desc";

interface SortState {
  columnIndex: number;
  direction: SortDirection;
}

export interface ResultsGridProps {
  result: ResultSet;
  onCellSelect?: (value: SqlValue, columnName: string) => void;
}

const MIN_COLUMN_WIDTH = 64;
const DEFAULT_COLUMN_WIDTH = 168;

function compare(a: SqlValue, b: SqlValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export default function ResultsGrid({ result, onCellSelect }: ResultsGridProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null);
  const [widths, setWidths] = useState<Record<number, number>>({});
  const dragState = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const rows = useMemo(() => {
    if (!sort) return result.rows;
    const copy = [...result.rows];
    copy.sort((left, right) => {
      const outcome = compare(left[sort.columnIndex], right[sort.columnIndex]);
      return sort.direction === "asc" ? outcome : -outcome;
    });
    return copy;
  }, [result.rows, sort]);

  function toggleSort(columnIndex: number) {
    setSort((prev) => {
      if (!prev || prev.columnIndex !== columnIndex) return { columnIndex, direction: "asc" };
      if (prev.direction === "asc") return { columnIndex, direction: "desc" };
      return null;
    });
  }

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const next = Math.max(MIN_COLUMN_WIDTH, drag.startWidth + (event.clientX - drag.startX));
    setWidths((prev) => ({ ...prev, [drag.index]: next }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  function startResize(event: React.PointerEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    dragState.current = {
      index,
      startX: event.clientX,
      startWidth: widths[index] ?? DEFAULT_COLUMN_WIDTH,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function selectCell(rowIndex: number, columnIndex: number) {
    setSelected({ row: rowIndex, column: columnIndex });
    onCellSelect?.(rows[rowIndex][columnIndex], result.columns[columnIndex].name);
  }

  if (result.rows.length === 0) {
    return <div className="grid-empty">Query returned no rows.</div>;
  }

  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr>
            <th className="grid-rownum" scope="col">
              <span className="visually-hidden">Row</span>
            </th>
            {result.columns.map((column, index) => {
              const isSorted = sort?.columnIndex === index;
              return (
                <th
                  key={`${column.name}-${index}`}
                  scope="col"
                  style={{ width: widths[index] ?? DEFAULT_COLUMN_WIDTH }}
                  aria-sort={isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="grid-header-button"
                    onClick={() => toggleSort(index)}
                    title={`${column.name}${column.table ? ` · ${column.table}` : ""} — click to sort`}
                  >
                    <span className="grid-header-name">{column.name}</span>
                    <span className={`grid-sort${isSorted ? " is-active" : ""}`}>
                      {isSorted ? (sort.direction === "asc" ? "▲" : "▼") : "•"}
                    </span>
                  </button>
                  <span
                    className="grid-resizer"
                    onPointerDown={(event) => startResize(event, index)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.name}`}
                  />
                </th>
              );
            })}
            {/* Absorbs leftover width so the row-number column stays narrow. */}
            <th className="grid-filler" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td className="grid-rownum">{rowIndex + 1}</td>
              {row.map((value, columnIndex) => {
                const column = result.columns[columnIndex];
                const numeric = column.type === "int" || column.type === "decimal";
                const isSelected =
                  selected?.row === rowIndex && selected?.column === columnIndex;
                return (
                  <td
                    key={columnIndex}
                    className={[
                      numeric ? "is-numeric" : "",
                      value === null ? "is-null" : "",
                      isSelected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => selectCell(rowIndex, columnIndex)}
                    title={value === null ? "NULL" : String(value)}
                  >
                    {formatCell(value, column)}
                  </td>
                );
              })}
              <td className="grid-filler" aria-hidden="true" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
