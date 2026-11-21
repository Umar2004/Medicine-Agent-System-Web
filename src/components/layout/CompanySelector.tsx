"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "@/hooks/use-company";

const ALL_COMPANIES_LABEL = "All companies";

export function CompanySelector() {
  const { companies, currentCompany, isAllCompanies, canChooseAll, switchCompany } = useCompany();

  if (companies.length === 0) {
    return <span className="text-sm text-muted-foreground">No company assigned</span>;
  }

  const label = isAllCompanies ? ALL_COMPANIES_LABEL : (currentCompany?.name ?? "Select company");
  const switchable = canChooseAll || companies.length > 1;

  if (!switchable) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 text-muted-foreground" />
        {label}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 max-w-xs gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch company</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canChooseAll && (
          <>
            <DropdownMenuItem onSelect={() => switchCompany(null)}>
              <span className="flex-1">{ALL_COMPANIES_LABEL}</span>
              {isAllCompanies && <Check className="size-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => switchCompany(c.id)}>
            <span className="flex-1 truncate">{c.name}</span>
            {currentCompany?.id === c.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
