"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";

// Neutral sort indicator — two stacked arrows, used when a column is sortable but not sorted
function SortNeutralIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" className="shrink-0 opacity-35">
      <path d="M3 4.5L5 2L7 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 7.5L5 10L7 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Column definition ─────────────────────────────────────────────────────────

export type ColumnDef<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;          // e.g. "w-48" or "w-24"
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
};

// ── Row action definition ─────────────────────────────────────────────────────

export type RowAction<T> = {
  label: string;
  onClick: (row: T) => void;
  destructive?: boolean;
  hidden?: (row: T) => boolean;
};

// ── Sort state ────────────────────────────────────────────────────────────────

type SortState = { key: string; dir: "asc" | "desc" };

// ── Pagination props ──────────────────────────────────────────────────────────

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  hasMore?: boolean;
  onPageChange: (page: number) => void;
};

// ── Main props ────────────────────────────────────────────────────────────────

export type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  actions?: RowAction<T>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  pagination?: PaginationState;
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  className?: string;
};

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sort }: { col: string; sort: SortState | null }) {
  if (!sort || sort.key !== col) return <SortNeutralIcon />;
  return sort.dir === "asc"
    ? <HugeiconsIcon icon={ArrowUp01Icon} size={11} className="text-primary" />
    : <HugeiconsIcon icon={ArrowDown01Icon} size={11} className="text-primary" />;
}

// ── Empty state row ───────────────────────────────────────────────────────────

function EmptyRow({
  colSpan,
  title,
  description,
}: {
  colSpan: number;
  title: string;
  description: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-muted-foreground/40">
              <rect x="2" y="5" width="16" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="9" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="13" width="8" height="2" rx="1" fill="currentColor" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>
        </div>
      </td>
    </tr>
  );
}

// ── Loading skeleton rows ─────────────────────────────────────────────────────

function SkeletonRows({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: colSpan }).map((_, j) => (
            <td key={j} className="px-4 py-4">
              <div
                className={cn(
                  "h-4 rounded-full bg-muted animate-pulse",
                  j === 0 ? "w-32" : j % 3 === 0 ? "w-16" : "w-24"
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  rowKey,
  actions,
  loading = false,
  emptyTitle = "No records",
  emptyDescription = "Nothing to show here yet.",
  pagination,
  onSortChange,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  function handleSort(key: string) {
    const next: SortState =
      sort?.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" };
    setSort(next);
    onSortChange?.(next.key, next.dir);
  }

  const hasActions = actions && actions.length > 0;
  const totalCols = columns.length + (hasActions ? 1 : 0);

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;

  return (
    <div className={cn("flex flex-col gap-0", className)}>
      <div className="overflow-hidden rounded-3xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* ── Head ── */}
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold text-muted-foreground select-none",
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left",
                      col.width,
                      col.sortable && "cursor-pointer hover:text-foreground transition-colors"
                    )}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && <SortIcon col={col.key} sort={sort} />}
                    </span>
                  </th>
                ))}
                {hasActions && (
                  <th className="w-12 px-2 py-3" />
                )}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody className="divide-y divide-border">
              {loading ? (
                <SkeletonRows colSpan={totalCols} />
              ) : data.length === 0 ? (
                <EmptyRow
                  colSpan={totalCols}
                  title={emptyTitle}
                  description={emptyDescription}
                />
              ) : (
                data.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="group bg-card odd:bg-card even:bg-muted/20 transition-colors hover:bg-primary/5"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3.5",
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                            ? "text-center"
                            : "text-left"
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-2 py-3.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <HugeiconsIcon
                                icon={MoreHorizontalIcon}
                                size={15}
                                strokeWidth={2}
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {actions
                              .filter((a) => !a.hidden?.(row))
                              .map((action) => (
                                <DropdownMenuItem
                                  key={action.label}
                                  onClick={() => action.onClick(row)}
                                  className={action.destructive ? "text-destructive" : ""}
                                >
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {pagination && (
        <div className="flex items-center justify-between px-1 pt-3 text-sm text-muted-foreground">
          <p>
            Page {pagination.page} of {totalPages}
            {pagination.total > 0 && (
              <span className="ml-1.5 text-xs">· {pagination.total} total</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={pagination.page <= 1 || loading}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={
                loading ||
                (pagination.hasMore !== undefined
                  ? !pagination.hasMore
                  : pagination.page >= totalPages)
              }
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
