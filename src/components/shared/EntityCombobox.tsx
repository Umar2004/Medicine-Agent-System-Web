"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text shown muted, also searchable. */
  hint?: string;
}

/** Searchable single-select (Popover + cmdk). Empty string = nothing selected. */
export function EntityCombobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  noneLabel,
  disabled,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** When set, an extra first option clears the selection. */
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? (
              <>
                {selected.label}
                {selected.hint && <span className="ml-2 text-text-muted">{selected.hint}</span>}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {noneLabel && (
                <CommandItem value="__none__" onSelect={() => pick("")}>
                  <Check className={cn(value === "" ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ""} ${o.value}`} onSelect={() => pick(o.value)}>
                  <Check className={cn(o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto truncate text-xs text-text-muted">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
