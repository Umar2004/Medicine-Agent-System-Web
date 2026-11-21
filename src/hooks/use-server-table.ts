"use client";

import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

/** Search / paging / sorting state for a server-side DataTable. */
export function useServerTable(defaultSort: { id: string; desc?: boolean }) {
  const [search, setSearchState] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [sorting, setSortingState] = useState<SortingState>([{ id: defaultSort.id, desc: !!defaultSort.desc }]);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);
  const setSorting = useCallback((s: SortingState) => {
    setSortingState(s);
    setPage(1);
  }, []);
  /** Call when a filter outside this hook changes. */
  const resetPage = useCallback(() => setPage(1), []);

  const sort = sorting[0];
  const params = useMemo(
    () => ({ search, page, pageSize, sortBy: sort?.id, sortDir: sort?.desc ? ("desc" as const) : ("asc" as const) }),
    [search, page, pageSize, sort],
  );

  return {
    params,
    search,
    setSearch,
    resetPage,
    tableProps: { page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize, sorting, onSortingChange: setSorting },
  };
}
