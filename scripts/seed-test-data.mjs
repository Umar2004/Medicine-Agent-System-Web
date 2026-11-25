/**
 * Seed script: 20 manufacturers, 100 products, 300 batches (3 per product), 20 customers
 * Run from D:\MedicineAgentWeb:  node scripts/seed-test-data.mjs
 */
import postgres from "postgres";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const sql = postgres(process.env.DATABASE_URL);

// ── Helpers ──
const pad = (n, len) => String(n).padStart(len, "0");
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const mmyyyy = (y, m) => `${pad(m, 2)}/${y}`;

// ── Reference data ──
const COMPANY_ID = "00000000-0000-0000-0000-000000000001"; // default company

const COUNTRIES = ["India", "Bangladesh", "China", "Germany", "UK", "USA", "Pakistan", "Turkey", "Egypt", "South Korea"];
const CITIES_KE = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Malindi", "Kitale", "Garissa", "Nyeri"];
const UNITS = ["10's", "14's", "20's", "28's", "30's", "50's", "60's", "90's", "100's", "500ml", "1L"];

const DRUG_PREFIXES = [
  "Amox", "Cipro", "Metro", "Doxy", "Azi", "Ceftri", "Peni", "Erythro", "Clari", "Levo",
  "Omepra", "Panto", "Rabepra", "Lanso", "Esome", "Diclo", "Ibupro", "Para", "Aspir", "Mefen",
  "Atorva", "Rosuva", "Simva", "Prava", "Fluva", "Metfor", "Gliben", "Glimep", "Sita", "Vilda",
  "Amlo", "Nifedi", "Losart", "Valsar", "Telmi", "Lisin", "Enala", "Ramip", "Captop", "Perindo",
  "Cetiri", "Lorata", "Fexo", "Chlorphen", "Diphen", "Deslo", "Bilast", "Ebast", "Mizola", "Rupatad",
];

const DRUG_SUFFIXES = [
  "cillin", "floxacin", "nidazole", "cycline", "thromycin", "axone", "mycin", "zole", "prazole", "fenac",
  "profen", "cetamol", "pirin", "amic acid", "statin", "formin", "clamide", "piride", "gliptin", "dipine",
  "pine", "sartan", "pril", "zine", "dine", "tadine", "astine", "olol", "alol", "mide",
];

const BRAND_ADJECTIVES = [
  "Max", "Plus", "Forte", "Ultra", "Pro", "Super", "Neo", "Bio", "Vita", "Medi",
  "Quick", "Fast", "Prime", "Elite", "Gold", "Silver", "Active", "Total", "Sure", "Care",
];

const MFG_NAMES = [
  "Cipla Ltd", "Sun Pharmaceutical", "Hetero Labs", "Lupin Ltd", "Ranbaxy Laboratories",
  "Dr. Reddy's Laboratories", "Aurobindo Pharma", "Glenmark Pharmaceuticals", "Torrent Pharma", "Cadila Healthcare",
  "Incepta Pharmaceuticals", "Square Pharmaceuticals", "Beximco Pharma", "Renata Ltd", "ACI Limited",
  "Pfizer Inc", "GSK Plc", "Novartis AG", "Bayer AG", "Sanofi SA",
];

const CUSTOMER_DATA = [
  { name: "Safari Pharma Ltd", code: "SPL", city: "Nairobi", contact: "James Ochieng" },
  { name: "Dawa Distributors", code: "DDI", city: "Mombasa", contact: "Fatima Hassan" },
  { name: "Kenya Medical Supplies", code: "KMS", city: "Nairobi", contact: "Peter Kamau" },
  { name: "Afya Healthcare Ltd", code: "AHL", city: "Kisumu", contact: "Grace Otieno" },
  { name: "Medipharm East Africa", code: "MEA", city: "Nakuru", contact: "David Kimani" },
  { name: "PharmaLink Kenya", code: "PLK", city: "Eldoret", contact: "Sarah Wanjiku" },
  { name: "HealthBridge Supplies", code: "HBS", city: "Thika", contact: "Mohammed Ali" },
  { name: "Coast Pharmaceuticals", code: "CPH", city: "Mombasa", contact: "Amina Bakari" },
  { name: "Central Drug House", code: "CDH", city: "Nairobi", contact: "John Mwangi" },
  { name: "Lake Region Pharma", code: "LRP", city: "Kisumu", contact: "Lucy Akinyi" },
  { name: "Rift Valley Medical", code: "RVM", city: "Nakuru", contact: "Samuel Kiplagat" },
  { name: "Equator Pharma Co", code: "EPC", city: "Eldoret", contact: "Faith Chebet" },
  { name: "Savanna Health Ltd", code: "SHL", city: "Garissa", contact: "Ibrahim Omar" },
  { name: "Summit Pharmaceuticals", code: "SMP", city: "Nyeri", contact: "Margaret Wambui" },
  { name: "Tropical Drug Traders", code: "TDT", city: "Malindi", contact: "Hassan Mwinyi" },
  { name: "Mt Kenya Pharma", code: "MKP", city: "Nyeri", contact: "Francis Ngugi" },
  { name: "Lamu Medical Supplies", code: "LMS", city: "Malindi", contact: "Zainab Mohamed" },
  { name: "Highlands Healthcare", code: "HHC", city: "Kitale", contact: "Robert Wafula" },
  { name: "Eagle Pharma Kenya", code: "EPK", city: "Nairobi", contact: "Catherine Njeri" },
  { name: "Baobab Drug Stores", code: "BDS", city: "Mombasa", contact: "Yusuf Abdalla" },
];

const SUPPLIER_NAMES = [
  "Lanka Pharma Distributors", "Colombo Drug House", "Ceylon Medical Supplies",
  "Island Pharma Trading", "Kandy Healthcare Ltd",
];

// ── Main seed ──
async function seed() {
  console.log("🌱 Starting seed...\n");

  // 0. Check existing counts
  const [{ count: existingProducts }] = await sql`SELECT count(*)::int as count FROM app.products WHERE is_deleted = false`;
  const [{ count: existingMfg }] = await sql`SELECT count(*)::int as count FROM app.manufacturers WHERE is_deleted = false`;
  const [{ count: existingCust }] = await sql`SELECT count(*)::int as count FROM app.customers WHERE is_deleted = false AND company_id = ${COMPANY_ID}`;

  console.log(`Existing: ${existingProducts} products, ${existingMfg} manufacturers, ${existingCust} customers`);

  // 1. Get existing number sequences
  const [{ count: totalMfgCount }] = await sql`SELECT count(*)::int as count FROM app.manufacturers`;
  const [{ count: totalProdCount }] = await sql`SELECT count(*)::int as count FROM app.products`;
  const [{ count: totalCustCount }] = await sql`SELECT count(*)::int as count FROM app.customers WHERE company_id = ${COMPANY_ID}`;
  const [{ count: totalSuppCount }] = await sql`SELECT count(*)::int as count FROM app.suppliers WHERE company_id = ${COMPANY_ID}`;

  let mfgSeq = totalMfgCount;
  let prodSeq = totalProdCount;
  let custSeq = totalCustCount;
  let suppSeq = totalSuppCount;

  // 2. Seed Manufacturers (20)
  console.log("\n📭 Seeding 20 manufacturers...");
  const manufacturerIds = [];

  for (let i = 0; i < 20; i++) {
    mfgSeq++;
    const id = randomUUID();
    const mfgNumber = `MFG-${pad(mfgSeq, 8)}`;
    const name = MFG_NAMES[i];
    const country = COUNTRIES[i % COUNTRIES.length];

    try {
      await sql`
        INSERT INTO app.manufacturers (id, manufacturer_number, name, country, contact_info, created_at, updated_at, is_deleted)
        VALUES (${id}, ${mfgNumber}, ${name}, ${country}, ${`+${randInt(1,99)}-${randInt(100,999)}-${randInt(1000000,9999999)}`}, NOW(), NOW(), false)
        ON CONFLICT (manufacturer_number) DO NOTHING
      `;
      manufacturerIds.push(id);
      console.log(`  ✓ ${mfgNumber} — ${name}`);
    } catch (e) {
      // Name might conflict, skip
      console.log(`  ⚠ Skipped ${name}: ${e.message.slice(0, 60)}`);
      // Use existing
      const [existing] = await sql`SELECT id FROM app.manufacturers WHERE name = ${name} AND is_deleted = false LIMIT 1`;
      if (existing) manufacturerIds.push(existing.id);
    }
  }

  // If we didn't get enough, fetch existing ones
  if (manufacturerIds.length < 20) {
    const existing = await sql`SELECT id FROM app.manufacturers WHERE is_deleted = false LIMIT 20`;
    for (const row of existing) {
      if (!manufacturerIds.includes(row.id)) manufacturerIds.push(row.id);
    }
  }

  console.log(`  Total manufacturer IDs available: ${manufacturerIds.length}`);

  // 3. Seed Suppliers (5, company-scoped)
  console.log("\n🏭 Seeding 5 suppliers...");
  const supplierIds = [];

  for (let i = 0; i < 5; i++) {
    suppSeq++;
    const id = randomUUID();
    const suppNumber = `SUPP-${pad(suppSeq, 7)}`;
    const name = SUPPLIER_NAMES[i];

    try {
      await sql`
        INSERT INTO app.suppliers (id, company_id, supplier_number, name, contact_person, phone, address, city, country, created_at, updated_at, is_deleted)
        VALUES (${id}, ${COMPANY_ID}, ${suppNumber}, ${name}, ${`Mr. ${["Perera","Fernando","Silva","Jayawardena","Bandara"][i]}`}, ${`+94-${randInt(70,77)}-${randInt(1000000,9999999)}`}, ${`${randInt(1,999)} ${["Galle Rd","Colombo Rd","Kandy Rd","Main St","Temple Rd"][i]}`}, ${["Colombo","Kandy","Galle","Kurunegala","Matara"][i]}, ${"Sri Lanka"}, NOW(), NOW(), false)
      `;
      supplierIds.push(id);
      console.log(`  ✓ ${suppNumber} — ${name}`);
    } catch (e) {
      console.log(`  ⚠ Skipped ${name}: ${e.message.slice(0, 60)}`);
      const [existing] = await sql`SELECT id FROM app.suppliers WHERE name = ${name} AND company_id = ${COMPANY_ID} AND is_deleted = false LIMIT 1`;
      if (existing) supplierIds.push(existing.id);
    }
  }

  // Also fetch any existing suppliers
  if (supplierIds.length < 3) {
    const existing = await sql`SELECT id FROM app.suppliers WHERE company_id = ${COMPANY_ID} AND is_deleted = false LIMIT 5`;
    for (const row of existing) {
      if (!supplierIds.includes(row.id)) supplierIds.push(row.id);
    }
  }

  // 4. Seed Products (100) + Batches (3 each = 300)
  console.log("\n💊 Seeding 100 products with 3 batches each...");
  let batchCount = 0;

  for (let i = 0; i < 100; i++) {
    prodSeq++;
    const productId = randomUUID();
    const prodNumber = `PROD-${pad(prodSeq, 7)}`;
    const prefix = DRUG_PREFIXES[i % DRUG_PREFIXES.length];
    const suffix = DRUG_SUFFIXES[i % DRUG_SUFFIXES.length];
    const adj = BRAND_ADJECTIVES[i % BRAND_ADJECTIVES.length];
    const genericName = `${prefix}${suffix}`;
    const brandName = `${adj}-${prefix} ${["Tablets","Capsules","Syrup","Injection","Cream","Suspension","Drops"][i % 7]}`;
    const mfgId = manufacturerIds[i % manufacturerIds.length];
    const unit = UNITS[i % UNITS.length];
    const threshold = randInt(50, 200);

    try {
      await sql`
        INSERT INTO app.products (id, product_number, brand_name, generic_name, manufacturer_id, unit, country, low_stock_threshold, created_at, updated_at, is_deleted)
        VALUES (${productId}, ${prodNumber}, ${brandName}, ${genericName}, ${mfgId}, ${unit}, ${pick(COUNTRIES)}, ${threshold}, NOW(), NOW(), false)
      `;

      // Create 3 batches per product
      for (let b = 0; b < 3; b++) {
        const batchId = randomUUID();
        const batchNumber = `BN-${pad(i + 1, 4)}-${String.fromCharCode(65 + b)}`; // BN-0001-A, BN-0001-B, BN-0001-C
        const mfdYear = 2024 + (b === 0 ? 0 : b === 1 ? 1 : 1);
        const mfdMonth = randInt(1, 12);
        const expYear = mfdYear + randInt(2, 4);
        const expMonth = mfdMonth;
        const stock = randInt(100, 5000);
        const costLKR = (randInt(50, 5000) + randInt(0, 99) / 100).toFixed(2);
        const priceType = pick(["wholesale", "retail"]);
        const supplierId = supplierIds.length > 0 ? pick(supplierIds) : null;

        await sql`
          INSERT INTO app.product_batches (id, batch_number, product_id, supplier_id, mfd, exp, stock_quantity, cost_price, price_type, is_active, created_at, updated_at, is_deleted)
          VALUES (${batchId}, ${batchNumber}, ${productId}, ${supplierId}, ${mmyyyy(mfdYear, mfdMonth)}, ${mmyyyy(expYear, expMonth)}, ${stock}, ${costLKR}, ${priceType}, true, NOW(), NOW(), false)
        `;
        batchCount++;
      }

      if ((i + 1) % 10 === 0) console.log(`  ✓ ${i + 1}/100 products + ${batchCount} batches`);
    } catch (e) {
      console.log(`  ⚠ Product ${prodNumber}: ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`  Total batches created: ${batchCount}`);

  // 5. Seed Customers (20, company-scoped)
  console.log("\n👥 Seeding 20 customers...");

  for (let i = 0; i < 20; i++) {
    custSeq++;
    const id = randomUUID();
    const custNumber = `CUSTOMER-${pad(custSeq, 7)}`;
    const c = CUSTOMER_DATA[i];

    try {
      await sql`
        INSERT INTO app.customers (id, company_id, customer_number, code, name, business_name, contact_person, phone, email, address, city, country, created_at, updated_at, is_deleted)
        VALUES (${id}, ${COMPANY_ID}, ${custNumber}, ${c.code}, ${c.name}, ${c.name}, ${c.contact}, ${`+254-${randInt(700,799)}-${randInt(100000,999999)}`}, ${`${c.code.toLowerCase()}@${c.name.toLowerCase().replace(/\s+/g, "")}.co.ke`}, ${`${randInt(1,999)} ${c.city} Highway`}, ${c.city}, ${"Kenya"}, NOW(), NOW(), false)
      `;
      console.log(`  ✓ ${custNumber} (${c.code}) — ${c.name}`);
    } catch (e) {
      console.log(`  ⚠ Skipped ${c.name}: ${e.message.slice(0, 80)}`);
    }
  }

  // 6. Summary
  const [{ count: finalProducts }] = await sql`SELECT count(*)::int as count FROM app.products WHERE is_deleted = false`;
  const [{ count: finalBatches }] = await sql`SELECT count(*)::int as count FROM app.product_batches WHERE is_deleted = false`;
  const [{ count: finalMfg }] = await sql`SELECT count(*)::int as count FROM app.manufacturers WHERE is_deleted = false`;
  const [{ count: finalCust }] = await sql`SELECT count(*)::int as count FROM app.customers WHERE is_deleted = false AND company_id = ${COMPANY_ID}`;
  const [{ count: finalSupp }] = await sql`SELECT count(*)::int as count FROM app.suppliers WHERE is_deleted = false AND company_id = ${COMPANY_ID}`;

  console.log("\n✅ Seed complete!");
  console.log(`   Products:      ${finalProducts}`);
  console.log(`   Batches:       ${finalBatches}`);
  console.log(`   Manufacturers: ${finalMfg}`);
  console.log(`   Customers:     ${finalCust}`);
  console.log(`   Suppliers:     ${finalSupp}`);

  await sql.end();
}

seed().catch(async (e) => {
  console.error("❌ Seed failed:", e);
  await sql.end();
  process.exit(1);
});
