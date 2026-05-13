import type { BoQLineItem } from "@/engines/e2/boq-types";
import type { ValidationResult } from "@/types/validation";
import { BoQType } from "@/engines/e2/boq-types";
import { detectBoQType } from "@/engines/e2/boq-detector";
import { parseTypeA } from "@/engines/e2/parsers/type-a-ariba";
import { parseTypeB } from "@/engines/e2/parsers/type-b-nrm2";
import { parseTypeC } from "@/engines/e2/parsers/type-c-vendor-quote";
import { parseTypeD } from "@/engines/e2/parsers/type-d-bom";
import { parseTypeE } from "@/engines/e2/parsers/type-e-telecom";
import { selectAccessories } from "@/engines/e2/accessory-selector";
import { calculateLicenses } from "@/engines/e2/licensing-calculator";
import { selectSupport } from "@/engines/e2/support-selector";
import {
  detectAnomalies,
  type AnomalyResult,
  type BomLineItem as AnomalyBomLine,
  type ProjectContext,
} from "@/engines/e2/bom-anomaly-detector";
import {
  findSimilarDeals,
  type DealProfile,
  type DealSummary,
  type SimilarDealResult,
} from "@/engines/e2/similar-deal-finder";
import { runValidation } from "@/lib/validation/engine";
import { readExcelFile } from "@/lib/io/excel-reader";
import { writeBomWorkbook } from "@/engines/e2/bom-workbook-writer";
import {
  buildPricedLines, buildTotals, buildValidationContext,
  type PricedBomLine, type RawLine, type E2Totals,
} from "@/engines/e2/orchestrator-helpers";

export interface E2DeviceConfig {
  redundantPsu?: boolean;
  rackMount?: boolean;
  powerCordType?: string;
  dnaTier: "essentials" | "advantage" | "premier" | "optout";
  networkTier: "essentials" | "advantage";
  licenseTerm: 3 | 5 | 7;
  supportCriticality: "standard" | "mission_critical" | "none";
  vendor: "cisco" | "fortinet";
}
export interface E2Device { model: string; qty: number; config: E2DeviceConfig }
export interface E2PricingConfig {
  fxRate: number; partnerDiscountPct: number; dealRegDiscountPct: number;
  profitMode: "margin" | "markup"; profitPct: number; vatRate: number; country: string;
}
export interface E2ProjectContext {
  sector?: string; siteCount?: number; userCount?: number; description?: string;
  customerName?: string; estimateId?: string;
}
export interface E2Input {
  filePath?: string;
  parsedLines?: BoQLineItem[];
  devices: E2Device[];
  pricingConfig: E2PricingConfig;
  projectContext?: E2ProjectContext;
  historicalDeals?: DealSummary[];
  /** Spec extension: callers supply per-SKU USD list prices until catalog adapter is wired. */
  listPrices?: Record<string, number>;
  /** Directory for the BoM XLSX. Defaults to a per-run temp directory. */
  outputDir?: string;
  /** If false, skip XLSX emission (used by tests / dry runs). */
  emitFiles?: boolean;
}
export interface E2Output {
  bom: PricedBomLine[];
  validationResults: ValidationResult[];
  anomalies: AnomalyResult;
  similarDeals?: SimilarDealResult;
  totals: E2Totals;
  exportPath?: string;
}
export type { PricedBomLine, E2Totals };

const SUPPORT_TERM_MONTHS: Record<3 | 5 | 7, 12 | 36 | 60> = { 3: 36, 5: 60, 7: 60 };

export async function runE2(input: E2Input): Promise<E2Output> {
  // (1) Parse Excel if filePath provided and no parsedLines supplied.
  let boqLines: BoQLineItem[] = input.parsedLines ?? [];
  if (input.filePath && boqLines.length === 0) {
    const excel = readExcelFile(input.filePath);
    const firstSheet = excel.sheets[excel.sheetNames[0]] ?? [];
    const type = detectBoQType(excel.sheetNames, excel.fileName, firstSheet.slice(0, 5));
    boqLines = parseByType(type, excel.sheets);
  }

  // (2)+(3) Device expansion + BoQ-parsed lines fold into a single raw-line list.
  const rawLines = expandDevices(input.devices);
  for (const b of boqLines) {
    rawLines.push({
      sku: b.partNumber || b.itemNumber || b.description,
      description: b.description, qty: b.qty, category: "other", unitListUsd: b.unitPrice,
    });
  }

  // (4) Fuzzy SKU matcher: skipped — no catalog source in E2Input.

  // (5) CS-001 → CS-002 → CS-003 → CS-004 → CS-005 → CS-006 → CS-007 → CS-009 per line.
  const priced = buildPricedLines(rawLines, input.pricingConfig, input.listPrices ?? {});

  // (6) Validation engine — 17 rules.
  const validationResults = runValidation(buildValidationContext(priced, input.pricingConfig.country));

  // (7) Anomaly detector (deterministic + AI sanity review).
  const anomalyBom: AnomalyBomLine[] = priced.map((p) => ({
    sku: p.sku, description: p.description, qty: p.qty, category: p.category, unitPrice: p.unitListSar,
  }));
  const projectContext: ProjectContext = {
    sector: input.projectContext?.sector ?? "unknown",
    siteCount: input.projectContext?.siteCount ?? 1,
    userCount: input.projectContext?.userCount,
    description: input.projectContext?.description,
  };
  const anomalies = await detectAnomalies(anomalyBom, projectContext);

  // (8) Similar-deal finder — only if historical deals supplied.
  let similarDeals: SimilarDealResult | undefined;
  if (input.historicalDeals && input.historicalDeals.length > 0) {
    similarDeals = await findSimilarDeals(buildDealProfile(input), input.historicalDeals);
  }

  // (9) Totals by category.
  const totals = buildTotals(priced);

  // (10) Emit BoM XLSX unless dry-run.
  let exportPath: string | undefined;
  if (input.emitFiles !== false && priced.length > 0) {
    exportPath = await writeBomWorkbook({
      priced, totals, validationResults,
      vatRate: input.pricingConfig.vatRate,
      country: input.pricingConfig.country,
      customerName: input.projectContext?.customerName,
      estimateId: input.projectContext?.estimateId,
      outputDir: input.outputDir,
    });
  }

  return { bom: priced, validationResults, anomalies, similarDeals, totals, exportPath };
}

function parseByType(type: BoQType, sheets: Record<string, string[][]>): BoQLineItem[] {
  switch (type) {
    case BoQType.TYPE_A_ARIBA: return parseTypeA(sheets);
    case BoQType.TYPE_B_NRM2: return parseTypeB(sheets, "base");
    case BoQType.TYPE_B_NRM2_ADDOMMIT: return parseTypeB(sheets, "addommit");
    case BoQType.TYPE_C_VENDOR_QUOTE: return parseTypeC(sheets);
    case BoQType.TYPE_D_BOM_NO_PRICE: return parseTypeD(sheets);
    case BoQType.TYPE_E_TELECOM: return parseTypeE(sheets);
    default: return [];
  }
}

function expandDevices(devices: E2Device[]): RawLine[] {
  const out: RawLine[] = [];
  for (const d of devices) {
    out.push({ sku: d.model, description: d.model, qty: d.qty, category: "hardware" });
    if (d.config.vendor === "cisco") {
      for (const a of selectAccessories(d.model, d.qty, {
        redundantPsu: d.config.redundantPsu, rackMount: d.config.rackMount, powerCordType: d.config.powerCordType,
      })) out.push({ sku: a.sku, description: a.description, qty: a.totalQty, category: "accessory" });
      for (const l of calculateLicenses(d.model, d.qty, {
        dnaTier: d.config.dnaTier, networkTier: d.config.networkTier, term: d.config.licenseTerm,
      })) out.push({ sku: l.sku, description: l.description, qty: l.qty, category: mapLicenseCategory(l.category) });
    }
    if (d.config.supportCriticality !== "none") {
      for (const s of selectSupport(d.model, d.qty, {
        criticality: d.config.supportCriticality,
        term: SUPPORT_TERM_MONTHS[d.config.licenseTerm], vendor: d.config.vendor,
      })) out.push({ sku: s.sku, description: s.description, qty: s.qty, category: "service" });
    }
  }
  return out;
}

function mapLicenseCategory(c: "network_license" | "dna_subscription" | "addon" | "software"): RawLine["category"] {
  return c === "network_license" || c === "software" ? "software" : "subscription";
}

function buildDealProfile(input: E2Input): DealProfile {
  return {
    sector: input.projectContext?.sector ?? "unknown",
    country: input.pricingConfig.country,
    vendors: Array.from(new Set(input.devices.map((d) => d.config.vendor))),
    productCategories: Array.from(new Set(input.devices.map((d) => productCategoryOf(d.model)))),
  };
}

function productCategoryOf(model: string): string {
  if (/^FG-/i.test(model) || /Forti/i.test(model)) return "firewall";
  if (/AX/.test(model)) return "access_point";
  return "switch";
}
