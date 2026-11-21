"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

/** Debounced (300 ms) search box. Calls onSearch with the settled value. */
export function SearchInput({
  onSearch,
  placeholder = "Search…",
  className,
}: {
  onSearch: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 300);

  useEffect(() => {
    onSearch(debounced.trim());
  }, [debounced, onSearch]);

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8"
        aria-label={placeholder}
      />
    </div>
  );
}
