"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Right-hand create/edit sheet with a scrollable form body and a sticky footer. */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  formId,
  onSubmit,
  submitLabel,
  isPending,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  formId: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  isPending: boolean;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <form id={formId} onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto p-4" noValidate>
          {children}
        </form>

        <SheetFooter className="flex-row justify-end border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
