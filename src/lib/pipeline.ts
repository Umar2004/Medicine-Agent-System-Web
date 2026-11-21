// QT → PI → batches → CI → packing: where a deal is and what comes next (CLAUDE.md §7.2).
// Client-safe — used by PipelineProgress on the quotation, order, invoice and packing pages.
import type { InvoiceStatus, OrderStatus, PermissionKey, QuotationStatus } from "@/lib/constants";

export const PIPELINE_STEPS = ["quotation", "proforma", "batch_assignment", "commercial_invoice", "packing"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  quotation: "Quotation",
  proforma: "Proforma invoice",
  batch_assignment: "Batch assignment",
  commercial_invoice: "Invoice",
  packing: "Packing",
};

/** What a page knows about the deal it shows. */
export interface PipelineDeal {
  /** null = the PI was created directly (no quotation) or this is still only a quotation's PI-less state. */
  quotation: { id: string; status: QuotationStatus } | null;
  order: { id: string; status: OrderStatus } | null;
  /** The live (not cancelled) invoice. */
  invoice: { id: string; status: InvoiceStatus } | null;
  packingListId: string | null;
}

export interface NextAction {
  label: string;
  permission: PermissionKey;
}

export type StepState = "done" | "current" | "upcoming" | "skipped";

export interface PipelineView {
  /** "done" once paid and packed. */
  current: PipelineStep | "done";
  next: NextAction | null;
  /** Shown instead of a next step (cancelled, rejected…). */
  note: string | null;
  steps: { key: PipelineStep; label: string; state: StepState; href: string | null }[];
}

function locate(deal: PipelineDeal): Pick<PipelineView, "current" | "next" | "note"> {
  const { quotation, order, invoice, packingListId } = deal;
  const at = (current: PipelineView["current"], next: NextAction | null, note: string | null = null) => ({ current, next, note });

  if (order) {
    switch (order.status) {
      case "draft":
        return at("proforma", { label: "Send the proforma invoice to the customer", permission: "manage_proforma_invoices" });
      case "sent":
        return at("proforma", { label: "Record the customer's confirmation", permission: "approve_proforma_invoices" });
      case "negotiating":
        return at("proforma", { label: "Revise the proforma invoice and re-send it", permission: "manage_proforma_invoices" });
      case "confirmed":
        return at("batch_assignment", { label: "Assign batches", permission: "approve_orders" });
      case "batch_assigned":
        return at("commercial_invoice", { label: "Create the invoice", permission: "manage_invoices" });
      case "cancelled":
        return at("proforma", null, "This order was cancelled.");
      case "invoiced":
        if (!invoice || invoice.status === "draft") {
          return at("commercial_invoice", { label: "Complete and issue the invoice", permission: "manage_invoices" });
        }
        if (!packingListId) return at("packing", { label: "Create the packing list", permission: "manage_packing_lists" });
        return at("packing", { label: "Mark the order completed once payment is received", permission: "manage_orders" });
      case "completed":
        if (!packingListId) return at("packing", { label: "Create the packing list", permission: "manage_packing_lists" });
        return at("done", null, "Completed — invoiced, packed and paid.");
    }
  }
  if (!quotation) return at("proforma", null);
  switch (quotation.status) {
    case "draft":
      return at("quotation", { label: "Send the quotation to the customer", permission: "manage_quotations" });
    case "sent":
      return at("quotation", { label: "Record the customer's answer", permission: "approve_quotations" });
    case "negotiating":
      return at("quotation", { label: "Revise the quotation and re-send it", permission: "manage_quotations" });
    case "accepted":
      return at("quotation", { label: "Convert to a proforma invoice", permission: "manage_proforma_invoices" });
    case "rejected":
      return at("quotation", null, "The customer rejected this quotation. Revising it starts a new draft.");
    case "expired":
      return at("quotation", null, "This quotation has expired.");
    case "converted":
      return at("proforma", null);
  }
}

export function describePipeline(deal: PipelineDeal): PipelineView {
  const { current, next, note } = locate(deal);
  const currentIndex = current === "done" ? PIPELINE_STEPS.length : PIPELINE_STEPS.indexOf(current);
  const { quotation, order, invoice } = deal;

  const hrefs: Record<PipelineStep, string | null> = {
    quotation: quotation ? `/quotations/${quotation.id}` : null,
    proforma: order ? `/orders/${order.id}` : null,
    batch_assignment: order ? (order.status === "confirmed" ? `/orders/${order.id}/assign-batches` : `/orders/${order.id}`) : null,
    commercial_invoice: invoice ? `/invoices/${invoice.id}` : null,
    packing: invoice && invoice.status !== "cancelled" ? `/invoices/${invoice.id}/packing` : null,
  };

  return {
    current,
    next,
    note,
    steps: PIPELINE_STEPS.map((key, i) => {
      const state: StepState =
        key === "quotation" && !quotation && order ? "skipped" : i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
      // Only steps already reached link anywhere; the packing page itself can be opened once a CI exists.
      const reachable = state !== "upcoming" || (key === "packing" && !!hrefs.packing);
      return { key, label: PIPELINE_STEP_LABELS[key], state, href: reachable ? hrefs[key] : null };
    }),
  };
}

/** The deal behind an invoice page (the CI itself only counts while it isn't cancelled). */
export function dealFromInvoice(inv: {
  id: string;
  status: InvoiceStatus;
  orderId: string | null;
  orderStatus: OrderStatus | null;
  sourceQuotationId: string | null;
  packingListId: string | null;
}): PipelineDeal | null {
  if (!inv.orderId || !inv.orderStatus) return null; // legacy invoice without an order
  const live = inv.status !== "cancelled";
  return {
    quotation: inv.sourceQuotationId ? { id: inv.sourceQuotationId, status: "converted" } : null,
    order: { id: inv.orderId, status: inv.orderStatus },
    invoice: live ? { id: inv.id, status: inv.status } : null,
    packingListId: live ? inv.packingListId : null,
  };
}
