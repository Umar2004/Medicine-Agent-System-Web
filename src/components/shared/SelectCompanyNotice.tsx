"use client";

import { Building2 } from "lucide-react";

/** Owner in "All companies" mode can read but must pick a company to create or edit. */
export function SelectCompanyNotice({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm text-text-secondary">
      <Building2 className="size-4 shrink-0 text-info" />
      <span>
        Showing {what} from all companies. Select a company in the top bar to add or edit {what}.
      </span>
    </div>
  );
}
