"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [10, 20, 50, 100];

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  getRowId: (row: T) => string;
}

/** Server-side paginated + sorted table (TanStack Table v8, manual mode). */
export function DataTable<T>({
  columns,
  data,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  isLoading,
  emptyMessage = "No records found.",
  onRowClick,
  getRowId,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting },
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: false,
    pageCount: totalPages,
    onSortingChange: (updater) => onSortingChange(typeof updater === "function" ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
  });

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <div className="max-h-[calc(100vh-280px)] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} className="h-10 text-xs font-medium text-text-secondary">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : dir === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: Math.min(pageSize, 8) }, (_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn("text-[13px]", onRowClick && "cursor-pointer")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
        <span>
          {from}–{to} of {totalCount}
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger size="sm" className="w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
