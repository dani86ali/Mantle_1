/**
 * Catalog Tier-1 extractor: Tender Analyzer (TA) + Cisco CCW Estimate
 *
 * Reads bid workbooks from STC's Google Drive archive, extracts catalog
 * entries (SKU + price + observations), merges with existing
 * src/lib/adapters/_mock-data/catalog-responses.json.
 *
 * Spec: see prompt at top of session OR the tier1 prompt cycle.
 * Run from worktree root: npx tsx scripts/extract-catalog-tier1.ts
 */

import xlsx from "xlsx";
import { readFileSync, writeFileSync, statSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";

// ─── Config ─────────────────────────────────────────────────────────────

const STC_ROOT =
  "G:/.shortcut-targets-by-id/1Kq5k2BgSspSB8Lnssy49zHoxroYTwYmi/STC";
const INVENTORY = "../bomatic_planning/parser_strategies/INVENTORY.md";
const EXISTING_CATALOG = "src/lib/adapters/_mock-data/catalog-responses.json";
const OUTPUT_CATALOG = "src/lib/adapters/_mock-data/catalog-responses.json";
const LOG_DIR = "../bomatic_planning/extractors";

const MIN_FILE_KB = 1;
const MIN_PRICE = 10;
const PRICE_DRIFT_WARN_RATIO = 0.10;

// ─── Types ──────────────────────────────────────────────────────────────

interface InventoryRow {
  path: string;
  customer: string;
  opId: string;
  sizeKB: number;
  family: string;
}

interface Candidate {
  sku: string;
  description: string;
  vendor: string;
  listPrice: number;
  currency: string;
  unit?: string;
  supplier?: string | null;
  supplierDiscountPercent?: number | null;
  marginTargetPercent?: number | null;
  otcMrc?: string | null;
  smartAccountMandatory?: boolean;
  serviceDurationMonths?: number | null;
  leadTimeHint?: string | null;
  l1Code?: string | null;
  l2Code?: string | null;
  l3Code?: string | null;
  opportunityId: string;
  observedAt: string;
  source: string;
  parser: "TA" | "CCW";
}

interface CatalogEntry {
  sku: string;
  description: string;
  vendor: string;
  listPrice: number;
  currency: string;
  unit?: string;
  supplier?: string | null;
  supplierDiscountPercent?: number | null;
  marginTargetPercent?: number | null;
  otcMrc?: string | null;
  smartAccountMandatory: boolean;
  serviceDurationMonths?: number | null;
  leadTimeHint?: string | null;
  l1Code?: string | null;
  l2Code?: string | null;
  l3Code?: string | null;
  productCategory: string;
  productFamily: string;
  priceListId: string;
  available: boolean;
  regionAvailability: string[];
  eoxInfo: { isEox: boolean };
  leadTimeDays: number;
  bidFrequency: number;
  priceObservations: Array<{
    opportunityId: string;
    listPrice: number;
    observedAt: string;
    source: string;
  }>;
  priceDrift: {
    min: number;
    median: number;
    max: number;
    stdev: number;
    suspectedFxBug?: boolean;
  };
  source: string;
}

// ─── Logging ────────────────────────────────────────────────────────────

const TS = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_FILE = join(LOG_DIR, `run-log-${TS}.txt`);
mkdirSync(LOG_DIR, { recursive: true });

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
}

// ─── INVENTORY parsing ──────────────────────────────────────────────────

function loadInventory(): InventoryRow[] {
  const raw = readFileSync(INVENTORY, "utf-8");
  const lines = raw.split("\n");
  const rows: InventoryRow[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("| Path |")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (line.startsWith("|---")) continue;
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    // Columns: | Path | Customer | OpId | KB | Family | Reason |
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 7) continue;
    const pathCell = parts[1].replace(/^`|`$/g, "");
    const customer = parts[2];
    const opId = parts[3];
    const kb = parseInt(parts[4], 10) || 0;
    const family = parts[5];
    if (!pathCell || !family) continue;
    rows.push({ path: pathCell, customer, opId, sizeKB: kb, family });
  }
  return rows;
}

function filterTier1(rows: InventoryRow[]): InventoryRow[] {
  const estimateRe = /Estimate_[A-Z]{2}\d{9}[A-Z]{2}\.xlsx$/i;
  return rows.filter(
    (r) =>
      r.family === "tender_analyzer" ||
      (r.family === "unknown" && estimateRe.test(r.path))
  );
}

// ─── XLSX helpers ───────────────────────────────────────────────────────

function openWorkbook(absPath: string): xlsx.WorkBook | null {
  try {
    const buf = readFileSync(absPath);
    return xlsx.read(buf, { cellFormula: false, cellHTML: false, cellDates: false });
  } catch (e) {
    return null;
  }
}

function cellVal(ws: xlsx.WorkSheet, addr: string): unknown {
  const c = ws[addr];
  return c ? c.v : undefined;
}

function cellNum(ws: xlsx.WorkSheet, addr: string): number | null {
  const v = cellVal(ws, addr);
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cellStr(ws: xlsx.WorkSheet, addr: string): string {
  const v = cellVal(ws, addr);
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

// ─── Parser 1: Tender Analyzer ──────────────────────────────────────────

function findTASheet(wb: xlsx.WorkBook): xlsx.WorkSheet | null {
  // Preferred names
  for (const name of ["BoQ", "Detailed Bid Costing"]) {
    if (wb.SheetNames.includes(name)) return wb.Sheets[name];
  }
  // Fallback: first sheet whose row 1 A1/B1/C1 contains "Item # as per RFP"
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const headerProbe = `${cellStr(ws, "A1")} ${cellStr(ws, "B1")} ${cellStr(ws, "C1")}`;
    if (/Item\s*#\s*as\s*per\s*RFP/i.test(headerProbe)) return ws;
  }
  return null;
}

function parseTA(
  absPath: string,
  relPath: string,
  opportunityId: string,
  observedAt: string
): { entries: Candidate[]; warning?: string } {
  const wb = openWorkbook(absPath);
  if (!wb) return { entries: [], warning: "could not open workbook" };
  const ws = findTASheet(wb);
  if (!ws || !ws["!ref"]) return { entries: [], warning: "no recognizable BoQ sheet" };

  const range = xlsx.utils.decode_range(ws["!ref"]);
  const out: Candidate[] = [];
  const source = `TA ${relPath.split(/[\\/]/).pop()}`;

  for (let r = 5; r <= range.e.r; r++) {
    const row = r + 1;
    const sku = cellStr(ws, `G${row}`);
    if (!sku) continue;
    const vendor = normalizeVendor(cellStr(ws, `D${row}`));
    if (!vendor) continue;
    const listPrice = cellNum(ws, `L${row}`);
    if (listPrice === null || listPrice < MIN_PRICE) continue;

    out.push({
      sku,
      description: cellStr(ws, `H${row}`),
      vendor,
      listPrice,
      currency: "USD",
      unit: cellStr(ws, `I${row}`) || undefined,
      supplier: cellStr(ws, `E${row}`) || null,
      supplierDiscountPercent: cellNum(ws, `AD${row}`),
      marginTargetPercent: cellNum(ws, `DH${row}`),
      otcMrc: cellStr(ws, `V${row}`) || null,
      leadTimeHint: cellStr(ws, `N${row}`) || null,
      l1Code: cellStr(ws, `Q${row}`) || null,
      l2Code: cellStr(ws, `R${row}`) || null,
      l3Code: cellStr(ws, `S${row}`) || null,
      opportunityId,
      observedAt,
      source,
      parser: "TA",
    });
  }
  return { entries: out };
}

// ─── Parser 2: Cisco CCW Estimate ───────────────────────────────────────

function findCCWSheet(wb: xlsx.WorkBook): xlsx.WorkSheet | null {
  const re = /^EstimateDetails_[A-Z]{2}\d{9}[A-Z]{2}$/i;
  for (const name of wb.SheetNames) {
    if (re.test(name)) return wb.Sheets[name];
  }
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (
      /Line Number/i.test(cellStr(ws, "A1")) &&
      /Item Name/i.test(cellStr(ws, "B1"))
    ) {
      return ws;
    }
  }
  return null;
}

function parseCCW(
  absPath: string,
  relPath: string,
  opportunityId: string,
  observedAt: string
): { entries: Candidate[]; warning?: string } {
  const wb = openWorkbook(absPath);
  if (!wb) return { entries: [], warning: "could not open workbook" };
  const ws = findCCWSheet(wb);
  if (!ws || !ws["!ref"]) return { entries: [], warning: "no recognizable CCW sheet" };

  const range = xlsx.utils.decode_range(ws["!ref"]);
  const out: Candidate[] = [];
  const source = `CCW ${relPath.split(/[\\/]/).pop()}`;

  for (let r = 1; r <= range.e.r; r++) {
    const row = r + 1;
    const sku = cellStr(ws, `B${row}`);
    if (!sku) continue;
    if (cellStr(ws, `H${row}`).toLowerCase() === "yes") continue; // bundle child
    const listPrice = cellNum(ws, `K${row}`);
    if (listPrice === null || listPrice <= 0) continue;

    const smartMandatoryStr = cellStr(ws, `C${row}`).toLowerCase();
    const leadTimeDays = cellNum(ws, `G${row}`);
    const serviceMonths = cellNum(ws, `F${row}`);

    out.push({
      sku,
      description: cellStr(ws, `D${row}`),
      vendor: "Cisco",
      listPrice,
      currency: "USD",
      smartAccountMandatory: smartMandatoryStr === "yes",
      serviceDurationMonths: serviceMonths,
      leadTimeHint: leadTimeDays !== null ? `CCW lead time ${leadTimeDays}d` : null,
      opportunityId,
      observedAt,
      source,
      parser: "CCW",
    });
  }
  return { entries: out };
}

// ─── Heuristics ─────────────────────────────────────────────────────────

function normalizeVendor(v: string): string {
  if (!v) return "";
  const trimmed = v.trim();
  if (/^cisco\s*systems?$/i.test(trimmed) || /^cisco$/i.test(trimmed)) return "Cisco";
  if (/^hpe?$/i.test(trimmed) || /^hewlett.?packard/i.test(trimmed)) return "HPE";
  if (/^juniper/i.test(trimmed)) return "Juniper";
  if (/^polycom/i.test(trimmed)) return "Polycom";
  if (/^fortinet/i.test(trimmed)) return "Fortinet";
  if (/^nvidia/i.test(trimmed)) return "NVIDIA";
  if (/^huawei/i.test(trimmed)) return "Huawei";
  if (/^aruba/i.test(trimmed)) return "Aruba";
  if (/^netapp/i.test(trimmed)) return "NetApp";
  if (/^dell/i.test(trimmed)) return "Dell";
  if (/^ddn/i.test(trimmed)) return "DDN";
  if (/^avaya/i.test(trimmed)) return "Avaya";
  // Title-case fallback for unknown vendors
  return trimmed.replace(/\s+/g, " ");
}

function classifyCategory(sku: string, vendor: string): string {
  const s = sku.toUpperCase();
  if (s.startsWith("CON-")) return "service";
  if (/-[135]Y$/.test(s)) return "subscription";
  if (vendor === "Cisco" && /-DNA-|-NW-/.test(s)) return "license";
  if (/-PWR-|-FAN-|-BLANK|-COVER|-ANT/.test(s)) return "accessory";
  return "hardware";
}

function classifyFamily(sku: string, vendor: string): string {
  if (vendor !== "Cisco") return `${vendor} (unclassified)`;
  const s = sku.toUpperCase();
  const map: Array<[RegExp, string]> = [
    [/^C9300L/, "Catalyst 9300L Series"],
    [/^C9300/, "Catalyst 9300 Series"],
    [/^C9400X/, "Catalyst 9400X Series"],
    [/^C9400/, "Catalyst 9400 Series"],
    [/^C9500/, "Catalyst 9500 Series"],
    [/^C9600/, "Catalyst 9600 Series"],
    [/^C9410R/, "Catalyst 9400 Series"],
    [/^C9120/, "Catalyst 9100 Wireless"],
    [/^C9130/, "Catalyst 9100 Wireless"],
    [/^C9166/, "Catalyst 9100 Wireless"],
    [/^C9800/, "Catalyst 9800 Wireless Controller"],
    [/^C8300/, "Catalyst 8300 Series"],
    [/^C8500/, "Catalyst 8500 Series"],
    [/^ISR4/, "ISR 4000 Series"],
    [/^ASR1/, "ASR 1000 Series"],
    [/^CON-/, "SmartNet"],
    [/^N9K/, "Nexus 9000"],
    [/^N5K/, "Nexus 5000"],
    [/^N7K/, "Nexus 7000"],
    [/^N3K/, "Nexus 3000"],
    [/^UCS/, "UCS"],
    [/^FPR/, "Firepower"],
    [/^MX/, "Meraki MX"],
    [/^MS/, "Meraki MS"],
    [/^MR/, "Meraki MR"],
    [/^CTI-CMS/, "Cisco Meeting Server"],
    [/^CP-/, "IP Phone"],
    [/^AIR-/, "Aironet Wireless"],
  ];
  for (const [re, fam] of map) if (re.test(s)) return fam;
  return "Cisco (unclassified)";
}

function inferLeadTimeDays(category: string): number {
  if (category === "hardware") return 28;
  if (category === "license" || category === "subscription") return 0;
  if (category === "accessory") return 7;
  if (category === "service") return 0;
  return 14;
}

function inferSmartAccountMandatory(category: string, vendor: string): boolean {
  if (vendor !== "Cisco") return false;
  return category === "license" || category === "subscription";
}

function parseOpId(path: string): string {
  const m = path.match(/OP-\d{4}-\d{6}/);
  if (m) return m[0];
  // Estimate_<id> fallback — use the id itself
  const eId = path.match(/Estimate_([A-Z]{2}\d{9}[A-Z]{2})/i);
  if (eId) return `CCW-${eId[1]}`;
  // Final fallback — use the filename
  return path.split(/[\\/]/).pop() ?? path;
}

// ─── Dedupe + canonicalize ──────────────────────────────────────────────

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stdev(nums: number[]): number {
  if (nums.length <= 1) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  const v = nums.reduce((a, b) => a + (b - m) ** 2, 0) / nums.length;
  return Math.sqrt(v);
}

function dedupe(
  candidates: Candidate[]
): { entries: Record<string, CatalogEntry>; driftWarnings: number } {
  // Collapse per (sku, opportunityId) — one observation per opportunity
  // Use Records (plain objects) to sidestep Map iteration target requirements
  const perOpp: Record<string, Record<string, Candidate>> = {};
  for (const c of candidates) {
    const opps = perOpp[c.sku] ?? (perOpp[c.sku] = {});
    const existing = opps[c.opportunityId];
    // Keep the highest-price row if multiple in same opportunity (avoid bundle 0s)
    if (!existing || c.listPrice > existing.listPrice) opps[c.opportunityId] = c;
  }

  const out: Record<string, CatalogEntry> = {};
  let driftWarnings = 0;

  for (const sku of Object.keys(perOpp)) {
    const opps = perOpp[sku];
    const obs: Candidate[] = Object.values(opps).sort(
      (a, b) => a.observedAt.localeCompare(b.observedAt)
    );
    const canonical = obs[obs.length - 1]; // most recent
    const prices = obs.map((o) => o.listPrice);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const pMed = median(prices);
    const pStd = stdev(prices);
    const driftRatio = pMed === 0 ? 0 : (pMax - pMin) / pMed;
    const suspectedFx = driftRatio > 0.50;
    if (driftRatio > PRICE_DRIFT_WARN_RATIO) driftWarnings++;

    const category = classifyCategory(sku, canonical.vendor);
    const family = classifyFamily(sku, canonical.vendor);
    const smartMand =
      canonical.smartAccountMandatory ?? inferSmartAccountMandatory(category, canonical.vendor);
    const leadTimeDays =
      canonical.parser === "CCW" && canonical.leadTimeHint
        ? parseLeadTimeFromHint(canonical.leadTimeHint, category)
        : inferLeadTimeDays(category);

    out[sku] = {
      sku,
      description: canonical.description,
      vendor: canonical.vendor,
      listPrice: canonical.listPrice,
      currency: canonical.currency,
      unit: canonical.unit,
      supplier: canonical.supplier ?? null,
      supplierDiscountPercent: canonical.supplierDiscountPercent ?? null,
      marginTargetPercent: canonical.marginTargetPercent ?? null,
      otcMrc: canonical.otcMrc ?? null,
      smartAccountMandatory: smartMand,
      serviceDurationMonths: canonical.serviceDurationMonths ?? null,
      leadTimeHint: canonical.leadTimeHint ?? null,
      l1Code: canonical.l1Code ?? null,
      l2Code: canonical.l2Code ?? null,
      l3Code: canonical.l3Code ?? null,
      productCategory: category,
      productFamily: family,
      priceListId: "Global Price List Emerging (USD)",
      available: true,
      regionAvailability: ["EMEAR", "APJC", "AMER", "MEA"],
      eoxInfo: { isEox: false },
      leadTimeDays,
      bidFrequency: obs.length,
      priceObservations: obs.map((o) => ({
        opportunityId: o.opportunityId,
        listPrice: o.listPrice,
        observedAt: o.observedAt,
        source: o.source,
      })),
      priceDrift: { min: pMin, median: pMed, max: pMax, stdev: pStd, ...(suspectedFx ? { suspectedFxBug: true } : {}) },
      source: `${canonical.source}${obs.length > 1 ? ` (+${obs.length - 1} other bids)` : ""}`,
    };
  }

  return { entries: out, driftWarnings };
}

function parseLeadTimeFromHint(hint: string, category: string): number {
  const m = hint.match(/(\d+)\s*d/i);
  if (m) return parseInt(m[1], 10);
  return inferLeadTimeDays(category);
}

// ─── Merge with existing ────────────────────────────────────────────────

interface MergeStats {
  replaced: number;
  kept: number;
  inserted: number;
}

function mergeWithExisting(
  extracted: Record<string, CatalogEntry>,
  existing: Record<string, any>
): { merged: Record<string, any>; stats: MergeStats } {
  const merged: Record<string, any> = { ...existing };
  const stats: MergeStats = { replaced: 0, kept: 0, inserted: 0 };
  for (const sku of Object.keys(extracted)) {
    const entry = extracted[sku];
    if (sku in merged) {
      const desc: string = merged[sku].description ?? "";
      if (/\[DEMO STUB price\]/i.test(desc)) {
        merged[sku] = entry;
        stats.replaced++;
      } else {
        stats.kept++;
      }
    } else {
      merged[sku] = entry;
      stats.inserted++;
    }
  }
  return { merged, stats };
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const t0 = Date.now();
  log(`Tier-1 extractor starting`);
  log(`Inventory: ${INVENTORY}`);
  log(`Output:    ${OUTPUT_CATALOG}`);
  log(`Log:       ${LOG_FILE}`);

  const allRows = loadInventory();
  log(`Inventory rows parsed: ${allRows.length}`);
  let targets = filterTier1(allRows);
  log(`Tier-1 targets: ${targets.length} (TA + Estimate_*)`);

  const maxFiles = parseInt(process.env.MAX_FILES ?? "", 10);
  if (Number.isFinite(maxFiles) && maxFiles > 0) {
    targets = targets.slice(0, maxFiles);
    log(`MAX_FILES=${maxFiles} → processing ${targets.length} files (smoke mode)`);
  }

  const candidates: Candidate[] = [];
  const failures: Array<{ path: string; reason: string }> = [];
  const successfulFiles: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const absPath = join(STC_ROOT, t.path);
    const tag = `[${i + 1}/${targets.length}]`;
    const fname = t.path.split(/[\\/]/).pop() ?? t.path;

    // size check
    let statSize: number, statMtime: Date;
    try {
      const s = statSync(absPath);
      statSize = s.size;
      statMtime = s.mtime;
    } catch (e) {
      // Retry once for streaming
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const s = statSync(absPath);
        statSize = s.size;
        statMtime = s.mtime;
      } catch (e2) {
        log(`${tag} FAIL (stat): ${fname} — ${(e2 as Error).message}`);
        failures.push({ path: t.path, reason: `stat failed: ${(e2 as Error).message}` });
        continue;
      }
    }

    if (statSize < MIN_FILE_KB * 1024) {
      log(`${tag} SKIP (too small ${statSize}B): ${fname}`);
      failures.push({ path: t.path, reason: `file < ${MIN_FILE_KB}KB (${statSize}B)` });
      continue;
    }

    const observedAt = statMtime.toISOString().slice(0, 10);
    const opportunityId = parseOpId(t.path);

    const isCCW = /Estimate_[A-Z]{2}\d{9}[A-Z]{2}\.xlsx$/i.test(t.path);
    const { entries, warning } = isCCW
      ? parseCCW(absPath, t.path, opportunityId, observedAt)
      : parseTA(absPath, t.path, opportunityId, observedAt);

    if (warning) {
      log(`${tag} FAIL: ${fname} — ${warning}`);
      failures.push({ path: t.path, reason: warning });
      continue;
    }
    if (entries.length === 0) {
      log(`${tag} extracted 0 entries: ${fname}`);
      failures.push({ path: t.path, reason: "0 priced rows" });
      continue;
    }
    candidates.push(...entries);
    successfulFiles.push(t.path);
    log(`${tag} extracted ${entries.length}: ${fname}`);
  }

  log(`Total candidates pre-dedupe: ${candidates.length}`);
  log(`Successful files: ${successfulFiles.length} / ${targets.length}`);

  const { entries: extracted, driftWarnings } = dedupe(candidates);
  log(`Unique SKUs after dedupe: ${Object.keys(extracted).length}`);
  log(`Price-drift warnings (>10%): ${driftWarnings}`);

  // Load existing catalog
  const existingRaw = JSON.parse(readFileSync(EXISTING_CATALOG, "utf-8"));
  const existingItems = existingRaw.items as Record<string, any>;
  const existingErrors = existingRaw.errors ?? {};

  const { merged, stats } = mergeWithExisting(extracted, existingItems);
  log(`Merge — replaced stubs: ${stats.replaced}, kept existing: ${stats.kept}, inserted: ${stats.inserted}`);
  log(`Final SKU count: ${Object.keys(merged).length}`);

  // Sort by SKU
  const sortedItems: Record<string, any> = {};
  for (const k of Object.keys(merged).sort()) sortedItems[k] = merged[k];

  // Per-vendor / per-category counts
  const byVendor: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const e of Object.values(sortedItems) as any[]) {
    const v = e.vendor ?? "Cisco";
    byVendor[v] = (byVendor[v] ?? 0) + 1;
    const c = e.productCategory ?? "hardware";
    byCategory[c] = (byCategory[c] ?? 0) + 1;
  }

  const output = {
    _metadata: {
      lastExtractedAt: new Date().toISOString(),
      extractorVersion: "1.0",
      workbooksProcessed: targets.length,
      workbooksSucceeded: successfulFiles.length,
      workbooksFailed: failures,
      stubsReplaced: stats.replaced,
      stubsKept: stats.kept,
      insertedFromExtraction: stats.inserted,
      skusByVendor: byVendor,
      skusByCategory: byCategory,
      priceDriftWarnings: driftWarnings,
      wallClockSeconds: Math.round((Date.now() - t0) / 1000),
    },
    items: sortedItems,
    errors: existingErrors,
  };

  mkdirSync(dirname(OUTPUT_CATALOG), { recursive: true });
  writeFileSync(OUTPUT_CATALOG, JSON.stringify(output, null, 2));
  log(`Wrote ${OUTPUT_CATALOG} (${Object.keys(sortedItems).length} SKUs)`);
  log(`Done in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => {
  log(`FATAL: ${(e as Error).message}\n${(e as Error).stack ?? ""}`);
  process.exit(1);
});
