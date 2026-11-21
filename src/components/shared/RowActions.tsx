"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Edit / delete icon buttons for a table row. Clicks don't trigger the row's onClick. */
export function RowActions({
  label,
  onEdit,
  onDelete,
  disabled,
}: {
  label: string;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {onEdit && (
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label}`} onClick={onEdit} disabled={disabled}>
          <Pencil />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Delete ${label}`}
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
