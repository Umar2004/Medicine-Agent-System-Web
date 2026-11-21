// Shared enums and constants — see CLAUDE.md §6–§8.
// Safe to import from both server and client code.

export const ROLES = [
  "owner",
  "admin",
  "manager",
  "office_staff",
  "warehouse_staff",
  "staff",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  office_staff: "Office Staff",
  warehouse_staff: "Warehouse Staff",
  staff: "Staff",
};

/**
 * Who may manage whom: the owner manages anyone; everyone else only roles below their own,
 * so an admin can't take over another admin or hand out admin rights. Owner is never assignable.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  return actor === "owner" || ROLES.indexOf(actor) < ROLES.indexOf(target);
}

export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((r) => r !== "owner" && canManageRole(actor, r));
}

export const USER_STATUSES = ["active", "inactive"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PERMISSION_KEYS = [
  "manage_quotations",
  "approve_quotations",
  "manage_orders",
  "approve_orders",
  "manage_invoices",
  "manage_products",
  "manage_batches",
  "manage_customers",
  "manage_suppliers",
  "manage_manufacturers",
  "view_reports",
  "manage_bank_details",
  "manage_users",
  "view_audit_log",
  "manage_packing_lists",
  "manage_proforma_invoices",
  "approve_proforma_invoices",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, { label: string; hint: string }> = {
  manage_quotations: { label: "Manage quotations", hint: "Create, edit, send and delete quotations" },
  approve_quotations: { label: "Approve quotations", hint: "Accept or reject quotations" },
  manage_proforma_invoices: {
    label: "Manage proforma invoices",
    hint: "Create, edit and send proforma invoices; convert quotations to PIs",
  },
  approve_proforma_invoices: { label: "Confirm proforma invoices", hint: "Confirm or reject proforma invoices" },
  manage_orders: { label: "Complete orders", hint: "Mark an invoiced order completed once payment is received" },
  approve_orders: { label: "Assign batches", hint: "Assign, change and undo batches on confirmed proforma invoices" },
  manage_invoices: { label: "Manage invoices", hint: "Edit, issue and cancel invoices" },
  manage_products: { label: "Manage products", hint: "Create, edit and delete products" },
  manage_batches: { label: "Manage batches", hint: "Create, edit and delete batches and stock" },
  manage_customers: { label: "Manage customers", hint: "Create, edit and delete customers" },
  manage_suppliers: { label: "Manage suppliers", hint: "Suppliers, and the supplier price comparison" },
  manage_manufacturers: { label: "Manage manufacturers", hint: "Create, edit and delete manufacturers" },
  view_reports: { label: "View reports", hint: "Reports, sales figures and supplier price comparison" },
  manage_bank_details: { label: "Manage bank details", hint: "Create, edit and delete bank accounts" },
  manage_users: { label: "Manage users", hint: "Create users, reset passwords, deactivate" },
  view_audit_log: { label: "View audit log", hint: "See who did what" },
  manage_packing_lists: { label: "Manage packing lists", hint: "Create, edit and delete packing lists" },
};

/** Default role → permission mapping (CLAUDE.md §6). Owner bypasses all checks. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<Role, "owner">, PermissionKey[]> = {
  admin: [...PERMISSION_KEYS],
  manager: [
    "manage_quotations",
    "approve_quotations",
    "manage_proforma_invoices",
    "approve_proforma_invoices",
    "manage_orders",
    "manage_invoices",
    "manage_customers",
    "manage_suppliers",
    "view_reports",
    "manage_packing_lists",
  ],
  office_staff: ["manage_quotations", "manage_proforma_invoices", "manage_customers"],
  warehouse_staff: [
    "approve_orders",
    "manage_products",
    "manage_batches",
    "manage_manufacturers",
    "manage_packing_lists",
  ],
  staff: [],
};

// ---------- Quotation → Proforma Invoice → Commercial Invoice pipeline ----------

/** The business only ships by air — there is no shipping-type choice (printed on every document). */
export const SHIPPING_MODE = "By Air";

/** Totals block labels shared by the QT, PI and invoice pages and PDFs. */
export const TOTAL_LABELS = {
  subTotal: "Sub Total",
  charges: "Air Freight, Handling & Documentation Charges",
} as const;

/** "Total C&F Nairobi By Air" (destination left out while blank). */
export function cnfTotalLabel(destination: string | null | undefined): string {
  return ["Total C&F", destination?.trim(), SHIPPING_MODE].filter(Boolean).join(" ");
}

/** Quotations live in their own table and never touch inventory. */
export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "negotiating",
  "accepted",
  "rejected",
  "expired",
  "converted",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** The `orders` table only holds real business: PIs and CIs. */
export const ORDER_DOCUMENT_TYPES = ["proforma_invoice", "commercial_invoice"] as const;
export type OrderDocumentType = (typeof ORDER_DOCUMENT_TYPES)[number];

export const ORDER_STATUSES = [
  "draft", // PI created, being edited
  "sent", // PI sent to customer
  "negotiating", // customer negotiating price
  "confirmed", // customer confirmed PI
  "batch_assigned", // warehouse assigned batches (stock deducted)
  "invoiced", // commercial invoice created
  "completed", // payment received, deal done
  "cancelled", // cancelled at any stage
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Documents whose versions are snapshotted into `document_revisions`. */
export const REVISION_DOCUMENT_TYPES = ["quotation", "proforma_invoice"] as const;
export type RevisionDocumentType = (typeof REVISION_DOCUMENT_TYPES)[number];

/** Optional document sections. Off by default on quotations, on by default on PIs, always on for CIs. */
export const DOCUMENT_SECTIONS = ["freight", "bank_details", "other_details"] as const;
export type DocumentSection = (typeof DOCUMENT_SECTIONS)[number];
/** Stored on invoices: sections the PI had OFF that the CI is forced to show. */
export type SectionEnforcement = Partial<Record<DocumentSection, boolean>>;



export const INVOICE_STATUSES = ["draft", "issued", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PRICE_TYPES = ["wholesale", "retail"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const ACTION_TYPES = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  LOGIN_FAILED: "LoginFailed",
  PERMISSION_DENIED: "PermissionDenied",
  TOKEN_REFRESHED: "TokenRefreshed",
  USER_CREATED: "UserCreated",
  USER_UPDATED: "UserUpdated",
  USER_DELETED: "UserDeleted",
  USER_ROLE_CHANGED: "UserRoleChanged",
  USER_DEACTIVATED: "UserDeactivated",
  USER_REACTIVATED: "UserReactivated",
  PASSWORD_CHANGED: "PasswordChanged",
  PASSWORD_RESET: "PasswordReset",
  PERMISSIONS_UPDATED: "PermissionsUpdated",
  COMPANY_CREATED: "CompanyCreated",
  COMPANY_UPDATED: "CompanyUpdated",
  // Quotations (own table)
  QUOTATION_CREATED: "QuotationCreated",
  QUOTATION_UPDATED: "QuotationUpdated",
  QUOTATION_DELETED: "QuotationDeleted",
  QUOTATION_SENT: "QuotationSent",
  QUOTATION_ACCEPTED: "QuotationAccepted",
  QUOTATION_REJECTED: "QuotationRejected",
  QUOTATION_CONVERTED: "QuotationConverted", // QT → PI
  // Proforma invoices (orders table)
  PI_CREATED: "ProformaInvoiceCreated",
  PI_UPDATED: "ProformaInvoiceUpdated",
  PI_SENT: "ProformaInvoiceSent",
  PI_CONFIRMED: "ProformaInvoiceConfirmed",
  PI_REJECTED: "ProformaInvoiceRejected",
  PI_DELETED: "ProformaInvoiceDeleted",
  REVISION_CREATED: "RevisionCreated",
  BATCHES_ASSIGNED: "BatchesAssigned",
  BATCHES_UNASSIGNED: "BatchesUnassigned",
  ORDER_CANCELLED: "OrderCancelled",
  ORDER_COMPLETED: "OrderCompleted",
  INVOICE_CREATED: "InvoiceCreated",
  INVOICE_UPDATED: "InvoiceUpdated",
  INVOICE_ISSUED: "InvoiceIssued",
  INVOICE_CANCELLED: "InvoiceCancelled",
  SIGNATURE_UPLOADED: "SignatureUploaded",
  PACKING_LIST_CREATED: "PackingListCreated",
  PACKING_LIST_UPDATED: "PackingListUpdated",
  PACKING_LIST_DELETED: "PackingListDeleted",
  SIGNATURE_DELETED: "SignatureDeleted",
  PRODUCT_CREATED: "ProductCreated",
  PRODUCT_UPDATED: "ProductUpdated",
  PRODUCT_DELETED: "ProductDeleted",
  BATCH_CREATED: "BatchCreated",
  BATCH_UPDATED: "BatchUpdated",
  BATCH_DELETED: "BatchDeleted",
  STOCK_UPDATED: "StockUpdated",
  CUSTOMER_CREATED: "CustomerCreated",
  CUSTOMER_UPDATED: "CustomerUpdated",
  CUSTOMER_DELETED: "CustomerDeleted",
  SUPPLIER_CREATED: "SupplierCreated",
  SUPPLIER_UPDATED: "SupplierUpdated",
  SUPPLIER_DELETED: "SupplierDeleted",
  MANUFACTURER_CREATED: "ManufacturerCreated",
  MANUFACTURER_UPDATED: "ManufacturerUpdated",
  MANUFACTURER_DELETED: "ManufacturerDeleted",
  BANK_DETAIL_CREATED: "BankDetailCreated",
  BANK_DETAIL_UPDATED: "BankDetailUpdated",
  BANK_DETAIL_DELETED: "BankDetailDeleted",
  REPORT_GENERATED: "ReportGenerated",
  REPORT_EXPORTED: "ReportExported",
} as const;
export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];

/** Cookie + header names shared by middleware, API routes and the client. */
export const ACCESS_COOKIE = "ma_access";
export const REFRESH_COOKIE = "ma_refresh";
export const COMPANY_COOKIE = "ma_company";
export const COMPANY_HEADER = "x-company-id";

export const BUSINESS_TIMEZONE = "Asia/Colombo";
export const NEAR_EXPIRY_MONTHS = 6;

export const PAGINATION = { defaultPage: 1, defaultPageSize: 20, maxPageSize: 200 } as const;
