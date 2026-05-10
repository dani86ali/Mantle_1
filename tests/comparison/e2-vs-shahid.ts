/**
 * E2 vs Shahid TA comparison — diagnostic, not pass/fail
 *
 * Reads Shahid's actual TA workbook BoQ sheet, extracts line items,
 * generates BOMATIC's BoM via E2 functions, then compares line by line.
 *
 * Run: npx tsx tests/comparison/e2-vs-shahid.ts
 */

import * as XLSX from "xlsx";
import { resolve } from "path";
import { selectAccessories } from "../../src/engines/e2/accessory-selector";
import { calculateLicenses, type LicenseConfig } from "../../src/engines/e2/licensing-calculator";
import { selectSupport } from "../../src/engines/e2/support-selector";
import {
  convertCurrency,
  applyVendorDiscount,
  applyInhouseMargin,
  calculateOverhead,
  calculateCostWithOverhead,
  calculateSellingPrice,
  calculateExtendedSell,
} from "../../src/engines/e2/pricing-engine";

// ── Column indices (confirmed by probe — do not change without re-probing) ─────

const COL = {
  category:  2,   // C: Category (HW-HPE, SW-Juniper, HEADER1…)
  vendor:    3,   // D: Vendor name
  sku:       6,   // G: STCS Part Number (actual vendor SKU or category code)
  qty:       9,   // J: Qty
  mult:      10,  // K: Item Price Multiplier (affects extended price)
  unitSell:  77,  // ~: Item Price SAR (unit sell, pre-multiplier)
  extSell:   78,  // ~: Total Price SAR (= unitSell × qty × mult)
} as const;

const XLSX_PATH = resolve(
  __dirname,
  "../fixtures/aramco-storage/expected/BothTA-OP-2025-154381&OP-2025-154398-2016B V35_03 - Sent.xlsx"
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShahidLine {
  sku: string; category: string; vendor: string;
  qty: number; mult: number;
  unitSell: number; extSell: number;
}

interface BomaticLine {
  sku: string; description: string; category: string;
  qty: number; unitSell: number; extSell: number;
}

// ── Pricing parameters (standard STCS Aramco project) ────────────────────────
// Source: typical values from integration tests — update from TA workbook if known

const FX = 3.75;
const OVH = { shipmentPct: 0.03, customPct: 0.02, insurancePct: 0.01,
               whtaxPct: 0.05, zakatPct: 0.025, financePct: 0.03, riskPct: 0.05 };

const LIST_USD: Record<string, number> = {
  "C9300L-24UXG-4X-A": 7500, "C9120AXE-E": 800, "FG-601F": 15000,
  "PWR-C1-1100WAC-P": 400, "PWR-C1-1100WAC-P/2": 400, "C9300L-FAN-1RU": 150,
  "CAB-TA-UK": 25, "C9K-ACC-SCR-4": 15, "CAB-GUIDE-1RU": 20,
  "C9K-ACC-RBFT": 10, "C9300L-SSD-NONE": 1,
  "AIR-AP-BRACKET-1": 30, "AIR-AP-T-RAIL-R": 15, "AIR-ANT2524DW-RS": 75,
  "C9300L-NW-A-24": 2000, "C9300L-DNA-A-24": 1, "C9300L-DNA-A-24-3Y": 1500,
  "TE-EMBEDDED-T": 1, "TE-EMBEDDED-T-3Y": 500, "TE-C9K-SW": 100,
  "D-DNAS-EXT-S-T": 1, "D-DNAS-EXT-S-3Y": 300,
  "S9300LUK9-179": 1, "NETWORK-PNP-LIC": 1,
  "SW9120AX-CAPWAP-K9": 1, "C9120AX-DNA-OPTOUT": 1,
  "CON-SNT-C93024GA": 800, "CON-SNT-C9120AXEE": 100, "FC-10-F601F-247-02": 2500,
};

// ── Price a single line through E2 cost model ─────────────────────────────────

function priceLine(sku: string, description: string, qty: number, category: string): BomaticLine {
  const listSar = convertCurrency(LIST_USD[sku] ?? 0, FX);
  const afterDisc = applyVendorDiscount(listSar, 0.35, 0.08);
  const afterIM = applyInhouseMargin({ netCost: afterDisc, inhouseMarginPct: 0, taVersion: "V35" });
  const ovh = calculateOverhead({ ...OVH, unitAfterDiscount: afterIM });
  const costOH = calculateCostWithOverhead({ unitAfterInhouseMargin: afterIM, overheadTotal: ovh.total, fixedValue: 0 });
  const unitSell = calculateSellingPrice({ mode: "margin", costWithOverhead: costOH, profitPct: 0.18 });
  const extSell = calculateExtendedSell({ unitSellPrice: unitSell, qty, discountEmbedPct: 0, solutionEmbedPct: 0, inhouseEmbedPct: 0 });
  return { sku, description, qty, category, unitSell, extSell };
}

// ── Generate BOMATIC BoM for a set of Cisco/Fortinet devices ─────────────────

const DEFAULT_LIC: LicenseConfig = { dnaTier: "advantage", networkTier: "advantage", term: 3 };

function generateBomaticBom(devices: Array<{ model: string; qty: number }>): BomaticLine[] {
  const lines: BomaticLine[] = [];
  for (const { model, qty } of devices) {
    lines.push(priceLine(model, model, qty, "hardware"));
    try {
      selectAccessories(model, qty, { redundantPsu: true }).forEach((a) =>
        lines.push(priceLine(a.sku, a.description, a.totalQty, "accessory"))
      );
    } catch { /* model not in accessory spec */ }
    const licConfig = /^C9\d+AX/i.test(model) ? { ...DEFAULT_LIC, dnaTier: "optout" as const } : DEFAULT_LIC;
    try {
      calculateLicenses(model, qty, licConfig).forEach((l) =>
        lines.push(priceLine(l.sku, l.description, l.qty, "license"))
      );
    } catch { /* model not in license calculator */ }
    const vendor = /^(FG-|FGT-|FS-|FAP-)/i.test(model) ? "fortinet" : "cisco";
    try {
      selectSupport(model, qty, { criticality: "standard", term: 36, vendor }).forEach((s) =>
        lines.push(priceLine(s.sku, s.description, s.qty, "support"))
      );
    } catch { /* model not in support selector */ }
  }

  // Deduplicate by SKU: sum qty, recalculate extSell
  const seen = new Map<string, BomaticLine>();
  for (const l of lines) {
    const existing = seen.get(l.sku);
    if (existing) {
      existing.qty += l.qty;
      existing.extSell = existing.unitSell * existing.qty;
    } else {
      seen.set(l.sku, { ...l });
    }
  }
  return Array.from(seen.values());
}

// ── Parse Shahid's BoQ sheet ──────────────────────────────────────────────────

function parseShahidBoQ(): ShahidLine[] {
  const wb = XLSX.readFile(XLSX_PATH);
  console.log("Sheets:", wb.SheetNames.join(", "));

  if (!wb.SheetNames.includes("BoQ")) {
    throw new Error("No 'BoQ' sheet found. Available: " + wb.SheetNames.join(", "));
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["BoQ"], { header: 1, defval: "" }) as unknown[][];

  const lines: ShahidLine[] = [];
  for (const raw of rows.slice(1)) {  // skip header row 0
    const row = raw as unknown[];
    const category = String(row[COL.category] ?? "").trim();
    if (!category || /^HEADER\d/i.test(category) || category === "Blank") continue;
    const sku = String(row[COL.sku] ?? "").trim();
    if (!sku) continue;
    const qty = Number(row[COL.qty]);
    if (isNaN(qty) || qty <= 0) continue;
    lines.push({
      sku,
      category,
      vendor: String(row[COL.vendor] ?? "").trim(),
      qty,
      mult: Number(row[COL.mult]) || 1,
      unitSell: Number(row[COL.unitSell]) || 0,
      extSell:  Number(row[COL.extSell])  || 0,
    });
  }
  return lines;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const HR = "─".repeat(78);
  console.log(HR);
  console.log("E2 vs Shahid TA — Diagnostic Comparison");
  console.log("File: BothTA-OP-2025-154381&OP-2025-154398-2016B V35_03 - Sent.xlsx");
  console.log(HR + "\n");

  const shahidLines = parseShahidBoQ();
  console.log(`\nShahid BoQ: ${shahidLines.length} line items parsed`);

  // Detect E2-scoped hardware (Cisco/Fortinet) in Shahid's BoQ
  const E2_HW_RE = /^(C9[2345][0-9]{2}|C91[02356][0-9]{2}[A-Z]|FG-|FGT-|FS-|FAP-)/i;
  const e2Devices = shahidLines
    .filter((l) => E2_HW_RE.test(l.sku) || /^(cisco|fortinet)$/i.test(l.vendor))
    .map((l) => ({ model: l.sku, qty: l.qty }));

  console.log(`E2-scoped hardware detected: ${e2Devices.length}`);
  if (e2Devices.length === 0) {
    const vendors = Array.from(new Set(shahidLines.map((l) => l.vendor).filter(Boolean)));
    console.log(`  Vendors in BoQ: ${vendors.join(", ")}`);
    console.log("  E2 covers Cisco Catalyst switches/APs and Fortinet — none found in this BoQ.");
  } else {
    e2Devices.forEach((d) => console.log(`  - ${d.model} × ${d.qty}`));
  }

  const bomaticLines = generateBomaticBom(e2Devices);
  console.log(`BOMATIC BoM: ${bomaticLines.length} lines generated`);

  // Build comparison maps
  const shahidMap = new Map<string, ShahidLine>(shahidLines.map((l) => [l.sku, l]));
  const bomaticMap = new Map<string, BomaticLine>(bomaticLines.map((l) => [l.sku, l]));
  const allSkus = new Set<string>(Array.from(shahidMap.keys()).concat(Array.from(bomaticMap.keys())));

  const PRICE_TOL = 0.02;
  let exactMatches = 0, qtyMismatches = 0, priceMismatches = 0;
  const inShahidOnly: ShahidLine[] = [];
  const inBomaticOnly: BomaticLine[] = [];
  type PriceDiff = { sku: string; shahidUnitSell: number; bomaticUnitSell: number; diffAmt: number; diffPct: number };
  const priceDiffs: PriceDiff[] = [];

  for (const sku of Array.from(allSkus)) {
    const s = shahidMap.get(sku);
    const b = bomaticMap.get(sku);
    if (s && !b) { inShahidOnly.push(s); continue; }
    if (b && !s) { inBomaticOnly.push(b); continue; }
    if (!s || !b) continue;
    const qtyOk = s.qty === b.qty;
    let priceOk = true;
    let diffAmt = 0, diffPct = 0;
    if (s.unitSell > 0 && b.unitSell > 0) {
      diffAmt = b.unitSell - s.unitSell;
      diffPct = Math.abs(diffAmt) / s.unitSell;
      priceOk = diffPct <= PRICE_TOL;
    }
    if (qtyOk && priceOk) { exactMatches++; }
    else {
      if (!qtyOk) qtyMismatches++;
      if (!priceOk) { priceMismatches++; priceDiffs.push({ sku, shahidUnitSell: s.unitSell, bomaticUnitSell: b.unitSell, diffAmt, diffPct: diffPct * 100 }); }
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`\n${HR}`);
  console.log("COMPARISON REPORT");
  console.log(HR);
  console.log(`Total unique SKUs compared:               ${allSkus.size}`);
  console.log(`  Exact matches (qty + price ≤2%):        ${exactMatches}`);
  console.log(`  Quantity mismatches:                     ${qtyMismatches}`);
  console.log(`  Price mismatches (>2%):                  ${priceMismatches}`);
  console.log(`  In Shahid's BoQ, not in BOMATIC:         ${inShahidOnly.length}`);
  console.log(`  In BOMATIC BoM, not in Shahid's BoQ:     ${inBomaticOnly.length}`);

  if (priceDiffs.length > 0) {
    console.log(`\n── Price mismatches ──`);
    console.log(`${"SKU".padEnd(32)} ${"Shahid SAR".padStart(13)} ${"BOMATIC SAR".padStart(13)} ${"Diff SAR".padStart(12)} ${"Diff%".padStart(7)}`);
    console.log("─".repeat(78));
    for (const d of priceDiffs.sort((a, b) => Math.abs(b.diffAmt) - Math.abs(a.diffAmt))) {
      console.log(
        `${d.sku.padEnd(32)} ${d.shahidUnitSell.toFixed(2).padStart(13)} ${d.bomaticUnitSell.toFixed(2).padStart(13)} ${d.diffAmt.toFixed(2).padStart(12)} ${d.diffPct.toFixed(1).padStart(6)}%`
      );
    }
  }

  if (inShahidOnly.length > 0) {
    console.log(`\n── In Shahid's BoQ, missing from BOMATIC (${inShahidOnly.length}) ──`);
    console.log(`${"Category".padEnd(16)} ${"Vendor".padEnd(12)} ${"SKU".padEnd(30)} ${"Qty".padStart(5)} ${"Mult".padStart(5)} ${"Unit Sell SAR".padStart(14)}`);
    console.log("─".repeat(78));
    for (const l of inShahidOnly) {
      const uprice = l.unitSell > 0 ? l.unitSell.toFixed(2) : "(no price)";
      console.log(
        `${l.category.slice(0,15).padEnd(16)} ${l.vendor.slice(0,11).padEnd(12)} ${l.sku.slice(0,29).padEnd(30)} ${String(l.qty).padStart(5)} ${String(l.mult).padStart(5)} ${uprice.padStart(14)}`
      );
    }
  }

  if (inBomaticOnly.length > 0) {
    console.log(`\n── In BOMATIC BoM, missing from Shahid's BoQ (${inBomaticOnly.length}) ──`);
    console.log(`${"Category".padEnd(16)} ${"SKU".padEnd(32)} ${"Qty".padStart(5)} ${"Unit Sell SAR".padStart(14)}`);
    console.log("─".repeat(78));
    for (const l of inBomaticOnly) {
      const havePrice = LIST_USD[l.sku] !== undefined;
      const uprice = havePrice ? l.unitSell.toFixed(2) : "(no list price)";
      console.log(
        `${l.category.padEnd(16)} ${l.sku.slice(0,31).padEnd(32)} ${String(l.qty).padStart(5)} ${uprice.padStart(14)}`
      );
    }
  }

  console.log(`\n${HR}`);
  console.log("Script complete — diagnostic output only, not pass/fail.");
  console.log(HR);
}

main();
