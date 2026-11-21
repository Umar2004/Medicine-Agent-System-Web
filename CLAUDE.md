# CLAUDE.md — Medicine Agent System (Next.js Rebuild)

> **Project:** Medicine Agent System — Web Rebuild  
> **Brand:** Vexora Labs  
> **Version:** 3.0 (based on corrected owner specification)  
> **Last Updated:** November 2026

---

## 1. PROJECT OVERVIEW

Medicine Agent is a **pharmaceutical export/trading management system** for companies that:
- Source medicines from suppliers (pay in **LKR** — Sri Lankan Rupees)
- Store them in a **single shared warehouse** (batch-level tracking)
- Sell to international customers, primarily in East Africa/Kenya (price in **USD**)
- Generate Quotations, Proforma Invoices and Commercial Invoices for C&F export (QT → PI → CI, §7.2)

This is a full rebuild of the existing .NET 8 (ASP.NET Core API + WPF Desktop) system into a modern Next.js 15 web application.

---

## 2. TECH STACK

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 15 (App Router) | TypeScript, Server Components, API Routes |
| **Language** | TypeScript (strict mode) | No `any` types |
| **Database** | PostgreSQL via Supabase | Fresh database for dev (migrate data later) |
| **ORM** | Drizzle ORM | Type-safe queries, snake_case columns |
| **Auth** | JWT (access + refresh tokens) | BCrypt password hashing, refresh token rotation |
| **UI Framework** | Tailwind CSS v4 + shadcn/ui | Radix primitives underneath |
| **Tables** | TanStack Table v8 | Server-side pagination, sorting, filtering |
| **Data Fetching** | TanStack Query v5 | Caching, optimistic updates |
| **Charts** | ECharts (via echarts-for-react) | Dashboard analytics |
| **PDF Generation** | Puppeteer (server-side) | HTML-to-PDF rendering |
| **File Storage** | Supabase Storage | Company logos, e-signatures |
| **Forms** | React Hook Form + Zod | Schema-based validation |
| **Icons** | Lucide React | Consistent icon set |
| **Date Handling** | date-fns | MM/YYYY formatting |
| **Alerts** | SweetAlert2 | Confirmations, success/error/warning popups |
| **Toasts** | Sonner | Quick background notifications (auto-dismiss) |
| **State** | Zustand | Client-side stores |
| **Excel Export** | ExcelJS | Report/data exports |
| **Hosting** | AWS EC2 + Docker | Puppeteer works natively, no cold-start |

### Security

- httpOnly cookies for JWT tokens (not localStorage)
- Login rate-limiting: 5 attempts per 15 minutes per username
- One-time owner setup route disabled after first owner exists
- Log `PERMISSION_DENIED` events in audit trail

---

## 3. PROJECT STRUCTURE

```
medicine-agent/
├── CLAUDE.md
├── next.config.ts
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.local                         # Never commit
├── .env.example
│
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout (fonts, providers)
│   │   ├── page.tsx                   # Redirect to /login or /dashboard
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx             # Centered layout, no sidebar
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             # Sidebar + topbar + company selector
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── products/
│   │   │   │   ├── page.tsx           # Product list
│   │   │   │   └── [id]/page.tsx      # Product detail/edit
│   │   │   ├── batches/
│   │   │   ├── customers/
│   │   │   ├── suppliers/
│   │   │   ├── manufacturers/
│   │   │   ├── quotations/            # QT
│   │   │   │   ├── page.tsx           # Quotation list/history
│   │   │   │   ├── new/page.tsx       # Quotation wizard
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx       # View quotation (send / accept / convert to PI)
│   │   │   │       └── edit/page.tsx  # Edit / revise quotation
│   │   │   ├── orders/                # PI (and the CI it becomes)
│   │   │   │   ├── page.tsx           # Orders list (PIs + CIs)
│   │   │   │   ├── new/page.tsx       # PI wizard (direct, no quotation)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx       # View PI (send / confirm / batches / create CI)
│   │   │   │       ├── edit/page.tsx  # Edit / revise PI
│   │   │   │       └── assign-batches/page.tsx
│   │   │   ├── invoices/              # CI
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── [id]/packing/page.tsx
│   │   │   ├── supplier-prices/          # Supplier price comparison
│   │   │   ├── bank-accounts/
│   │   │   ├── reports/
│   │   │   ├── audit-log/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── companies/
│   │   │   └── settings/
│   │   │
│   │   └── api/                       # Route Handlers
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── refresh/route.ts
│   │       │   ├── logout/route.ts
│   │       │   └── register-owner/route.ts
│   │       ├── users/route.ts
│   │       ├── companies/route.ts
│   │       ├── products/route.ts
│   │       ├── batches/route.ts
│   │       ├── customers/route.ts
│   │       ├── suppliers/route.ts
│   │       ├── manufacturers/route.ts
│   │       ├── quotations/route.ts        # QT (+ [id]/send|accept|reject|convert|pdf)
│   │       ├── orders/route.ts            # PI/CI (+ [id]/send|confirm|assign-batches|undo-batches|finalize|complete|cancel|pdf)
│   │       ├── revisions/route.ts
│   │       ├── invoices/route.ts
│   │       ├── bank-details/route.ts
│   │       ├── dashboard/route.ts
│   │       ├── reports/route.ts
│   │       ├── audit-log/route.ts
│   │       ├── supplier-price-history/route.ts
│   │       ├── permissions/route.ts
│   │       ├── signatures/route.ts
│   │       └── packing-lists/route.ts
│   │       # PDFs are served by each document's own …/[id]/pdf route
│   │
│   ├── components/
│   │   ├── ui/                        # shadcn/ui (kebab-case, as generated)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── CompanySelector.tsx
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── modals/
│   │   ├── pdf/                       # PDF template components
│   │   │   ├── ProformaInvoice.tsx    # shared PriceDocument (PI) …
│   │   │   ├── QuotationPdf.tsx       # … and its quotation variant
│   │   │   ├── CommercialInvoice.tsx
│   │   │   └── PackingList.tsx
│   │   └── shared/
│   │       ├── DataTable.tsx
│   │       ├── PageHeader.tsx
│   │       ├── SearchInput.tsx
│   │       ├── StatusBadge.tsx
│   │       └── ConfirmDialog.tsx
│   │
│   ├── db/
│   │   ├── index.ts                   # Drizzle client
│   │   ├── schema/
│   │   │   ├── users.ts
│   │   │   ├── companies.ts
│   │   │   ├── products.ts
│   │   │   ├── batches.ts
│   │   │   ├── customers.ts
│   │   │   ├── suppliers.ts
│   │   │   ├── manufacturers.ts
│   │   │   ├── orders.ts
│   │   │   ├── invoices.ts
│   │   │   ├── packing-lists.ts
│   │   │   ├── bank-details.ts
│   │   │   ├── audit-logs.ts
│   │   │   ├── permissions.ts
│   │   │   └── index.ts
│   │   └── migrations/
│   │
│   ├── lib/
│   │   ├── auth.ts                    # JWT issue/verify, BCrypt, middleware
│   │   ├── refresh-tokens.ts          # Refresh token rotation
│   │   ├── permissions.ts             # Permission checking
│   │   ├── company-context.ts         # Company ID resolution
│   │   ├── audit.ts                   # Audit logging (fire-and-forget)
│   │   ├── number-generator.ts        # PROD-0000001 etc.
│   │   ├── pdf.ts                     # Puppeteer PDF generation
│   │   ├── supabase-storage.ts        # File upload/download
│   │   ├── utils.ts
│   │   ├── constants.ts               # Action types, roles, statuses
│   │   └── validations/               # Zod schemas
│   │       ├── auth.ts
│   │       ├── products.ts
│   │       ├── batches.ts
│   │       ├── customers.ts
│   │       ├── orders.ts
│   │       ├── invoices.ts
│   │       └── index.ts
│   │
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-company.ts
│   │   ├── use-permissions.ts
│   │   └── use-debounce.ts
│   │
│   ├── stores/
│   │   ├── auth-store.ts
│   │   └── company-store.ts
│   │
│   ├── types/
│   │   ├── api.ts
│   │   ├── entities.ts
│   │   └── index.ts
│   │
│   └── styles/
│       └── globals.css
│
├── public/
│   ├── logo.svg
│   └── favicon.ico
│
└── scripts/
    ├── seed.ts
    └── migrate.ts
```

---

## 4. DESIGN SYSTEM

### Brand: Vexora Labs

| Token | Value | Usage |
|-------|-------|-------|
| **Primary** | `#0F766E` (Deep Teal) | Buttons, links, active states |
| **Primary Hover** | `#0D6D64` | Hover states |
| **Primary Light** | `#CCFBF1` | Badges, light backgrounds |
| **Sidebar BG** | `#0F172A` (Dark Slate) | Sidebar background |
| **Sidebar Hover** | `#1E293B` | Sidebar item hover |
| **Sidebar Active** | `#0F766E` on dark | Active sidebar item |
| **Background** | `#F8FAFC` | Page background |
| **Card BG** | `#FFFFFF` | Card/panel background |
| **Border** | `#E2E8F0` | Borders, dividers |
| **Text Primary** | `#0F172A` | Headings, body text |
| **Text Secondary** | `#64748B` | Labels, descriptions |
| **Text Muted** | `#94A3B8` | Placeholders, hints |
| **Success** | `#10B981` | Approved, in-stock |
| **Warning** | `#F59E0B` | Near-expiry, pending |
| **Danger** | `#EF4444` | Expired, errors, cancel |
| **Info** | `#3B82F6` | Information badges |

**Dark theme (Obsidian + Teal):** `next-themes` toggles `.dark` on `<html>` (Topbar sun/moon). All colours are tokens in `src/styles/globals.css` (`:root` / `.dark`) — never hard-code Tailwind palette colours in components. Status text uses `text-success-text` / `text-warning-text` / `text-info-text` / `text-violet-text`; logo and signature previews use `bg-paper` (white in both themes); chart colours live in `EChart.tsx` per theme.

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Headings | Inter | 600–700 | 24–32px |
| Body | Inter | 400 | 14–16px |
| Labels | Inter | 500 | 12–14px |
| Code/Numbers | IBM Plex Mono | 400 | 13–14px |
| Table Data | Inter | 400 | 13–14px |

### Layout

- **Sidebar:** 260px wide, collapsible to 64px icons, dark `#0F172A`
- **Topbar:** 64px height, company selector + user avatar/menu
- **Content:** Max-width 1400px centered, 24px padding
- **Cards:** White bg, 1px border, 8px radius, subtle shadow
- **Tables:** Full-width in cards, alternating row hover, sticky header
- **Forms:** Single-column default, two-column for related fields
- **Modals:** shadcn Sheet for create/edit, Dialog for confirmations

---

## 5. DATABASE SCHEMA

### Multi-Tenancy Model

```
SHARED (No company_id — one physical warehouse):
  ├── products
  ├── product_batches
  └── manufacturers

COMPANY-SCOPED (Has company_id — filtered in ALL queries):
  ├── customers
  ├── suppliers
  ├── quotations + quotation_items          (QT — never touch inventory)
  ├── orders + order_items                  (PI and CI — see document_type)
  ├── document_revisions                    (QT/PI version history; scoped via the parent document)
  ├── invoices + invoice_items + invoice_files
  ├── company_bank_details
  ├── supplier_price_history
  └── packing_lists + packing_list_items
```

### Tables

```sql
-- ===================== USERS & AUTH =====================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username          TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  role              TEXT NOT NULL DEFAULT 'staff',
    -- 'owner','admin','manager','office_staff','warehouse_staff','staff'
  status            TEXT NOT NULL DEFAULT 'active',  -- 'active','inactive'
  last_login_at     TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,                  -- access tokens issued before this are rejected
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  is_deleted        BOOLEAN DEFAULT FALSE
);

CREATE TABLE refresh_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  token_hash        TEXT NOT NULL,        -- SHA-256 of plaintext
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  replaced_by_id    UUID REFERENCES refresh_tokens(id),
  user_agent        TEXT,
  ip_address        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_company_access (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  company_id        UUID NOT NULL REFERENCES companies(id),
  is_default        BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, company_id)
);

CREATE TABLE role_function_permissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role              TEXT NOT NULL,              -- one of the 6 roles
  permission_key    TEXT NOT NULL,              -- e.g. 'manage_quotations'
  UNIQUE(role, permission_key)
);

-- ===================== COMPANIES =====================

CREATE TABLE companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  address           TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  tax_id            TEXT,
  currency          TEXT DEFAULT 'USD',
  logo_url          TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  is_deleted        BOOLEAN DEFAULT FALSE
);

CREATE TABLE company_bank_details (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  bank_name         TEXT NOT NULL,
  account_number    TEXT NOT NULL,
  swift_code        TEXT,
  branch_name       TEXT,
  other_details     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
  -- HARD DELETE only (not soft-delete)
);

CREATE TABLE signatures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  label             TEXT NOT NULL,             -- e.g. 'Director', 'Manager'
  image_url         TEXT NOT NULL,             -- Supabase storage URL
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  is_deleted        BOOLEAN DEFAULT FALSE
);

-- ===================== SHARED ENTITIES =====================

CREATE TABLE manufacturers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_number   TEXT NOT NULL UNIQUE,  -- MFG-00000001
  name                  TEXT NOT NULL,
  country               TEXT,
  contact_info          TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE
);

CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_number        TEXT NOT NULL UNIQUE,   -- PROD-0000001
  brand_name            TEXT NOT NULL,
  generic_name          TEXT,
  manufacturer_id       UUID REFERENCES manufacturers(id),
  unit                  TEXT,                   -- '28''s', '100''s', etc.
  country               TEXT,                   -- Country of origin
  low_stock_threshold   INTEGER DEFAULT 100,    -- Configurable PER product
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE
  -- NO company_id
);

CREATE TABLE product_batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number          TEXT NOT NULL,
  product_id            UUID NOT NULL REFERENCES products(id),
  supplier_id           UUID REFERENCES suppliers(id),
  mfd                   TEXT,                   -- MM/YYYY (e.g. "09/2025")
  exp                   TEXT,                   -- MM/YYYY (e.g. "08/2028")
  stock_quantity        INTEGER NOT NULL CHECK(stock_quantity >= 0),
  cost_price            DECIMAL(18,2),          -- LKR — what the company PAID
  price_type            TEXT,                   -- 'wholesale' or 'retail'
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE,
  UNIQUE(product_id, batch_number)
  -- NO company_id, NO selling_price
);

-- ===================== COMPANY-SCOPED ENTITIES =====================

CREATE TABLE customers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  customer_number       TEXT NOT NULL,           -- CUSTOMER-0000001
  code                  TEXT NOT NULL,            -- short code for invoice numbers, e.g. 'SFL', 'APP'
  name                  TEXT NOT NULL,
  business_name         TEXT,
  contact_person        TEXT,
  phone                 TEXT,
  email                 TEXT,
  address               TEXT,
  city                  TEXT,
  country               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE,
  UNIQUE(company_id, customer_number),
  UNIQUE(company_id, code)
);

CREATE TABLE suppliers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  supplier_number       TEXT NOT NULL,           -- SUPP-0000001
  name                  TEXT NOT NULL,
  contact_person        TEXT,
  phone                 TEXT,
  contact_number        TEXT,
  email                 TEXT,
  address               TEXT,
  city                  TEXT,
  country               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE,
  UNIQUE(company_id, supplier_number)
);

CREATE TABLE supplier_price_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           UUID NOT NULL REFERENCES suppliers(id),
  product_id            UUID NOT NULL REFERENCES products(id),
  company_id            UUID NOT NULL REFERENCES companies(id),
  price_lkr             DECIMAL(18,2),
  price_type            TEXT,
  recorded_at           TIMESTAMPTZ DEFAULT NOW(),
  notes                 TEXT
);

-- ===================== QUOTATIONS (QT) =====================
-- Exploratory price offers. Own table so they never inflate order/revenue metrics and never touch stock.

CREATE TABLE quotations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  quotation_number      TEXT NOT NULL,            -- QT-{customerCode}-{D4}, e.g. QT-SFL-0001 (legacy rows keep QUOT-0000001)
  customer_id           UUID NOT NULL REFERENCES customers(id),
  status                TEXT NOT NULL DEFAULT 'draft',
    -- 'draft','sent','negotiating','accepted','rejected','expired','converted'
  show_freight          BOOLEAN DEFAULT FALSE,    -- optional sections: OFF by default on quotations
  show_bank_details     BOOLEAN DEFAULT FALSE,
  show_other_details    BOOLEAN DEFAULT FALSE,
  air_freight           DECIMAL(18,2) DEFAULT 0,
  handling_documentation DECIMAL(18,2) DEFAULT 0,
  total_cnf             DECIMAL(18,2) DEFAULT 0,  -- freight counts only when show_freight
  cnf_destination       TEXT,
  shipping_type         TEXT,                     -- always 'By Air' (no UI choice; SHIPPING_MODE)
  show_mfd              BOOLEAN DEFAULT TRUE,
  show_exp              BOOLEAN DEFAULT TRUE,
  show_generic_name     BOOLEAN DEFAULT TRUE,
  marks                 TEXT,
  payment_terms         TEXT,
  notes                 TEXT,
  bank_detail_id        UUID REFERENCES company_bank_details(id) ON DELETE SET NULL,
  rejection_reason      TEXT,                     -- reason given on reject (older rows may hold "changes requested" text)
  rejected_by           UUID REFERENCES users(id),
  rejected_at           TIMESTAMPTZ,
  revision_number       INTEGER DEFAULT 1,
  sent_at               TIMESTAMPTZ,              -- last "Mark as sent"
  converted_to_order_id UUID REFERENCES orders(id), -- set on QT → PI
  converted_at          TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE,
  UNIQUE(company_id, quotation_number)
);

CREATE TABLE quotation_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id          UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id),
  mfd                   TEXT,              -- MM/YYYY, indicative only
  exp                   TEXT,              -- MM/YYYY, indicative only
  quantity              INTEGER NOT NULL,
  unit                  TEXT,
  selling_price_usd     DECIMAL(18,2),
  total_usd             DECIMAL(18,2),
  sort_order            INTEGER DEFAULT 0
  -- NO batch_id: quotations never touch inventory
);

-- ===================== ORDERS: PROFORMA (PI) & COMMERCIAL (CI) =====================
-- One row per deal. Starts as a PI; finalizing turns it into a CI (document_type) and creates an invoice record.

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  order_number          TEXT NOT NULL,            -- PI-{customerCode}-{D4}, e.g. PI-SFL-0001 (legacy rows keep QUOT-0000001)
  document_type         TEXT NOT NULL DEFAULT 'proforma_invoice',
    -- 'proforma_invoice' | 'commercial_invoice' (set at finalize; back to proforma_invoice if the CI is cancelled)
  status                TEXT NOT NULL DEFAULT 'draft',
    -- PI: 'draft','sent','negotiating','confirmed','batch_assigned'
    -- CI: 'invoiced','completed'      any stage: 'cancelled'
  customer_id           UUID NOT NULL REFERENCES customers(id),
  air_freight           DECIMAL(18,2) DEFAULT 0,
  handling_documentation DECIMAL(18,2) DEFAULT 0,
  total_cnf             DECIMAL(18,2) DEFAULT 0,
  cnf_destination       TEXT,
  show_mfd              BOOLEAN DEFAULT TRUE,
  show_exp              BOOLEAN DEFAULT TRUE,
  show_generic_name     BOOLEAN DEFAULT TRUE,
  show_freight          BOOLEAN DEFAULT TRUE,     -- optional sections: ON by default on PIs;
  show_bank_details     BOOLEAN DEFAULT TRUE,     -- any left OFF must be completed on the CI (section enforcement)
  show_other_details    BOOLEAN DEFAULT TRUE,
  shipping_type         TEXT,                     -- always 'By Air' (no UI choice; SHIPPING_MODE)
  marks                 TEXT,
  payment_terms         TEXT,
  notes                 TEXT,
  bank_detail_id        UUID REFERENCES company_bank_details(id) ON DELETE SET NULL,
  rejection_reason      TEXT,                     -- legacy "changes requested" text (feature removed; no longer written)
  rejected_by           UUID REFERENCES users(id),
  rejected_at           TIMESTAMPTZ,
  revision_number       INTEGER DEFAULT 1,
  sent_at               TIMESTAMPTZ,              -- last "Mark as sent" of the PI
  converted_from_quotation_id UUID REFERENCES quotations(id),  -- NULL when the PI was created directly
  created_by            UUID REFERENCES users(id),
  approved_by           UUID REFERENCES users(id),  -- who recorded the customer's confirmation
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE,
  UNIQUE(company_id, order_number)
);

CREATE TABLE order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id),
  mfd                   TEXT,              -- MM/YYYY manually entered
  exp                   TEXT,              -- MM/YYYY manually entered
  quantity              INTEGER NOT NULL,
  unit                  TEXT,
  selling_price_usd     DECIMAL(18,2),     -- Per-customer price USD
  total_usd             DECIMAL(18,2),     -- qty × price
  batch_id              UUID REFERENCES product_batches(id),  -- NULL until batches are assigned
  sort_order            INTEGER DEFAULT 0  -- a line split across batches keeps one sort_order
);

-- ===================== REVISIONS =====================

CREATE TABLE document_revisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type         TEXT NOT NULL,     -- 'quotation' | 'proforma_invoice'
  document_id           UUID NOT NULL,     -- quotations.id or orders.id (polymorphic, no FK)
  revision_number       INTEGER NOT NULL,
  snapshot              JSONB NOT NULL,    -- document + items at that revision
  change_summary        TEXT,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_type, document_id, revision_number)
);

-- ===================== INVOICES =====================

CREATE TABLE invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  invoice_number        TEXT NOT NULL,
  order_id              UUID REFERENCES orders(id),
  status                TEXT NOT NULL DEFAULT 'draft',  -- 'draft','issued','cancelled'
  air_freight           DECIMAL(18,2) DEFAULT 0,
  handling_documentation DECIMAL(18,2) DEFAULT 0,
  total_cnf             DECIMAL(18,2) DEFAULT 0,
  cnf_destination       TEXT,
  total_amount_usd      DECIMAL(18,2),
  amount_in_words       TEXT,
  shipping_type         TEXT,                     -- always 'By Air' (no UI choice; SHIPPING_MODE)
  marks                 TEXT,
  payment_terms         TEXT,
  consignee_name        TEXT,
  consignee_address     TEXT,
  consignee_country     TEXT,
  consignee_phone       TEXT,
  consignee_email       TEXT,
  notify_name           TEXT,
  notify_address        TEXT,
  notify_country        TEXT,
  notify_phone          TEXT,
  notify_contact_person TEXT,
  ordering_name         TEXT,
  ordering_address      TEXT,
  ordering_country      TEXT,
  ordering_phone        TEXT,
  signature_id          UUID REFERENCES signatures(id),  -- user picks from their uploaded signatures
  bank_detail_id        UUID REFERENCES company_bank_details(id),
  notes                 TEXT,
  section_enforcement   JSONB,             -- sections the PI had OFF that this CI must complete, e.g. {"freight": true}
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  is_deleted            BOOLEAN DEFAULT FALSE,
  UNIQUE(company_id, invoice_number)
);

CREATE TABLE invoice_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id),
  batch_id              UUID REFERENCES product_batches(id),
  mfd                   TEXT,
  exp                   TEXT,
  quantity              INTEGER NOT NULL,
  unit                  TEXT,
  supplier_price_lkr    DECIMAL(18,2),
  selling_price_usd     DECIMAL(18,2),
  line_total            DECIMAL(18,2),
  sort_order            INTEGER DEFAULT 0
);

CREATE TABLE invoice_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID NOT NULL REFERENCES invoices(id),
  file_path             TEXT NOT NULL,
  file_type             TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== PACKING LISTS (NEW) =====================

CREATE TABLE packing_lists (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID NOT NULL REFERENCES invoices(id),
  company_id            UUID NOT NULL REFERENCES companies(id),
  shipment_reference    TEXT,
  total_cartons         TEXT,
  container_info        TEXT,
  gross_weight_kg       DECIMAL(10,2),
  net_weight_kg         DECIMAL(10,2),
  cbm                   DECIMAL(10,2),
  marks                 TEXT,
  date                  DATE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE packing_list_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_list_id       UUID NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
  carton_start          INTEGER,
  carton_end            INTEGER,
  description           TEXT,
  packing_details       TEXT,       -- Formula: "(10X1)X10CTN=100 CTN"
  sort_order            INTEGER DEFAULT 0
);

-- ===================== AUDIT & PERMISSIONS =====================

CREATE TABLE user_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id),
  username              TEXT,
  company_id            UUID REFERENCES companies(id),
  action_type           TEXT NOT NULL,
  entity_name           TEXT,
  entity_id             TEXT,
  old_value             TEXT,
  new_value             TEXT,
  ip_address            TEXT,
  user_agent            TEXT,
  page                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dashboard_modules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  icon                  TEXT,
  route                 TEXT,
  sort_order            INTEGER DEFAULT 0,
  is_active             BOOLEAN DEFAULT TRUE,
  is_default            BOOLEAN DEFAULT FALSE
);

CREATE TABLE role_permissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role                  TEXT NOT NULL,
  module_id             UUID NOT NULL REFERENCES dashboard_modules(id),
  UNIQUE(role, module_id)
);
```

---

## 6. AUTHENTICATION & AUTHORIZATION

### JWT Flow

1. **Login** → `POST /api/auth/login` → issue access token + refresh token
2. **Access token:** Short-lived JWT (configurable via `JWT_ACCESS_TOKEN_DAYS`)
3. **Refresh token:** Long-lived, SHA-256 hashed in DB, rotation on each use
4. **Breach detection:** Revoked token presented → revoke ALL user tokens
5. **Logout** → revoke refresh token

### JWT Payload

```typescript
{ sub: string; username: string; role: string; fullName: string; iat: number; exp: number }
```

### Company Context

Every request (except auth/companies) needs company context:
- **Header:** `X-Company-Id: <uuid>` (or cookie)
- `owner` → unrestricted access (null = all companies)
- Others → validated against `user_company_access`
- Single-company users → auto-resolved

### Permission System (Two Types)

**1. FunctionKey Permissions** (stored in `role_function_permissions` DB table, NOT a JSON file):

```typescript
const PERMISSION_KEYS = [
  'manage_quotations', 'approve_quotations', 'manage_orders', 'approve_orders',
  'manage_invoices', 'manage_products', 'manage_batches', 'manage_customers',
  'manage_suppliers', 'manage_manufacturers', 'view_reports', 'manage_bank_details',
  'manage_users', 'view_audit_log', 'manage_packing_lists',
  'manage_proforma_invoices', 'approve_proforma_invoices'
] as const;
```

Default role → permission mapping (`DEFAULT_ROLE_PERMISSIONS` in `src/lib/constants.ts`; the live grants are edited on the Roles page):

| Permission | owner | admin | manager | office_staff | warehouse_staff | staff |
|-----------|-------|-------|---------|-------------|----------------|-------|
| manage_quotations | ✓ | ✓ | ✓ | ✓ | | |
| approve_quotations | ✓ | ✓ | ✓ | | | |
| manage_proforma_invoices | ✓ | ✓ | ✓ | ✓ | | |
| approve_proforma_invoices | ✓ | ✓ | ✓ | | | |
| manage_orders | ✓ | ✓ | ✓ | | | |
| approve_orders | ✓ | ✓ | | | ✓ | |
| manage_invoices | ✓ | ✓ | ✓ | | | |
| manage_products | ✓ | ✓ | | | ✓ | |
| manage_batches | ✓ | ✓ | | | ✓ | |
| manage_customers | ✓ | ✓ | ✓ | ✓ | | |
| manage_suppliers | ✓ | ✓ | ✓ | | | |
| manage_manufacturers | ✓ | ✓ | | | ✓ | |
| view_reports | ✓ | ✓ | ✓ | | | |
| manage_bank_details | ✓ | ✓ | | | | |
| manage_users | ✓ | ✓ | | | | |
| view_audit_log | ✓ | ✓ | | | | |
| manage_packing_lists | ✓ | ✓ | ✓ | | ✓ | |

**Notes on permission keys** — which key each pipeline action needs:

| Document | Action | Key |
|---|---|---|
| QT | create / edit / revise / mark sent / delete draft | `manage_quotations` |
| QT | accept / reject | `approve_quotations` |
| QT → PI | convert | `manage_proforma_invoices` |
| PI | create directly / edit / revise / mark sent / delete draft / cancel (before batches) | `manage_proforma_invoices` |
| PI | confirm (customer agreed) | `approve_proforma_invoices` |
| PI | assign batches / undo batches / cancel when `batch_assigned` | `approve_orders` |
| PI → CI | create commercial invoice (finalize) | `manage_invoices` |
| CI | edit draft / issue / cancel | `manage_invoices` |
| CI | complete (payment received) | `manage_orders` |
| CI | packing list | `manage_packing_lists` |

- `manage_*` keys control create/update/delete. **Read access** is granted by sidebar visibility — any role that can see a page can read its data.
- **Actions without a dedicated key:** companies & roles = owner only; signatures = any user (own signatures only); supplier price comparison = `manage_suppliers` or `view_reports`

**2. Dashboard Module Permissions** (DB via `role_permissions` junction table):
- Controls sidebar visibility per role
- Managed via Roles management page

### Six Roles

| Role | Description |
|------|------------|
| `owner` | Full access, all companies, user management |
| `admin` | Near-full access within assigned companies |
| `manager` | Quotations, PIs (incl. confirming), commercial invoices, customers |
| `office_staff` | Day-to-day quotations and PIs (create/send), customers |
| `warehouse_staff` | Products, batches, batch assignment |
| `staff` | Basic read access (sidebar-visible pages only) |

### Owner "All Companies" Mode

- When no company is selected, the owner sees aggregated data (dashboard, reports, audit log)
- **Creating or editing** anything (customers, quotations, invoices, etc.) requires picking a company first
- UI: show company selector prompt if owner tries to create without a company selected

---

## 7. CORE BUSINESS RULES

### 7.1 Pricing Model

```
Batch = COST only (what company paid)
  └── ONE price: wholesale OR retail (LKR)
  └── NO selling price on batch

Quotation Line Item = SELLING PRICE (what customer pays)
  └── Per customer, per product (USD)
  └── Existing customer: auto-load last quoted price
  └── New customer: starts at 0, user enters manually

NO customer-level pricing table exists.
```

### 7.2 Quotation → Proforma Invoice → Commercial Invoice Lifecycle

Three documents. A quotation lives in `quotations`; the PI and CI are the same `orders` row at different
stages (`document_type`), and the CI also has an `invoices` record.

```
QUOTATION (QT)              quotations table — /quotations
  draft → sent → negotiating → accepted → converted
                  ↑      │          │
                  └──────┘          └── rejected (a later edit starts a new draft revision)
  - No stock impact, no batch selection
  - Product + quantity + price (USD); MFD/EXP indicative only
  - Edits after sending create a revision (document_revisions) and move it to negotiating
  - Accept, then "Convert to PI" → creates a draft PI with the same lines (QT → converted)

PROFORMA INVOICE (PI)       orders row, document_type = proforma_invoice — /orders
  draft → sent → negotiating → confirmed → batch_assigned
  - Created from a QT conversion OR directly (some clients skip the quotation)
  - Optional sections (freight / bank / other details) default ON
  - Confirm = the customer agreed to the terms (no stock movement)
  - Changes are made by editing directly: editing a sent PI creates a revision and moves it to negotiating; re-send it
  - Batch assignment happens here: confirmed → batch_assigned, stock deducted
  - Undo batches: stock restored, back to confirmed
  - Deleting a draft PI that came from a QT puts that QT back to accepted

COMMERCIAL INVOICE (CI)     same orders row, document_type = commercial_invoice + invoices row — /invoices
  finalize (batch_assigned → invoiced) → issue the invoice → completed
  - Exact copy of the PI lines + assigned batches (MFD/EXP from the batch)
  - Add invoice parties (consignee / notify / ordering), e-signature, bank details
  - Sections the PI left OFF are enforced: they must be filled before the CI can be issued
  - Complete = payment received (only once the CI is issued)
  - Cancel the CI → order back to batch_assigned + proforma_invoice (stock stays deducted);
    finalizing again creates a new CI with a new number and copies the previous CI's packing list
    (shipment reference updated to the new number). Cancelling the CI of a completed order shows an
    extra "this will reopen a paid order" warning first.

PACKING                     packing_lists row per CI — /invoices/[id]/packing
```

**Pipeline UI:** `PipelineProgress` (QT, PI, CI and packing pages) shows the five steps with links between the
deal's documents. The next step comes from `describePipeline` in `src/lib/pipeline.ts`; if the viewer lacks its
permission, a hand-off banner names the roles that hold it (`GET /api/permissions/holders`, live grants).

### 7.3 Number Generation

All use count of ALL records (including soft-deleted) + 1:

| Entity | Format | Example |
|--------|--------|---------|
| Product | `PROD-{D7}` | PROD-0000001 |
| Customer | `CUSTOMER-{D7}` | CUSTOMER-0000001 |
| Supplier | `SUPP-{D7}` | SUPP-0000001 |
| Manufacturer | `MFG-{D8}` | MFG-00000001 |
| Quotation | `QT-{customerCode}-{D4}` | QT-SFL-0001 (seq per company, counts only `QT-` numbers) |
| Proforma Invoice | `PI-{customerCode}-{D4}` | PI-SFL-0001 (seq per company, counts only `PI-` numbers; the CI keeps this order number) |
| Commercial Invoice | Custom | `13/SFL/08/2026` — `{seq}/{customerCode}/{MM}/{YYYY}` (seq resets monthly per company; customerCode from `customers.code`) |

Legacy rows imported from the .NET app keep their numbers (`QUOT-0000001`, `INV - 00000001`).

### 7.4 Soft Delete

- All entities use `is_deleted` flag (except `company_bank_details` = HARD delete)
- Batch deletion blocked if used in orders/invoices
- Product deletion blocked if has active batches
- Always filter `WHERE is_deleted = FALSE` in queries

### 7.5 Invoice Cancellation

- Cancel → order returns to `batch_assigned` (stock stays deducted, batches stay assigned)
- Stock is ONLY restored via "Undo batch assignment" on the order, never by invoice cancellation
- MUST show SweetAlert2 confirmation dialog
- Audit trail recorded

### 7.6 Batch Editing After Deduction

- ALLOWED with: confirmation dialog, audit trail, validation (new qty ≥ committed)

### 7.7 Duplicate Checks

- **Products:** block if same `brand_name` + same `manufacturer_id` already exists
- **Customers:** soft warn (toast) if `name` or `business_name` closely match, but allow saving
- **Batch numbers:** block if `batch_number` already exists for the same product

### 7.8 Batch Assignment Rules

- Show all valid batches (stock > 0, `is_active = TRUE`, not expired) for the product
- Highlight batches where MFD/EXP match the PI line item's typed values
- On the Commercial Invoice PDF, MFD/EXP come from the **assigned batch**, not the PI
- Page `/orders/[id]/assign-batches` (`AssignBatches` + `src/components/batch-assignment/`): product list (search, status
  filters, done → partial → pending) beside the selected product's batch cards; auto-fill = MFD/EXP matches first, then
  earliest expiry, never above a batch's stock (stock is shared between lines of the same product). Next and
  "Save all assignments" stay disabled until each line's assigned quantity equals its requested quantity exactly

### 7.9 Low Stock Threshold

- Compare **product total stock** (sum across all batches) against the product's threshold
- Alert shown on dashboard and product list

### 7.10 Deletion & Cancellation

- **Delete:** only `draft` quotations and `draft` PIs (soft delete). Deleting a draft PI converted from a QT reopens that QT (`accepted`).
- **Cancel a PI:** `POST /api/orders/[id]/cancel` — from `draft`, `sent`, `negotiating`, `confirmed` or `batch_assigned`
  - If `batch_assigned`: releases the batches (restores stock) first, then `status=cancelled`
- An `invoiced` order can't be cancelled directly — cancel its commercial invoice first.
- **Order number:** a PI keeps its `PI-…` number when it becomes a CI.

### 7.11 Sent Tracking

- "Mark as sent" (not automatic on PDF download) sets `status = 'sent'` on quotations (`POST /api/quotations/[id]/send`)
  and on PIs (`POST /api/orders/[id]/send`); re-sending a revised document goes from `negotiating` back to `sent`.
- Each send also sets `sent_at` (quotations and orders) — the latest send, so a re-sent revision moves it forward.
  Shown as "Sent on …" in the QT/PI headers and as a "Sent" column in both lists. Rows sent before the column
  existed were backfilled from the audit log where an entry existed (imported legacy rows have none → "—").
- "Sent before invoicing" is enforced by the status chain: a PI can only be confirmed from `sent`/`negotiating`,
  and only a confirmed PI can get batches and be finalized.

### 7.12 Invoice Creation from Order

- Items and quantities are an **exact copy** from the order — no changes at finalize
- If changes needed: cancel invoice, undo batches if needed, revise the PI, re-finalize
- Parties at finalize: consignee from the customer record; notify + ordering copied from the customer's latest
  **issued** invoice in the company (none → only `notify_contact_person` = customer's contact person). On the draft,
  "Same as consignee" switches (UI-only, not stored) mirror the consignee into notify/ordering. Issuing needs a
  consignee name; with unsaved changes the button is "Save & issue" (save, then confirm issue)
- Section enforcement: sections the PI had OFF (`show_freight`, `show_bank_details`, `show_other_details`) are recorded
  in `invoices.section_enforcement`; the CI can't be issued until they're filled (freight → C&F destination,
  bank → bank account, other details → payment terms)

### 7.13 Invoice Editing & Revisions

- Editable only while `status = 'draft'`
- After cancellation, a new invoice gets a **new number** (not same number + revision)

### 7.14 `is_active` on Batches

- Auto-set to `false` when expired (checked on access)
- Can be manually toggled by warehouse_staff/manager (e.g. quality issue, recall)
- Inactive batches excluded from batch assignment

---

## 8. AUDIT LOGGING

### Action Types (source of truth: `ACTION_TYPES` in `src/lib/constants.ts`)

```typescript
export const ACTION_TYPES = {
  LOGIN: 'Login', LOGOUT: 'Logout', LOGIN_FAILED: 'LoginFailed',
  PERMISSION_DENIED: 'PermissionDenied',
  TOKEN_REFRESHED: 'TokenRefreshed',
  USER_CREATED: 'UserCreated', USER_UPDATED: 'UserUpdated',
  USER_DELETED: 'UserDeleted', USER_ROLE_CHANGED: 'UserRoleChanged',
  USER_DEACTIVATED: 'UserDeactivated', USER_REACTIVATED: 'UserReactivated',
  PASSWORD_CHANGED: 'PasswordChanged', PASSWORD_RESET: 'PasswordReset',
  PERMISSIONS_UPDATED: 'PermissionsUpdated',
  COMPANY_CREATED: 'CompanyCreated', COMPANY_UPDATED: 'CompanyUpdated',
  // Quotations
  QUOTATION_CREATED: 'QuotationCreated', QUOTATION_UPDATED: 'QuotationUpdated',
  QUOTATION_DELETED: 'QuotationDeleted', QUOTATION_SENT: 'QuotationSent',
  QUOTATION_ACCEPTED: 'QuotationAccepted', QUOTATION_REJECTED: 'QuotationRejected',
  QUOTATION_CONVERTED: 'QuotationConverted',
  // Proforma invoices
  PI_CREATED: 'ProformaInvoiceCreated', PI_UPDATED: 'ProformaInvoiceUpdated',
  PI_SENT: 'ProformaInvoiceSent', PI_CONFIRMED: 'ProformaInvoiceConfirmed',
  PI_REJECTED: 'ProformaInvoiceRejected', PI_DELETED: 'ProformaInvoiceDeleted',
  REVISION_CREATED: 'RevisionCreated',
  BATCHES_ASSIGNED: 'BatchesAssigned', BATCHES_UNASSIGNED: 'BatchesUnassigned',
  ORDER_CANCELLED: 'OrderCancelled', ORDER_COMPLETED: 'OrderCompleted',
  // Commercial invoices & packing
  INVOICE_CREATED: 'InvoiceCreated', INVOICE_UPDATED: 'InvoiceUpdated',
  INVOICE_ISSUED: 'InvoiceIssued', INVOICE_CANCELLED: 'InvoiceCancelled',
  PACKING_LIST_CREATED: 'PackingListCreated', PACKING_LIST_UPDATED: 'PackingListUpdated',
  PACKING_LIST_DELETED: 'PackingListDeleted',
  SIGNATURE_UPLOADED: 'SignatureUploaded', SIGNATURE_DELETED: 'SignatureDeleted',
  MANUFACTURER_CREATED: 'ManufacturerCreated', MANUFACTURER_UPDATED: 'ManufacturerUpdated',
  MANUFACTURER_DELETED: 'ManufacturerDeleted',
  BANK_DETAIL_CREATED: 'BankDetailCreated', BANK_DETAIL_UPDATED: 'BankDetailUpdated',
  BANK_DETAIL_DELETED: 'BankDetailDeleted',
  PRODUCT_CREATED: 'ProductCreated', PRODUCT_UPDATED: 'ProductUpdated',
  PRODUCT_DELETED: 'ProductDeleted', BATCH_CREATED: 'BatchCreated',
  BATCH_UPDATED: 'BatchUpdated', BATCH_DELETED: 'BatchDeleted',
  STOCK_UPDATED: 'StockUpdated',
  CUSTOMER_CREATED: 'CustomerCreated', CUSTOMER_UPDATED: 'CustomerUpdated',
  CUSTOMER_DELETED: 'CustomerDeleted',
  SUPPLIER_CREATED: 'SupplierCreated', SUPPLIER_UPDATED: 'SupplierUpdated',
  SUPPLIER_DELETED: 'SupplierDeleted',
  REPORT_GENERATED: 'ReportGenerated', REPORT_EXPORTED: 'ReportExported',
} as const;
```

**Implementation:** Fire-and-forget async logging, JSON serialize old/new values, denormalize username, track IP + user agent.

**Company scoping:** `company_id` is nullable on `user_logs` (login/logout events have no company). Filter by company when set; `owner` role sees all logs across companies.

---

## 9. API ROUTES

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Login → JWT + refresh |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token |
| POST | `/api/auth/register-owner` | One-time owner setup |

### Users
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/users` | List (paginated) |
| GET/POST/PUT/DELETE | `/api/users/[id]` | CRUD |
| PUT | `/api/users/[id]/companies` | Update company assignments |
| POST | `/api/users/[id]/change-password` | Self password change |
| POST | `/api/users/[id]/reset-password` | Admin reset |
| POST | `/api/users/[id]/deactivate` | Deactivate |
| POST | `/api/users/[id]/reactivate` | Reactivate |

### Products (SHARED)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | List (paginated, search) |
| GET/POST/PUT/DELETE | `/api/products/[id]` | CRUD |
| GET | `/api/products/[id]/valid-batches` | Active in-stock non-expired |
| GET | `/api/products/[id]/best-supplier-price` | Best supplier price |
| GET | `/api/products/[id]/supplier-history` | Price history |

### Batches (SHARED)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/batches` | List (filters: expiry/stock/active) |
| GET/POST/PUT/DELETE | `/api/batches/[id]` | CRUD |
| PATCH | `/api/batches/[id]/stock` | Update stock only |

### Customers, Suppliers, Manufacturers — Standard CRUD

### Quotations (COMPANY-SCOPED) — QT
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/quotations` | List (status, customer, date, search filters) |
| POST | `/api/quotations` | Create → `draft`, number `QT-{code}-{seq}` |
| GET/PUT/DELETE | `/api/quotations/[id]` | Detail / edit (after sending: new revision, → `negotiating`; rejected → new `draft` revision) / delete draft |
| POST | `/api/quotations/[id]/send` | Mark as sent: `draft`/`negotiating` → `sent` |
| POST | `/api/quotations/[id]/accept` | Customer accepted: `sent`/`negotiating` → `accepted` |
| POST | `/api/quotations/[id]/reject` | Reject (`{ reason }`): `sent`/`negotiating` → `rejected` |
| POST | `/api/quotations/[id]/convert` | `accepted` → `converted`; creates a draft PI with the same lines → `{ quotation, order }` |
| GET | `/api/quotations/[id]/pdf` | Quotation PDF |
| GET | `/api/quotations/next-number?customerId=` | Preview of the next QT number |
| GET | `/api/quotations/last-price?customerId=&productId=` | Last price quoted to this customer |

### Orders (COMPANY-SCOPED) — PI and CI
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/orders` | List PIs and CIs (documentType, status, customer, date, search filters) |
| POST | `/api/orders` | Create a PI directly (no quotation) → `draft`, number `PI-{code}-{seq}` |
| GET/PUT/DELETE | `/api/orders/[id]` | Detail / edit PI (after sending: new revision, → `negotiating`) / delete draft PI |
| POST | `/api/orders/[id]/send` | Mark PI as sent: `draft`/`negotiating` → `sent` |
| POST | `/api/orders/[id]/confirm` | Customer confirmed: `sent`/`negotiating` → `confirmed` |
| POST | `/api/orders/[id]/assign-batches` | `confirmed` → `batch_assigned`, stock deducted (lines may split across batches) |
| POST | `/api/orders/[id]/undo-batches` | `batch_assigned` → `confirmed`, stock restored |
| POST | `/api/orders/[id]/cancel` | Cancel PI (restores stock if `batch_assigned`) |
| POST | `/api/orders/[id]/finalize` | `batch_assigned` → `invoiced`, document_type → `commercial_invoice`; creates a draft CI (→ `packingListCopiedFrom` when a cancelled CI's packing list was carried over) |
| POST | `/api/orders/[id]/complete` | `invoiced` → `completed` (CI must be issued) |
| GET | `/api/orders/[id]/pdf` | Proforma Invoice PDF |
| GET | `/api/orders/next-number?customerId=` | Preview of the next PI number |
| GET | `/api/orders/last-sale-price` | Last price for customer+product |

### Revisions (COMPANY-SCOPED via the parent document)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/revisions?documentType=quotation\|proforma_invoice&documentId=` | Revision list, newest first |
| GET | `/api/revisions/[id]` | One revision with its snapshot |

### Commercial Invoices (COMPANY-SCOPED)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/invoices` | List (status, customer, date filters) |
| GET/PUT | `/api/invoices/[id]` | Detail (+ `missingEnforcedSections`) / save draft (parties, bank, signature, terms) |
| POST | `/api/invoices/[id]/issue` | Issue (draft→issued); blocked until enforced sections are filled |
| POST | `/api/invoices/[id]/cancel` | Cancel (order → batch_assigned + proforma_invoice, stock stays deducted) |
| GET | `/api/invoices/[id]/pdf` | Commercial Invoice PDF |

### Bank Details (COMPANY-SCOPED)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/bank-details` | List for company |
| POST | `/api/bank-details` | Create |
| PUT/DELETE | `/api/bank-details/[id]` | Update / hard-delete |

### Packing Lists (COMPANY-SCOPED)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/packing-lists?invoiceId=` | Get by invoice |
| POST | `/api/packing-lists` | Create |
| PUT/DELETE | `/api/packing-lists/[id]` | Update / delete |
| GET | `/api/packing-lists/[id]/pdf` | Packing List PDF |

### Dashboard
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/dashboard` | KPIs + chart data |

### Reports
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/reports/inventory` | Inventory report |
| GET | `/api/reports/expiry` | Expiry report |
| GET | `/api/reports/orders` | Orders/sales report |
| GET | `/api/reports/customers` | Customer report |
| GET | `/api/reports/manufacturers` | Manufacturer report |
| GET | `/api/reports/invoice-value` | Invoice value report |

### Audit Log
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/audit-log` | Paginated log (company_id nullable — owner sees all) |

### Permissions
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/permissions` | Get role permissions matrix |
| PUT | `/api/permissions` | Update role-module assignments (owner only) |
| GET | `/api/permissions/holders` | Roles holding each action permission (any signed-in user; for hand-off messages) |

### Signatures
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/signatures/upload` | Upload e-signature image to Supabase |
| GET | `/api/signatures` | List available signatures |

---

## 10. PDF GENERATION

### Four PDF Types

1. **Quotation** — A4 Landscape (QT; only the sections switched on)
2. **Proforma Invoice** — A4 Landscape (PI)
3. **Invoice** (CI) — A4 Landscape, with parties + signature. Printed heading and UI name are just "INVOICE" / "Invoice"; internally it stays `commercial_invoice`
4. **Packing List** — A4 Portrait

### Approach: Puppeteer

1. Render React component to HTML string
2. Launch Puppeteer → `page.setContent(html)`
3. Generate PDF with format/margins
4. Return buffer

### Key PDF Rules
- One product can appear on MULTIPLE rows with different batches
- MNF column = Manufacturer name (not date)
- MFD/EXP in Mon-YY format (Sep-25, Aug-28)
- QTY includes unit text ("984 Packs")
- C&F destination varies per shipment (editable); shipping is always by air — no shipping-type field
- Totals block (QT, PI, invoice — pages and PDFs; `TOTAL_LABELS` / `cnfTotalLabel` in `src/lib/constants.ts`):
  `Sub Total` → `Air Freight, Handling & Documentation Charges` (freight + handling) → `Total C&F {destination} By Air`.
  On a QT/PI with the freight section OFF only `Total` is shown
- Page numbering for multi-page invoices
- E-signature image bottom-right on commercial invoices

---

## 11. REPORTS

6 types: Inventory, Expiry, Orders, Customers, Manufacturers, Invoice Value.
Features: 5-min cache, Excel/PDF export, owner cross-company view, time-series bucketing.

---

## 12. NEW FEATURES

| Feature | Notes |
|---------|-------|
| Packing Details | Linked to invoice, carton ranges, weights, CBM, packing formula |
| Invoice Parties | Consignee/Notify/Ordering — free-text per invoice |
| E-Signature | Image upload (PNG/JPG) to Supabase, placed on PDF |
| Quotation Rejection | Reject the quotation outright with a reason (PIs have no reject — edit or cancel instead) |
| Undo Batch Assignment | Restore stock, reassign batches |
| Password Change (self) | Users change own password |
| Password Reset (admin) | Admin resets user password |
| User Deactivation | Temporary disable + permanent delete |
| Last Login Tracking | Timestamp on user record |
| Monthly Sales KPI | Total sales of month on dashboard |
| Top Products KPI | Top selling products on dashboard |
| Per-Product Low Stock | Configurable threshold (not hardcoded 100) |
| C&F in Quotation | Available at quotation stage too |

---

## 13. CODING CONVENTIONS

- **TypeScript strict** — no `any`
- **Named exports** over defaults
- **Server Components** by default, `'use client'` only when needed
- **API Route Handlers** for all mutations and queries (with TanStack Query on the client)
- Tokens stored in **httpOnly cookies** (not localStorage)
- **snake_case** DB columns, **camelCase** TypeScript
- **Always filter `is_deleted = false`** except for number generation counts
- **Company-scoped queries** always include `company_id` (except products/batches/manufacturers)
- **Transactions** for multi-step mutations
- **Tailwind CSS v4** only — no inline styles
- **Zod** validation on both client and server
- **Sonner** toasts for feedback
- Custom components: `PascalCase.tsx` (e.g., `QuotationWizard.tsx`, `DataTable.tsx`). shadcn `ui/` files stay kebab-case as generated. Pages: kebab-case dirs. Utilities: camelCase.

---

## 14. ENVIRONMENT VARIABLES

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=<secret>
JWT_ACCESS_TOKEN_DAYS=7
JWT_REFRESH_TOKEN_DAYS=30
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
SUPABASE_STORAGE_BUCKET=medicine-agent
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

---

## 15. PAGINATION PATTERN

```typescript
interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
// Defaults: page=1, pageSize=20, max=200
```

---

## 16. SETUP NOTES

- **Pin Next.js 15:** Use `npx create-next-app@15 .` (not `@latest`, which installs v16+)
- **Scaffolding:** If `CLAUDE.md` / `MASTER_PROMPT.md` are already in the folder, scaffold into a temp dir and move files in, or temporarily move the .md files out
- **Tailwind v4:** No `tailwind.config.ts` needed — theme configuration goes in `src/styles/globals.css` via `@theme`
- **SweetAlert2 + Sonner:** Use SweetAlert2 for confirmations, success/error/warning popups; Sonner for quick auto-dismiss background toasts
- **Database:** The app uses the existing Supabase DB, but all its tables live in the **`app` Postgres schema** (`pgSchema("app")`, `schemaFilter: ["app"]`). The legacy .NET app is still live on `public.*` in the same DB — never write to `public`. `npm run db:import-legacy` (re-runnable, `--dry-run` supported) copies legacy data into `app.*` keeping the legacy UUIDs; legacy wins for legacy records. Legacy invoice numbers (`INV - 00000001`) are kept as-is.

---

## 17. DEFERRED

| Feature | Reason |
|---------|--------|
| Mobile app | Skip for now |
| Custom roles | Undecided |
| Revenue tracking | Not needed |
| Quotation expiry | Not needed |
| Offline mode | Not needed for web |
| Email integration | Later phase |
