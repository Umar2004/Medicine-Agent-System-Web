import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, OrderDocumentType, OrderStatus, QuotationStatus } from "@/types/entities";

const ORDER: Record<OrderStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-text-secondary" },
  sent: { label: "Sent", className: "bg-info/10 text-info-text" },
  negotiating: { label: "Negotiating", className: "bg-warning/15 text-warning-text" },
  confirmed: { label: "Confirmed", className: "bg-success/15 text-success-text" },
  batch_assigned: { label: "Batches assigned", className: "bg-primary-light text-primary" },
  invoiced: { label: "Invoiced", className: "bg-violet/15 text-violet-text" },
  completed: { label: "Completed", className: "bg-success/15 text-success-text" },
  cancelled: { label: "Cancelled", className: "bg-muted text-text-secondary line-through" },
};

const QUOTATION: Record<QuotationStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-text-secondary" },
  sent: { label: "Sent", className: "bg-info/10 text-info-text" },
  negotiating: { label: "Negotiating", className: "bg-warning/15 text-warning-text" },
  accepted: { label: "Accepted", className: "bg-success/15 text-success-text" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  expired: { label: "Expired", className: "bg-muted text-text-muted line-through" },
  converted: { label: "Converted to PI", className: "bg-primary-light text-primary" },
};

const INVOICE: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-warning/15 text-warning-text" },
  issued: { label: "Issued", className: "bg-success/15 text-success-text" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

export const ORDER_STATUS_LABELS = Object.fromEntries(
  Object.entries(ORDER).map(([k, v]) => [k, v.label]),
) as Record<OrderStatus, string>;
export const QUOTATION_STATUS_LABELS = Object.fromEntries(
  Object.entries(QUOTATION).map(([k, v]) => [k, v.label]),
) as Record<QuotationStatus, string>;
export const INVOICE_STATUS_LABELS = Object.fromEntries(
  Object.entries(INVOICE).map(([k, v]) => [k, v.label]),
) as Record<InvoiceStatus, string>;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={ORDER[status].className}>{ORDER[status].label}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge className={INVOICE[status].className}>{INVOICE[status].label}</Badge>;
}

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge className={QUOTATION[status].className}>{QUOTATION[status].label}</Badge>;
}

const DOCUMENT_TYPE: Record<OrderDocumentType, { short: string; label: string; className: string }> = {
  proforma_invoice: { short: "PI", label: "Proforma invoice", className: "border-primary/30 bg-background text-primary" },
  commercial_invoice: { short: "INV", label: "Invoice", className: "border-violet/40 bg-violet/10 text-violet-text" },
};

/** "PI" / "INV" chip for orders; `full` spells it out. */
export function DocumentTypeBadge({ type, full }: { type: OrderDocumentType; full?: boolean }) {
  const t = DOCUMENT_TYPE[type];
  return (
    <Badge variant="outline" className={t.className} title={t.label}>
      {full ? t.label : t.short}
    </Badge>
  );
}
