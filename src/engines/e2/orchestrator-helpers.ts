import type { BomLine, LineCategory } from "@/types/bom";
import type { ValidationContext, CatalogItemForValidation } from "@/types/validation";
import {
  convertCurrency, applyVendorDiscount, applyInhouseMargin,
  calculateOverhead, calculateCostWithOverhead, calculateSellingPrice, calculateExtendedSell,
} from "@/engines/e2/pricing-engine";
import { calculateVAT } from "@/engines/e2/vat";

export interface RawLine {
  sku: string; description: string; qty: number; category: string;
  /** Overrides the listPrices map lookup when known (e.g. from a parsed BoQ line). */
  unitListUsd?: number;
}

export interface PricedBomLine {
  id: string; lineNumber: number; sku: string; description: string; qty: number; category: string;
  unitListUsd: number; unitListSar: number; unitSellPrice: number; extendedSell: number;
  vatAmount: number; totalWithVat: number;
}

export interface E2Totals {
  hardwareTotal: number; softwareTotal: number; serviceTotal: number; subscriptionTotal: number;
  grandTotalExVat: number; vatAmount: number; grandTotalIncVat: number;
}

export interface PricingConfig {
  fxRate: number; partnerDiscountPct: number; dealRegDiscountPct: number;
  profitMode: "margin" | "markup"; profitPct: number; vatRate: number;
}

const ZERO_OVERHEAD = {
  shipmentPct: 0, customPct: 0, insurancePct: 0,
  whtaxPct: 0, zakatPct: 0, financePct: 0, riskPct: 0,
} as const;

export function buildPricedLines(
  raws: RawLine[], cfg: PricingConfig, prices: Record<string, number>,
): PricedBomLine[] {
  return raws.map((r, i) => priceLine(r, i + 1, cfg, r.unitListUsd ?? prices[r.sku] ?? 0));
}

function priceLine(r: RawLine, lineNumber: number, cfg: PricingConfig, listUsd: number): PricedBomLine {
  const unitListSar = convertCurrency(listUsd, cfg.fxRate);
  const afterDiscount = applyVendorDiscount(unitListSar, cfg.partnerDiscountPct, cfg.dealRegDiscountPct);
  const afterIM = applyInhouseMargin({ netCost: afterDiscount, inhouseMarginPct: 0, taVersion: "V34" });
  const ovh = calculateOverhead({ unitAfterDiscount: afterDiscount, ...ZERO_OVERHEAD });
  const costWithOverhead = calculateCostWithOverhead({
    unitAfterInhouseMargin: afterIM, overheadTotal: ovh.total, fixedValue: 0,
  });
  const unitSellPrice = calculateSellingPrice(
    cfg.profitMode === "margin"
      ? { mode: "margin", costWithOverhead, profitPct: cfg.profitPct }
      : { mode: "markup", costWithOverhead, profitPct: cfg.profitPct }
  );
  const extendedSell = calculateExtendedSell({
    unitSellPrice, qty: r.qty, discountEmbedPct: 0, solutionEmbedPct: 0, inhouseEmbedPct: 0,
  });
  const { vatAmount, totalWithVat } = calculateVAT({ sellPrice: extendedSell, vatRate: cfg.vatRate });
  return {
    id: `L-${String(lineNumber).padStart(3, "0")}`,
    lineNumber, sku: r.sku, description: r.description, qty: r.qty, category: r.category,
    unitListUsd: listUsd, unitListSar, unitSellPrice, extendedSell, vatAmount, totalWithVat,
  };
}

const HARDWARE_CATS = new Set(["hardware", "accessory"]);
const SOFTWARE_CATS = new Set(["software", "license", "network_license"]);
const SUBSCRIPTION_CATS = new Set(["subscription", "dna_subscription", "addon"]);
const SERVICE_CATS = new Set(["service", "support"]);

export function buildTotals(lines: PricedBomLine[]): E2Totals {
  let hardware = 0, software = 0, service = 0, subscription = 0, vat = 0;
  for (const l of lines) {
    if (HARDWARE_CATS.has(l.category)) hardware += l.extendedSell;
    else if (SOFTWARE_CATS.has(l.category)) software += l.extendedSell;
    else if (SUBSCRIPTION_CATS.has(l.category)) subscription += l.extendedSell;
    else if (SERVICE_CATS.has(l.category)) service += l.extendedSell;
    vat += l.vatAmount;
  }
  const grand = hardware + software + service + subscription;
  return {
    hardwareTotal: hardware, softwareTotal: software,
    serviceTotal: service, subscriptionTotal: subscription,
    grandTotalExVat: grand, vatAmount: vat, grandTotalIncVat: grand + vat,
  };
}

function mapToBomCategory(c: string): LineCategory {
  if (c === "accessory") return "accessory";
  if (HARDWARE_CATS.has(c)) return "hardware";
  if (SOFTWARE_CATS.has(c)) return "software";
  if (SUBSCRIPTION_CATS.has(c)) return "subscription";
  if (SERVICE_CATS.has(c)) return "service";
  return "other";
}

export type E2ValidationStatus = "validated" | "unvalidated" | "partial";

export function assessValidationStatus(
  priced: PricedBomLine[],
): { validationStatus: E2ValidationStatus; validationWarnings: string[] } {
  const warnings: string[] = ["EoX status not verified — stub lookup used"];
  const zeroPriceSkus: string[] = [];
  const seen = new Set<string>();
  for (const p of priced) {
    if ((!p.unitListUsd || p.unitListUsd === 0) && !seen.has(p.sku)) {
      seen.add(p.sku);
      zeroPriceSkus.push(p.sku);
    }
  }
  for (const sku of zeroPriceSkus) {
    warnings.push(`No list price available for ${sku}`);
  }
  // No catalog adapter is wired yet, so prices are always caller-supplied:
  // mark the run unvalidated until a real catalog is consulted.
  return { validationStatus: "unvalidated", validationWarnings: warnings };
}

export function buildValidationContext(priced: PricedBomLine[], country: string): ValidationContext {
  const lines: BomLine[] = priced.map((p) => ({
    id: p.id, lineNumber: p.lineNumber, sku: p.sku, description: p.description,
    quantity: p.qty, unitListPrice: p.unitListSar, unitNetPrice: p.unitListSar,
    discountPercent: 0, extendedNetPrice: p.extendedSell,
    category: mapToBomCategory(p.category),
    smartAccountMandatory: false, validationFlags: [], decision: "pending", catalogVerified: false,
  }));
  // No catalog adapter is wired yet — pass an empty map so catalog-dependent
  // rules can honestly report "unverified" rather than rubber-stamping every SKU.
  const catalogData = new Map<string, CatalogItemForValidation>();
  return {
    lines, requirements: {}, region: "global", country,
    tenantStandards: {
      requireRedundantPsu: false,
      preferredLicenseTier: "advantage", preferredDnaTier: "advantage",
      defaultSupportLevel: "standard",
      approvedProductFamilies: [], regionRestrictions: [],
    },
    catalogData,
  };
}
