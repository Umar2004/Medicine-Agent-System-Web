import type {
  OrderDocumentType,
  PermissionKey,
  DocumentSection,
  QuotationStatus,
  Role,
  OrderStatus,
  SectionEnforcement,
} from "@/lib/constants";

export type { DocumentSection, OrderDocumentType, OrderStatus, QuotationStatus, SectionEnforcement };

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  fullName: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface SessionInfo {
  user: SessionUser;
  profile: { email: string | null; phone: string | null; lastLoginAt: string | null };
  companies: CompanySummary[];
  permissions: PermissionKey[];
  routes: string[];
}

export interface ManagedUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: "active" | "inactive";
  lastLoginAt: string | null;
  createdAt: string;
  companies: CompanySummary[];
}

export interface CompanyDetail {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  currency: string;
  hasLogo: boolean;
  logoPreviewUrl: string | null;
  createdAt: string;
  userCount: number;
  customerCount: number;
  orderCount: number;
}

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  username: string | null;
  companyName: string | null;
  actionType: string;
  entityName: string | null;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  page: string | null;
}

export interface PermissionMatrix {
  modules: { id: string; title: string; route: string; isDefault: boolean; ownerOnly: boolean }[];
  roles: { role: Exclude<Role, "owner">; permissions: PermissionKey[]; routes: string[] }[];
}

export interface SupplierPriceSummary {
  productId: string;
  productNumber: string;
  brandName: string;
  genericName: string | null;
  unit: string | null;
  manufacturerName: string | null;
  supplierCount: number;
  bestWholesale: number | null;
  bestRetail: number | null;
  bestOther: number | null;
  lastRecordedAt: string;
}

export interface SupplierPriceComparison {
  supplierId: string;
  supplierName: string;
  companyName: string;
  priceType: string | null;
  priceLkr: number;
  previousPriceLkr: number | null;
  recordedAt: string;
  records: number;
  isBest: boolean;
}

export interface SupplierPriceRecord {
  id: string;
  priceLkr: number | null;
  priceType: string | null;
  recordedAt: string;
  notes: string | null;
  supplierName: string;
  supplierDeleted: boolean;
  companyName: string;
}

export interface Product {
  id: string;
  productNumber: string;
  brandName: string;
  genericName: string | null;
  manufacturerId: string | null;
  manufacturerName: string | null;
  unit: string | null;
  country: string | null;
  lowStockThreshold: number;
  totalStock: number;
  batchCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Enough of a product to show it on a quotation line. */
export type ProductOption = Pick<Product, "id" | "productNumber" | "brandName" | "genericName" | "manufacturerName" | "unit">;

export interface ManufacturerOption {
  id: string;
  manufacturerNumber: string;
  name: string;
  country: string | null;
}

export interface Manufacturer extends ManufacturerOption {
  contactInfo: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type BatchStatus = "active" | "near_expiry" | "expired" | "inactive" | "out_of_stock";

export interface Batch {
  id: string;
  batchNumber: string;
  productId: string;
  productNumber: string;
  productName: string;
  productUnit: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierCompanyName: string | null;
  mfd: string | null;
  exp: string | null;
  stockQuantity: number;
  costPrice: number | null;
  priceType: "wholesale" | "retail" | null;
  isActive: boolean;
  status: BatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDetail extends Batch {
  usage: { orders: number; invoices: number };
}

export interface SupplierOption {
  id: string;
  supplierNumber: string;
  name: string;
  companyId: string;
  companyName: string;
}

export interface Customer {
  id: string;
  companyId: string;
  companyName: string;
  customerNumber: string;
  code: string;
  name: string;
  businessName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimilarCustomer {
  id: string;
  customerNumber: string;
  name: string;
  businessName: string | null;
}

export interface CustomerSaveResult extends Customer {
  similar: SimilarCustomer[];
}

export interface Supplier {
  id: string;
  companyId: string;
  companyName: string;
  supplierNumber: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  contactNumber: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  id: string;
  companyId: string;
  companyName: string;
  bankName: string;
  accountNumber: string;
  swiftCode: string | null;
  branchName: string | null;
  otherDetails: string | null;
  createdAt: string;
}

export type InvoiceStatus = "draft" | "issued" | "cancelled";

export interface OrderListItem {
  id: string;
  companyId: string;
  companyName: string;
  orderNumber: string;
  documentType: OrderDocumentType;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerCode: string;
  itemCount: number;
  itemsTotal: number;
  totalCnf: number;
  showFreight: boolean;
  showBankDetails: boolean;
  showOtherDetails: boolean;
  convertedFromQuotationId: string | null;
  revisionNumber: number;
  rejectionReason: string | null;
  /** Last time the PI was marked as sent. */
  sentAt: string | null;
  createdAt: string;
}

export interface BankSummary {
  id: string;
  bankName: string;
  accountNumber: string;
  swiftCode: string | null;
  branchName: string | null;
  otherDetails: string | null;
}

export interface OrderItemDetail {
  id: string;
  productId: string;
  productNumber: string;
  brandName: string;
  genericName: string | null;
  manufacturerName: string | null;
  country: string | null;
  mfd: string | null;
  exp: string | null;
  quantity: number;
  unit: string | null;
  sellingPriceUsd: number;
  totalUsd: number;
  batchId: string | null;
  batchNumber: string | null;
  batchMfd: string | null;
  batchExp: string | null;
  sortOrder: number;
}

export interface DocumentCustomer {
  id: string;
  customerNumber: string;
  code: string;
  name: string;
  businessName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

export interface OrderInvoiceRef {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  createdAt: string;
  packingListId: string | null;
}

export interface OrderDetail {
  id: string;
  companyId: string;
  companyName: string;
  orderNumber: string;
  documentType: OrderDocumentType;
  status: OrderStatus;
  customer: DocumentCustomer;
  showFreight: boolean;
  showBankDetails: boolean;
  showOtherDetails: boolean;
  revisionNumber: number;
  convertedFromQuotationId: string | null;
  sourceQuotation: { id: string; quotationNumber: string } | null;
  airFreight: number;
  handlingDocumentation: number;
  totalCnf: number;
  cnfDestination: string | null;
  shippingType: string | null;
  marks: string | null;
  paymentTerms: string | null;
  notes: string | null;
  showMfd: boolean;
  showExp: boolean;
  showGenericName: boolean;
  bankDetailId: string | null;
  bank: BankSummary | null;
  // Optional PI parties & signature (carried to CI at finalize)
  consigneeName: string | null;
  consigneeAddress: string | null;
  consigneeCountry: string | null;
  consigneePhone: string | null;
  consigneeEmail: string | null;
  notifyName: string | null;
  notifyAddress: string | null;
  notifyCountry: string | null;
  notifyPhone: string | null;
  notifyContactPerson: string | null;
  orderingName: string | null;
  orderingAddress: string | null;
  orderingCountry: string | null;
  orderingPhone: string | null;
  signatureId: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  rejectedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  sentAt: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDetail[];
  invoices: OrderInvoiceRef[];
  activeInvoice: OrderInvoiceRef | null;
}

// ---------------------------------------------------------------- quotations (own table)

export interface QuotationListItem {
  id: string;
  quotationNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  companyId: string;
  companyName: string; // shown in the owner's cross-company view
  status: QuotationStatus;
  showFreight: boolean;
  showBankDetails: boolean;
  showOtherDetails: boolean;
  totalCnf: number;
  revisionNumber: number;
  rejectionReason: string | null;
  convertedToOrderId: string | null;
  /** Last time it was marked as sent. */
  sentAt: string | null;
  lineCount: number;
  itemsTotal: number;
  createdAt: string;
  createdByName: string | null;
}

/** A quotation line — never has a batch (quotations don't touch inventory). */
export interface QuotationItem {
  id: string;
  productId: string;
  productNumber: string;
  brandName: string;
  genericName: string | null;
  manufacturerName: string | null;
  country: string | null;
  mfd: string | null;
  exp: string | null;
  quantity: number;
  unit: string | null;
  sellingPriceUsd: number;
  totalUsd: number;
  sortOrder: number;
}

export interface QuotationDetail extends QuotationListItem {
  customer: DocumentCustomer;
  airFreight: number;
  handlingDocumentation: number;
  cnfDestination: string | null;
  shippingType: string | null;
  marks: string | null;
  paymentTerms: string | null;
  notes: string | null;
  showMfd: boolean;
  showExp: boolean;
  showGenericName: boolean;
  bankDetailId: string | null;
  bank: BankSummary | null;
  rejectedAt: string | null;
  rejectedByName: string | null;
  convertedToOrder: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    activeInvoiceId: string | null;
    activeInvoiceStatus: InvoiceStatus | null;
    packingListId: string | null;
  } | null;
  convertedAt: string | null;
  updatedAt: string;
  items: QuotationItem[];
}

/** Last price quoted to a customer for a product, from a quotation or a PI/order. */
export interface LastQuotedPrice {
  price: number;
  documentNumber: string;
  source: "quotation" | "order";
  date: string;
}

export interface RevisionSummary {
  id: string;
  revisionNumber: number;
  changeSummary: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface LowStockWarning {
  productId: string;
  brandName: string;
  threshold: number;
  totalStock: number;
}

export interface ValidBatches {
  product: { id: string; brandName: string; lowStockThreshold: number; totalStock: number };
  batches: Batch[];
}

export interface InvoiceListItem {
  id: string;
  companyId: string;
  companyName: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  consigneeName: string | null;
  totalAmountUsd: number;
  createdAt: string;
}

export interface InvoiceItemDetail {
  id: string;
  productId: string;
  productNumber: string;
  brandName: string;
  genericName: string | null;
  manufacturerName: string | null;
  country: string | null;
  batchId: string | null;
  batchNumber: string | null;
  mfd: string | null;
  exp: string | null;
  quantity: number;
  unit: string | null;
  supplierPriceLkr: number | null;
  sellingPriceUsd: number;
  lineTotal: number;
}

export interface Signature {
  id: string;
  label: string;
  url: string | null;
  createdAt: string;
}

export interface InvoiceDetail {
  id: string;
  companyId: string;
  companyName: string;
  invoiceNumber: string;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: OrderStatus | null;
  orderDocumentType: OrderDocumentType | null;
  sourceQuotationId: string | null;
  packingListId: string | null;
  /** Sections the source PI had OFF that this CI must complete. */
  sectionEnforcement: SectionEnforcement | null;
  /** Enforced sections still incomplete — issuing is blocked until this is empty. */
  missingEnforcedSections: { section: DocumentSection; field: string; label: string }[];
  status: InvoiceStatus;
  airFreight: number;
  handlingDocumentation: number;
  totalCnf: number;
  totalAmountUsd: number;
  amountInWords: string | null;
  cnfDestination: string | null;
  shippingType: string | null;
  marks: string | null;
  paymentTerms: string | null;
  notes: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  consigneeCountry: string | null;
  consigneePhone: string | null;
  consigneeEmail: string | null;
  notifyName: string | null;
  notifyAddress: string | null;
  notifyCountry: string | null;
  notifyPhone: string | null;
  notifyContactPerson: string | null;
  orderingName: string | null;
  orderingAddress: string | null;
  orderingCountry: string | null;
  orderingPhone: string | null;
  bankDetailId: string | null;
  signatureId: string | null;
  customer: { id: string; code: string; name: string; businessName: string | null } | null;
  bank: BankSummary | null;
  signature: { id: string; label: string; userId: string; url: string | null } | null;
  items: InvoiceItemDetail[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PackingListSummary {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: InvoiceStatus;
  companyName: string;
  customerName: string | null;
  shipmentReference: string | null;
  totalCartons: string | null;
  date: string | null;
  lineCount: number;
  createdAt: string;
}

export interface PackingListDetail {
  id: string;
  invoiceId: string;
  companyId: string;
  invoiceNumber: string;
  invoiceStatus: InvoiceStatus;
  shipmentReference: string | null;
  totalCartons: string | null;
  containerInfo: string | null;
  grossWeightKg: number | null;
  netWeightKg: number | null;
  cbm: number | null;
  marks: string | null;
  date: string | null;
  createdAt: string;
  updatedAt: string;
  items: { id: string; cartonStart: number | null; cartonEnd: number | null; description: string | null; packingDetails: string | null }[];
}
