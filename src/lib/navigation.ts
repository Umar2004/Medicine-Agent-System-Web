// Sidebar navigation. Each item is also a row in `dashboard_modules`;
// `role_permissions` decides which roles see it (owner sees everything).
import type { Role } from "@/lib/constants";

export interface NavItem {
  title: string;
  route: string;
  icon: string; // Lucide icon name, resolved in Sidebar.tsx
  /** Visible to every role regardless of role_permissions. */
  isDefault?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", route: "/dashboard", icon: "LayoutDashboard", isDefault: true }],
  },
  {
    label: "Inventory",
    items: [
      { title: "Products", route: "/products", icon: "Pill" },
      { title: "Batches", route: "/batches", icon: "Boxes" },
      { title: "Manufacturers", route: "/manufacturers", icon: "Factory" },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Quotations", route: "/quotations", icon: "FileText" },
      { title: "Orders", route: "/orders", icon: "ClipboardList" }, // proforma + commercial invoices
      { title: "Invoices", route: "/invoices", icon: "Receipt" },
      { title: "Packing", route: "/packing", icon: "Package" },
    ],
  },
  {
    label: "Contacts",
    items: [
      { title: "Customers", route: "/customers", icon: "Users" },
      { title: "Suppliers", route: "/suppliers", icon: "Truck" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Bank Accounts", route: "/bank-accounts", icon: "Landmark" },
      { title: "Supplier Prices", route: "/supplier-prices", icon: "TrendingUp" },
    ],
  },
  {
    label: "Reports",
    items: [{ title: "Reports", route: "/reports", icon: "BarChart3" }],
  },
  {
    label: "Admin",
    items: [
      { title: "Users", route: "/users", icon: "UserCog" },
      { title: "Roles", route: "/roles", icon: "ShieldCheck" },
      { title: "Audit Log", route: "/audit-log", icon: "ScrollText" },
      { title: "Companies", route: "/companies", icon: "Building2" },
      { title: "Settings", route: "/settings", icon: "Settings", isDefault: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Routes only the owner may ever see (CLAUDE.md §6: companies & roles = owner only). */
export const OWNER_ONLY_ROUTES = ["/companies", "/roles"];

/** Default sidebar visibility per role (seeded into role_permissions). */
export const DEFAULT_ROLE_MODULES: Record<Exclude<Role, "owner">, string[]> = {
  admin: NAV_ITEMS.map((i) => i.route).filter((r) => !OWNER_ONLY_ROUTES.includes(r)),
  manager: [
    "/products",
    "/batches",
    "/manufacturers",
    "/quotations",
    "/orders",
    "/invoices",
    "/packing",
    "/customers",
    "/suppliers",
    "/bank-accounts",
    "/supplier-prices",
    "/reports",
  ],
  office_staff: ["/products", "/batches", "/quotations", "/orders", "/invoices", "/customers"],
  // Batch assignment now lives on the PI (/orders), so warehouse staff no longer need /quotations.
  warehouse_staff: ["/products", "/batches", "/manufacturers", "/orders", "/invoices", "/packing"],
  staff: ["/products", "/batches", "/quotations", "/customers"],
};
