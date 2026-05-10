import { describe, it, expect, beforeAll } from "vitest";
import { selectAccessories } from "@/engines/e2/accessory-selector";
import { calculateLicenses } from "@/engines/e2/licensing-calculator";
import { selectSupport } from "@/engines/e2/support-selector";
import {
  convertCurrency,
  applyVendorDiscount,
  applyInhouseMargin,
  calculateOverhead,
  calculateCostWithOverhead,
  calculateSellingPrice,
  calculateExtendedSell,
} from "@/engines/e2/pricing-engine";
import { calculateRevenueSplit } from "@/engines/e2/revenue-split";
import { calculateVAT } from "@/engines/e2/vat";

// ── Pricing parameters (user-supplied) ────────────────────────────────────────

const FX = 3.75;
const PARTNER = 0.35;
const DEAL_REG = 0.08;
const MARGIN = 0.18;
const VAT_RATE = 0.15;   // KSA (SA country)
const STCS_SPLIT = 0.85;

const OVERHEAD: Parameters<typeof calculateOverhead>[0] = {
  unitAfterDiscount: 0, // overwritten per call
  shipmentPct: 0.03, customPct: 0.02, insurancePct: 0.01,
  whtaxPct: 0.05, zakatPct: 0.025, financePct: 0.03, riskPct: 0.05,
};

// USD list prices — in production these come from the CCW / FortiCare catalog
const LIST_USD: Record<string, number> = {
  // hardware
  "C9300L-24UXG-4X-A": 7500, "C9120AXE-E": 800, "FG-601F": 15000,
  // switch accessories
  "PWR-C1-1100WAC-P": 400, "PWR-C1-1100WAC-P/2": 400,
  "C9300L-FAN-1RU": 150, "CAB-TA-UK": 25,
  "C9K-ACC-SCR-4": 15, "CAB-GUIDE-1RU": 20, "C9K-ACC-RBFT": 10, "C9300L-SSD-NONE": 1,
  // AP accessories
  "AIR-AP-BRACKET-1": 30, "AIR-AP-T-RAIL-R": 15, "AIR-ANT2524DW-RS": 75,
  // switch licenses (parent SKUs are $1 — they are ordering placeholders, not priced lines)
  "C9300L-NW-A-24": 2000, "C9300L-DNA-A-24": 1, "C9300L-DNA-A-24-3Y": 1500,
  "TE-EMBEDDED-T": 1, "TE-EMBEDDED-T-3Y": 500, "TE-C9K-SW": 100,
  "D-DNAS-EXT-S-T": 1, "D-DNAS-EXT-S-3Y": 300,
  "S9300LUK9-179": 1, "NETWORK-PNP-LIC": 1,
  // AP licenses
  "SW9120AX-CAPWAP-K9": 1, "C9120AX-DNA-OPTOUT": 1,
  // support
  "CON-SNT-C9300L24UXG4XA": 800, "CON-SNT-C9120AXEE": 100, "FC-10-F601F-247-02": 2500,
};

// ── Priced BoM line type ──────────────────────────────────────────────────────

interface PricedLine {
  sku: string; description: string; qty: number; category: string;
  listPriceUsd: number; listPriceSar: number; afterDiscount: number;
  costWithOverhead: number; unitSellPrice: number; extendedSell: number;
  stcsAmount: number; partnerAmount: number; vatAmount: number; totalWithVat: number;
}

// ── CS-001 → CS-009 applied to one line ──────────────────────────────────────

function price(sku: string, description: string, qty: number, category: string): PricedLine {
  const listPriceUsd = LIST_USD[sku] ?? 100; // fallback for unlisted SKUs
  const listPriceSar = convertCurrency(listPriceUsd, FX);
  const afterDiscount = applyVendorDiscount(listPriceSar, PARTNER, DEAL_REG);
  const afterIM = applyInhouseMargin({ netCost: afterDiscount, inhouseMarginPct: 0, taVersion: "V34" });
  const ovh = calculateOverhead({ ...OVERHEAD, unitAfterDiscount: afterDiscount });
  const costWithOverhead = calculateCostWithOverhead({ unitAfterInhouseMargin: afterIM, overheadTotal: ovh.total, fixedValue: 0 });
  const unitSellPrice = calculateSellingPrice({ mode: "margin", costWithOverhead, profitPct: MARGIN });
  const extendedSell = calculateExtendedSell({ unitSellPrice, qty, discountEmbedPct: 0, solutionEmbedPct: 0, inhouseEmbedPct: 0 });
  const { stcsAmount, partnerAmount } = calculateRevenueSplit({ sellAmount: extendedSell, stcsSplitPct: STCS_SPLIT, partnerSplitPct: 1 - STCS_SPLIT });
  const { vatAmount, totalWithVat } = calculateVAT({ sellPrice: extendedSell, vatRate: VAT_RATE });
  return { sku, description, qty, category, listPriceUsd, listPriceSar, afterDiscount, costWithOverhead, unitSellPrice, extendedSell, stcsAmount, partnerAmount, vatAmount, totalWithVat };
}

// ── BoM construction: accessory → license → support → pricing per line ────────

function buildBom(): PricedLine[] {
  const lines: PricedLine[] = [];

  // ── Device 1: C9300L-24UXG-4X-A qty=2 (redundant PSU, SA) ─────────────────

  const sw = "C9300L-24UXG-4X-A";
  lines.push(price(sw, "Cisco Catalyst 9300L 24-port mGig switch", 2, "hardware"));

  selectAccessories(sw, 2, { redundantPsu: true }).forEach((a) =>
    lines.push(price(a.sku, a.description, a.totalQty, a.category))
  );

  calculateLicenses(sw, 2, {
    dnaTier: "advantage", networkTier: "advantage", term: 3,
    includeThousandEyes: true, includeDnaSpaces: true,
  }).forEach((l) => lines.push(price(l.sku, l.description, l.qty, l.category)));

  selectSupport(sw, 2, { criticality: "standard", term: 36, vendor: "cisco" }).forEach((s) =>
    lines.push(price(s.sku, s.description, s.qty, "support"))
  );

  // ── Device 2: C9120AXE-E qty=8 ─────────────────────────────────────────────

  const ap = "C9120AXE-E";
  lines.push(price(ap, "Cisco Catalyst 9120AX Wi-Fi 6 AP (external ant)", 8, "hardware"));

  selectAccessories(ap, 8, {}).forEach((a) =>
    lines.push(price(a.sku, a.description, a.totalQty, a.category))
  );

  calculateLicenses(ap, 8, { dnaTier: "optout", networkTier: "essentials", term: 3 }).forEach((l) =>
    lines.push(price(l.sku, l.description, l.qty, l.category))
  );

  selectSupport(ap, 8, { criticality: "standard", term: 36, vendor: "cisco" }).forEach((s) =>
    lines.push(price(s.sku, s.description, s.qty, "support"))
  );

  // ── Device 3: FG-601F qty=2 (Fortinet — PSU/chassis included, no Cisco steps) ──

  const fw = "FG-601F";
  lines.push(price(fw, "Fortinet FortiGate 601F NGFW", 2, "hardware"));

  selectSupport(fw, 2, { criticality: "standard", term: 36, vendor: "fortinet" }).forEach((s) =>
    lines.push(price(s.sku, s.description, s.qty, "support"))
  );

  return lines;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("E2 full pipeline — 3-device BoM without AI (FX 3.75 | Partner 35% | Deal 8% | Margin 18%)", () => {
  let bom: PricedLine[];

  beforeAll(() => {
    bom = buildBom();

    console.log("\n═══════════════════════════════════════════════════════════════════════════");
    console.log("E2 FULL PIPELINE — PRICED BoM  |  KSA SAR  |  VAT 15%  |  STCS 85%");
    console.log("═══════════════════════════════════════════════════════════════════════════");
    console.table(
      bom.map((l, i) => ({
        "#": String(i + 1).padStart(2),
        Category: l.category.padEnd(16),
        SKU: l.sku.padEnd(30),
        Qty: l.qty,
        "List USD": l.listPriceUsd.toFixed(0).padStart(8),
        "List SAR": l.listPriceSar.toFixed(0).padStart(9),
        "Sell/u SAR": l.unitSellPrice.toFixed(2).padStart(11),
        "Ext Sell SAR": l.extendedSell.toFixed(2).padStart(13),
        "VAT SAR": l.vatAmount.toFixed(2).padStart(10),
        "Total+VAT SAR": l.totalWithVat.toFixed(2).padStart(14),
      }))
    );
    const totExtSell = bom.reduce((s, l) => s + l.extendedSell, 0);
    const totVat = bom.reduce((s, l) => s + l.vatAmount, 0);
    const grandTotal = bom.reduce((s, l) => s + l.totalWithVat, 0);
    console.log(`\nTotal lines: ${bom.length}`);
    console.log(`Extended sell (ex VAT): SAR ${totExtSell.toFixed(2)}`);
    console.log(`VAT (15%):              SAR ${totVat.toFixed(2)}`);
    console.log(`Grand total (incl VAT): SAR ${grandTotal.toFixed(2)}`);
    console.log("═══════════════════════════════════════════════════════════════════════════\n");
  });

  it("line count is in range 25–60", () => {
    expect(bom.length).toBeGreaterThanOrEqual(25);
    expect(bom.length).toBeLessThanOrEqual(60);
  });

  it("every line has a non-empty SKU and positive qty", () => {
    bom.forEach((l, i) => {
      expect(l.sku, `line ${i + 1} SKU`).toBeTruthy();
      expect(l.qty, `line ${i + 1} qty`).toBeGreaterThan(0);
    });
  });

  it("every line has unit sell price > 0", () => {
    bom.forEach((l, i) => {
      expect(l.unitSellPrice, `line ${i + 1} (${l.sku})`).toBeGreaterThan(0);
    });
  });

  it("no NaN or undefined in any numeric field", () => {
    bom.forEach((l, i) => {
      const tag = `line ${i + 1} (${l.sku})`;
      const nums: [string, number][] = [
        ["listPriceSar", l.listPriceSar],
        ["afterDiscount", l.afterDiscount],
        ["costWithOverhead", l.costWithOverhead],
        ["unitSellPrice", l.unitSellPrice],
        ["extendedSell", l.extendedSell],
        ["stcsAmount", l.stcsAmount],
        ["partnerAmount", l.partnerAmount],
        ["vatAmount", l.vatAmount],
        ["totalWithVat", l.totalWithVat],
      ];
      nums.forEach(([field, val]) => {
        expect(val, `${tag}.${field} defined`).toBeDefined();
        expect(Number.isNaN(val), `${tag}.${field} NaN`).toBe(false);
      });
    });
  });
});
