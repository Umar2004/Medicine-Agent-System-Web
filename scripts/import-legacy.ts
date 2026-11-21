// One-way import of the legacy .NET data (public.*) into the new app schema (app.*).
// Usage: npm run db:import-legacy            (apply)
//        npm run db:import-legacy -- --dry-run (run everything, then roll back)
//
// Safe to re-run: rows keep their legacy UUIDs and are upserted by id, so the latest
// legacy state wins for legacy records. Records created in the new app are never touched.
// The legacy tables are only read — never written.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK = Symbol("rollback");

type Sql = postgres.TransactionSql;

/** 'Medi Scop Ltd' → 'MSL', 'Paracare' → 'PAR'. */
function baseCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "CUS";
  const code = words.length >= 2 ? words.map((w) => w[0]).join("").slice(0, 4) : words[0].slice(0, 3);
  return code.length >= 2 ? code : (code + "XX").slice(0, 3);
}

async function count(tx: Sql, table: string): Promise<number> {
  const [row] = await tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)}`;
  return row.n;
}

async function run(tx: Sql): Promise<void> {
  const step = async (label: string, query: Promise<postgres.RowList<postgres.Row[]>>) => {
    const res = await query;
    console.log(`  ${label.padEnd(34)} ${res.count}`);
  };

  // Legacy user id → app user id. A legacy user whose username (case-insensitive) is
  // already taken by a different app user is merged into that user.
  await tx`
    create temp table user_map on commit drop as
    select l.user_id as legacy_id, coalesce(a.id, l.user_id) as app_id, a.id is not null as merged, l.username
    from public.users l
    left join app.users a on lower(a.username) = lower(l.username) and a.id <> l.user_id`;
  const merged = await tx<{ username: string }[]>`select username from user_map where merged`;

  await step("companies", tx`
    insert into app.companies (id, name, address, phone, email, website, currency, logo_url, created_at, is_deleted)
    select company_id, company_name, address, contact_number, email, website, coalesce(currency, 'USD'), logo_url,
           coalesce(created_at, now()), coalesce(is_deleted, false)
    from public.companies
    on conflict (id) do update set name = excluded.name, address = excluded.address, phone = excluded.phone,
      email = excluded.email, website = excluded.website, currency = excluded.currency,
      logo_url = excluded.logo_url, is_deleted = excluded.is_deleted, updated_at = now()`);

  await step("users", tx`
    insert into app.users (id, username, password_hash, full_name, email, role, status, created_at, is_deleted)
    select l.user_id, l.username, l.password_hash, coalesce(nullif(trim(l.full_name), ''), l.username), l.email,
           case replace(lower(coalesce(l.role, '')), ' ', '_')
             when 'owner' then 'owner' when 'admin' then 'admin' when 'manager' then 'manager'
             when 'office_staff' then 'office_staff' when 'warehouse_staff' then 'warehouse_staff'
             else 'staff' end,
           case when l.status = 'inactive' then 'inactive' else 'active' end,
           coalesce(l.created_at, now()), coalesce(l.is_deleted, false)
    from public.users l
    join user_map m on m.legacy_id = l.user_id and not m.merged
    on conflict (id) do update set username = excluded.username, password_hash = excluded.password_hash,
      full_name = excluded.full_name, email = excluded.email, role = excluded.role, status = excluded.status,
      is_deleted = excluded.is_deleted, updated_at = now()`);

  await step("user_company_access", tx`
    insert into app.user_company_access (user_id, company_id, is_default)
    select m.app_id, u.company_id, bool_or(u.is_default)
    from public.user_company_access u
    join user_map m on m.legacy_id = u.user_id
    join app.users au on au.id = m.app_id and au.role <> 'owner'
    where u.company_id is not null
    group by m.app_id, u.company_id
    on conflict on constraint user_company_access_user_company_uq do update set is_default = excluded.is_default`);

  await step("company_bank_details", tx`
    insert into app.company_bank_details (id, company_id, bank_name, account_number, swift_code, branch_name, other_details, created_at)
    select bank_detail_id, company_id, bank_name, account_number, swift_code, branch_name, other_details, created_at
    from public.company_bank_details
    on conflict (id) do update set bank_name = excluded.bank_name, account_number = excluded.account_number,
      swift_code = excluded.swift_code, branch_name = excluded.branch_name, other_details = excluded.other_details`);

  await step("manufacturers", tx`
    insert into app.manufacturers (id, manufacturer_number, name, country, created_at, is_deleted)
    select manufacturer_id, manufacturer_number, name, country, created_at, is_deleted
    from public.manufacturers
    on conflict (id) do update set manufacturer_number = excluded.manufacturer_number, name = excluded.name,
      country = excluded.country, is_deleted = excluded.is_deleted, updated_at = now()`);

  await step("products", tx`
    insert into app.products (id, product_number, brand_name, generic_name, manufacturer_id, unit, country, created_at, is_deleted)
    select product_id, product_number, trim(product_name), generic_name, manufacturer_id, unit, country,
           coalesce(created_at, now()), coalesce(is_deleted, false)
    from public.products
    on conflict (id) do update set product_number = excluded.product_number, brand_name = excluded.brand_name,
      generic_name = excluded.generic_name, manufacturer_id = excluded.manufacturer_id, unit = excluded.unit,
      country = excluded.country, is_deleted = excluded.is_deleted, updated_at = now()`);

  await step("suppliers", tx`
    insert into app.suppliers (id, company_id, supplier_number, name, phone, contact_number, email, country, created_at, is_deleted)
    select supplier_id, company_id, supplier_number, supplier_name, phone_number, contact_number, email, country,
           coalesce(created_at, now()), coalesce(is_deleted, false)
    from public.suppliers
    where company_id is not null
    on conflict (id) do update set supplier_number = excluded.supplier_number, name = excluded.name,
      phone = excluded.phone, contact_number = excluded.contact_number, email = excluded.email,
      country = excluded.country, is_deleted = excluded.is_deleted, updated_at = now()`);

  // Legacy batches carry both prices; purchase_type says which one the company paid.
  await step("product_batches", tx`
    insert into app.product_batches (id, batch_number, product_id, supplier_id, mfd, exp, stock_quantity, cost_price,
                                     price_type, is_active, created_at, is_deleted)
    select b.batch_id, b.batch_number, b.product_id, s.id, to_char(b.mfd, 'MM/YYYY'), to_char(b.exp, 'MM/YYYY'),
           greatest(coalesce(b.stock_quantity, 0), 0),
           case when lower(b.purchase_type) = 'retail' then b.retail_price_lkr else b.wholesale_price_lkr end,
           case lower(b.purchase_type) when 'retail' then 'retail' when 'wholesale' then 'wholesale' end,
           b.is_active, coalesce(b.created_at, now()), coalesce(b.is_deleted, false)
    from public.product_batches b
    join app.products p on p.id = b.product_id
    left join app.suppliers s on s.id = b.supplier_id
    on conflict (id) do update set batch_number = excluded.batch_number, supplier_id = excluded.supplier_id,
      mfd = excluded.mfd, exp = excluded.exp, stock_quantity = excluded.stock_quantity,
      cost_price = excluded.cost_price, price_type = excluded.price_type, is_active = excluded.is_active,
      is_deleted = excluded.is_deleted, updated_at = now()`);

  await step("supplier_price_history", tx`
    insert into app.supplier_price_history (id, supplier_id, product_id, company_id, price_lkr, recorded_at, notes)
    select h.history_id, h.supplier_id, h.product_id, s.company_id, h.price, coalesce(h.effective_date, now()),
           case when coalesce(h.currency, 'LKR') <> 'LKR' then 'Currency: ' || h.currency end
    from public.supplier_price_history h
    join app.suppliers s on s.id = h.supplier_id
    join app.products p on p.id = h.product_id
    on conflict (id) do update set price_lkr = excluded.price_lkr, recorded_at = excluded.recorded_at`);

  // Customers need a short code (used in invoice numbers). Generate one only for customers
  // that are new to the app; never change a code once assigned.
  const legacyCustomers = await tx<
    { customer_id: string; company_id: string; customer_name: string; business_name: string | null }[]
  >`select customer_id, company_id, customer_name, business_name from public.customers where company_id is not null`;
  const existing = await tx<{ id: string; company_id: string; code: string }[]>`
    select id, company_id, code from app.customers`;
  const known = new Set(existing.map((c) => c.id));
  const taken = new Map<string, Set<string>>();
  for (const c of existing) {
    if (!taken.has(c.company_id)) taken.set(c.company_id, new Set());
    taken.get(c.company_id)!.add(c.code);
  }
  const codes: { id: string; code: string }[] = [];
  for (const c of legacyCustomers) {
    if (known.has(c.customer_id)) continue;
    const used = taken.get(c.company_id) ?? new Set<string>();
    taken.set(c.company_id, used);
    const base = baseCode(c.business_name?.trim() || c.customer_name);
    let code = base;
    for (let i = 2; used.has(code); i++) code = `${base}${i}`;
    used.add(code);
    codes.push({ id: c.customer_id, code });
  }
  await tx`create temp table customer_codes (id uuid primary key, code text not null) on commit drop`;
  if (codes.length) await tx`insert into customer_codes ${tx(codes)}`;

  await step("customers", tx`
    insert into app.customers (id, company_id, customer_number, code, name, business_name, phone, email, address, city,
                               country, created_at, is_deleted)
    select c.customer_id, c.company_id, c.customer_number, coalesce(cc.code, ac.code),
           coalesce(nullif(trim(c.customer_name), ''), c.business_name, ''), c.business_name, c.contact_number,
           c.email, c.address, c.city, c.country, coalesce(c.created_at, now()), coalesce(c.is_deleted, false)
    from public.customers c
    left join customer_codes cc on cc.id = c.customer_id
    left join app.customers ac on ac.id = c.customer_id
    where c.company_id is not null
    on conflict (id) do update set customer_number = excluded.customer_number, name = excluded.name,
      business_name = excluded.business_name, phone = excluded.phone, email = excluded.email,
      address = excluded.address, city = excluded.city, country = excluded.country,
      is_deleted = excluded.is_deleted, updated_at = now()`);

  // Legacy model: a quotation row (type='quotation') is copied into an invoice row
  // (type='invoice', source_order_id → quotation) on finalize. New model (QT → PI → CI):
  //   quotation rows still at the quotation stage → app.quotations (never touch inventory)
  //   quotation rows that were invoiced           → app.orders as a completed commercial invoice
  //   invoice rows                                → app.invoices (id kept), linked to their order
  //   invoice rows with no quotation              → also become a completed app.orders row (same id)
  await tx`
    create temp table legacy_orders on commit drop as
    select o.*,
           o.type = 'invoice' as is_invoice,
           o.type = 'invoice' and (o.source_order_id is null or not exists (
             select 1 from public.orders q where q.order_id = o.source_order_id and q.type <> 'invoice')) as orphan_invoice
    from public.orders o
    where o.company_id is not null
      and exists (select 1 from app.customers c where c.id = o.customer_id)`;

  await tx`
    create temp table order_map on commit drop as
    select order_id as id,
           case
             when is_invoice then case when status = 'cancelled' then 'cancelled' else 'completed' end
             when status = 'invoiced' or status = 'completed' then 'completed'
             when status in ('pending', 'approved', 'cancelled') then status
             else 'pending'
           end as status
    from legacy_orders
    where not is_invoice or orphan_invoice`;

  // Quotation stage = never invoiced (pending / approved / cancelled before finalizing).
  await tx`
    create temp table quote_map on commit drop as
    select m.id,
           case m.status when 'approved' then 'accepted' when 'cancelled' then 'rejected' else 'draft' end as status
    from order_map m
    join legacy_orders o on o.order_id = m.id
    where m.status in ('pending', 'approved') or (m.status = 'cancelled' and not o.is_invoice)`;

  // Only legacy free-text bank details exist on orders; link the company's account when it has exactly one.
  await tx`
    create temp table single_bank on commit drop as
    select company_id, min(id::text)::uuid as id from app.company_bank_details group by company_id having count(*) = 1`;

  // A legacy quotation that has since been invoiced in the old app moves from quotations to
  // orders — unless it was already converted to a PI in the new app (new-app work is kept).
  await step("quotations moved to orders", tx`
    delete from app.quotations q
    using order_map m
    where q.id = m.id and m.id not in (select id from quote_map)
      and q.status <> 'converted' and q.converted_to_order_id is null`);

  await step("quotations", tx`
    insert into app.quotations as tq (id, company_id, quotation_number, customer_id, status,
                                show_freight, show_bank_details, show_other_details,
                                air_freight, handling_documentation, total_cnf, cnf_destination,
                                show_mfd, show_exp, show_generic_name, notes, bank_detail_id, created_at, is_deleted)
    select o.order_id, o.company_id, o.order_number, o.customer_id, qm.status,
           true, o.bank_details is not null and sb.id is not null, true,
           o.air_freight, o.handling_documentation, o.total_cnf_nairobi, 'Nairobi',
           o.show_mfd, o.show_exp, o.show_generic_name, o.notes,
           case when o.bank_details is not null then sb.id end,
           coalesce(o.quotation_date, o.created_at, now()), false
    from legacy_orders o
    join quote_map qm on qm.id = o.order_id
    left join single_bank sb on sb.company_id = o.company_id
    on conflict (id) do update set quotation_number = excluded.quotation_number, status = excluded.status,
      customer_id = excluded.customer_id, air_freight = excluded.air_freight,
      handling_documentation = excluded.handling_documentation, total_cnf = excluded.total_cnf,
      show_mfd = excluded.show_mfd, show_exp = excluded.show_exp, show_generic_name = excluded.show_generic_name,
      notes = excluded.notes, bank_detail_id = excluded.bank_detail_id, created_at = excluded.created_at,
      updated_at = now()
    -- Once converted to a PI in the new app, the quotation is history — legacy no longer wins.
    where tq.status <> 'converted'`);

  await step("quotation_items", tx`
    insert into app.quotation_items (id, quotation_id, product_id, mfd, exp, quantity, unit, selling_price_usd,
                                     total_usd, sort_order)
    select i.order_item_id, i.order_id, i.product_id, to_char(i.mfd, 'MM/YYYY'), to_char(i.exp, 'MM/YYYY'),
           i.quantity, p.unit, i.selling_price_lkr, round(i.quantity * coalesce(i.selling_price_lkr, 0), 2),
           row_number() over (partition by i.order_id order by i.order_item_id)::int - 1
    from public.order_items i
    join app.quotations aq on aq.id = i.order_id and aq.status <> 'converted'
    join quote_map qm on qm.id = i.order_id
    join app.products p on p.id = i.product_id
    on conflict (id) do update set product_id = excluded.product_id, mfd = excluded.mfd, exp = excluded.exp,
      quantity = excluded.quantity, unit = excluded.unit, selling_price_usd = excluded.selling_price_usd,
      total_usd = excluded.total_usd, sort_order = excluded.sort_order`);

  await step("quotation_items removed (stale)", tx`
    delete from app.quotation_items aqi
    using quote_map qm, app.quotations aq
    where aqi.quotation_id = qm.id and aq.id = qm.id and aq.status <> 'converted'
      and not exists (select 1 from public.order_items i where i.order_item_id = aqi.id)`);

  // Past the quotation stage: completed (invoiced) or cancelled after invoicing.
  await step("orders", tx`
    insert into app.orders (id, company_id, order_number, document_type, status, customer_id, air_freight,
                            handling_documentation, total_cnf, cnf_destination, show_mfd, show_exp, show_generic_name,
                            notes, bank_detail_id, created_at, is_deleted)
    select o.order_id, o.company_id, o.order_number,
           case when m.status = 'completed' then 'commercial_invoice' else 'proforma_invoice' end,
           m.status, o.customer_id, o.air_freight, o.handling_documentation, o.total_cnf_nairobi, 'Nairobi',
           o.show_mfd, o.show_exp, o.show_generic_name, o.notes,
           case when o.bank_details is not null then sb.id end,
           coalesce(o.quotation_date, o.created_at, now()), false
    from legacy_orders o
    join order_map m on m.id = o.order_id
    left join single_bank sb on sb.company_id = o.company_id
    where m.id not in (select id from quote_map)
    on conflict (id) do update set order_number = excluded.order_number, document_type = excluded.document_type,
      status = excluded.status, customer_id = excluded.customer_id, air_freight = excluded.air_freight,
      handling_documentation = excluded.handling_documentation, total_cnf = excluded.total_cnf,
      show_mfd = excluded.show_mfd, show_exp = excluded.show_exp, show_generic_name = excluded.show_generic_name,
      notes = excluded.notes, bank_detail_id = excluded.bank_detail_id,
      created_at = excluded.created_at, updated_at = now()`);

  await step("order_items", tx`
    insert into app.order_items (id, order_id, product_id, mfd, exp, quantity, unit, selling_price_usd, total_usd,
                                 batch_id, sort_order)
    select i.order_item_id, i.order_id, i.product_id, to_char(i.mfd, 'MM/YYYY'), to_char(i.exp, 'MM/YYYY'),
           i.quantity, p.unit, i.selling_price_lkr, round(i.quantity * coalesce(i.selling_price_lkr, 0), 2),
           b.id,
           row_number() over (partition by i.order_id order by i.order_item_id)::int - 1
    from public.order_items i
    join app.orders ao on ao.id = i.order_id
    join order_map m on m.id = i.order_id
    join app.products p on p.id = i.product_id
    left join app.product_batches b on b.id = i.batch_id
    where i.order_id not in (select id from quote_map)
    on conflict (id) do update set product_id = excluded.product_id, mfd = excluded.mfd, exp = excluded.exp,
      quantity = excluded.quantity, unit = excluded.unit, selling_price_usd = excluded.selling_price_usd,
      total_usd = excluded.total_usd, batch_id = excluded.batch_id, sort_order = excluded.sort_order`);

  await step("order_items removed (stale)", tx`
    delete from app.order_items ai
    using order_map m
    where ai.order_id = m.id
      and not exists (select 1 from public.order_items i where i.order_item_id = ai.id)`);

  await step("invoices", tx`
    insert into app.invoices (id, company_id, invoice_number, order_id, status, air_freight, handling_documentation,
                              total_cnf, cnf_destination, total_amount_usd, consignee_name, consignee_address,
                              consignee_country, consignee_phone, consignee_email, bank_detail_id, notes, created_at)
    select o.order_id, o.company_id, o.order_number,
           case when o.orphan_invoice then o.order_id else o.source_order_id end,
           case when o.status = 'cancelled' then 'cancelled' else 'issued' end,
           o.air_freight, o.handling_documentation, o.total_cnf_nairobi, 'Nairobi',
           coalesce((select sum(round(i.quantity * coalesce(i.selling_price_lkr, 0), 2)) from public.order_items i
                     where i.order_id = o.order_id), 0) + o.air_freight + o.handling_documentation,
           coalesce(nullif(trim(c.business_name), ''), c.customer_name), c.address, c.country, c.contact_number, c.email,
           case when o.bank_details is not null then sb.id end, o.notes,
           coalesce(o.quotation_date, o.created_at, now())
    from legacy_orders o
    join public.customers c on c.customer_id = o.customer_id
    left join single_bank sb on sb.company_id = o.company_id
    where o.is_invoice
    on conflict (id) do update set invoice_number = excluded.invoice_number, order_id = excluded.order_id,
      status = excluded.status, air_freight = excluded.air_freight,
      handling_documentation = excluded.handling_documentation, total_cnf = excluded.total_cnf,
      total_amount_usd = excluded.total_amount_usd, bank_detail_id = excluded.bank_detail_id,
      notes = excluded.notes, created_at = excluded.created_at, updated_at = now()`);

  // On the tax invoice MFD/EXP come from the assigned batch (spec §7.8).
  await step("invoice_items", tx`
    insert into app.invoice_items (id, invoice_id, product_id, batch_id, mfd, exp, quantity, unit, supplier_price_lkr,
                                   selling_price_usd, line_total, sort_order)
    select i.order_item_id, i.order_id, i.product_id, b.id,
           coalesce(b.mfd, to_char(i.mfd, 'MM/YYYY')), coalesce(b.exp, to_char(i.exp, 'MM/YYYY')),
           i.quantity, p.unit, b.cost_price, i.selling_price_lkr,
           round(i.quantity * coalesce(i.selling_price_lkr, 0), 2),
           row_number() over (partition by i.order_id order by i.order_item_id)::int - 1
    from public.order_items i
    join app.invoices inv on inv.id = i.order_id
    join app.products p on p.id = i.product_id
    left join app.product_batches b on b.id = i.batch_id
    on conflict (id) do update set product_id = excluded.product_id, batch_id = excluded.batch_id,
      mfd = excluded.mfd, exp = excluded.exp, quantity = excluded.quantity, unit = excluded.unit,
      supplier_price_lkr = excluded.supplier_price_lkr, selling_price_usd = excluded.selling_price_usd,
      line_total = excluded.line_total, sort_order = excluded.sort_order`);

  await step("invoice_items removed (stale)", tx`
    delete from app.invoice_items ai
    using legacy_orders o
    where o.is_invoice and ai.invoice_id = o.order_id
      and not exists (select 1 from public.order_items i where i.order_item_id = ai.id)`);

  // Audit entries are immutable — insert new ones only. Map legacy action names to ours.
  await step("user_logs", tx`
    insert into app.user_logs (id, user_id, username, company_id, action_type, entity_name, entity_id, old_value,
                               new_value, ip_address, user_agent, page, created_at)
    select l.log_id, au.id, coalesce(l.username, lu.username), ac.id,
           case coalesce(nullif(l.action_type, ''), l.action)
             when 'LoginSuccess' then 'Login'
             when 'LoginFailure' then 'LoginFailed'
             when 'PermissionMatrixChanged' then 'PermissionsUpdated'
             when 'QuotationConvertedToInvoice' then 'InvoiceCreated'
             else coalesce(nullif(l.action_type, ''), l.action) end,
           l.entity_name, l.entity_id, l.old_value,
           coalesce(l.new_value, case when nullif(l.action_type, '') is not null and l.action <> l.action_type then l.action end),
           l.ip_address, l.device, l.page_name, coalesce(l.created_at, now())
    from public.user_logs l
    left join user_map m on m.legacy_id = l.user_id
    left join app.users au on au.id = m.app_id
    left join public.users lu on lu.user_id = l.user_id
    left join app.companies ac on ac.id = l.company_id
    on conflict (id) do nothing`);

  // Report anything that could not be carried over.
  const [skipped] = await tx<
    { orders: number; items: number; batches: number; customers: number; suppliers: number; legacy_invoices: number }[]
  >`
    select
      (select count(*)::int from public.orders o where not exists (select 1 from app.orders a where a.id = o.order_id)
                                                and not exists (select 1 from app.invoices v where v.id = o.order_id)
                                                and not exists (select 1 from app.quotations q where q.id = o.order_id)) as orders,
      (select count(*)::int from public.order_items i where not exists (select 1 from app.order_items a where a.id = i.order_item_id)
                                                     and not exists (select 1 from app.invoice_items v where v.id = i.order_item_id)
                                                     and not exists (select 1 from app.quotation_items q where q.id = i.order_item_id)) as items,
      (select count(*)::int from public.product_batches b where not exists (select 1 from app.product_batches a where a.id = b.batch_id)) as batches,
      (select count(*)::int from public.customers c where not exists (select 1 from app.customers a where a.id = c.customer_id)) as customers,
      (select count(*)::int from public.suppliers s where not exists (select 1 from app.suppliers a where a.id = s.supplier_id)) as suppliers,
      (select count(*)::int from public.invoices) as legacy_invoices`;

  console.log("\nNot imported:");
  console.log(`  orders/invoices (no customer/company)  ${skipped.orders}`);
  console.log(`  order lines (no product / order)       ${skipped.items}`);
  console.log(`  batches (no product)                   ${skipped.batches}`);
  console.log(`  customers (no company)                 ${skipped.customers}`);
  console.log(`  suppliers (no company)                 ${skipped.suppliers}`);
  console.log(`  rows in legacy public.invoices         ${skipped.legacy_invoices} (unused by the old app; skipped)`);
  if (merged.length) {
    console.log(`\nMerged into existing app users (same username): ${merged.map((u) => u.username).join(", ")}`);
  }

  console.log("\nApp totals:");
  for (const t of ["app.companies", "app.users", "app.products", "app.product_batches", "app.customers", "app.quotations", "app.orders", "app.invoices", "app.user_logs"]) {
    console.log(`  ${t.padEnd(22)} ${await count(tx, t)}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env.local");
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  console.log(DRY_RUN ? "Legacy import — DRY RUN (will roll back)\n" : "Legacy import\n");
  try {
    await client.begin(async (tx) => {
      await run(tx);
      if (DRY_RUN) throw ROLLBACK;
    });
    console.log("\nCommitted.");
  } catch (err) {
    if (err === ROLLBACK) console.log("\nDry run — rolled back, nothing written.");
    else throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
