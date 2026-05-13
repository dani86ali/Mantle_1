/** E2 BoM workbook writer — wraps the generic excel-writer with E2-specific
 *  inputs (per-SKU validation rollup, currency derivation, totals → summary).
 *  Extracted from orchestrator.ts to keep that file under 200 lines.
 */

import { mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { writeBoMExport, type BoMExportLine } from "@/lib/io/excel-writer";
import type { ValidationResult } from "@/types/validation";
import type { PricedBomLine, E2Totals } from "@/engines/e2/orchestrator-helpers";

export interface BomWorkbookInputs {
  priced: PricedBomLine[];
  totals: E2Totals;
  validationResults: ValidationResult[];
  vatRate: number;
  country: string;
  customerName?: string;
  estimateId?: string;
  outputDir?: string;
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  SA: "SAR", KSA: "SAR", SAU: "SAR",
  AE: "AED", UAE: "AED", ARE: "AED",
  EG: "EGP", EGY: "EGP",
};

export function deriveCurrency(country: string): string {
  return CURRENCY_BY_COUNTRY[country.toUpperCase()] ?? "SAR";
}

export function statusBySku(
  priced: PricedBomLine[],
  results: ValidationResult[],
): Map<string, "pass" | "warn" | "fail"> {
  const lineIdToSku = new Map<string, string>();
  for (const p of priced) lineIdToSku.set(p.id, p.sku);
  const worst = new Map<string, "pass" | "warn" | "fail">();
  const rank = (s: "pass" | "warn" | "fail"): number => (s === "fail" ? 2 : s === "warn" ? 1 : 0);
  for (const r of results) {
    if (r.passed) continue;
    const next: "fail" | "warn" = r.severity === "error" ? "fail" : "warn";
    for (const lid of r.affectedLineIds) {
      const sku = lineIdToSku.get(lid);
      if (!sku) continue;
      const cur = worst.get(sku);
      if (!cur || rank(next) > rank(cur)) worst.set(sku, next);
    }
  }
  const out = new Map<string, "pass" | "warn" | "fail">();
  for (const p of priced) out.set(p.sku, worst.get(p.sku) ?? "pass");
  return out;
}

export async function writeBomWorkbook(inputs: BomWorkbookInputs): Promise<string> {
  const { priced, totals, validationResults, vatRate, country } = inputs;
  const dir = inputs.outputDir ?? join(tmpdir(), "bomatic-e2", randomUUID());
  await mkdir(dir, { recursive: true });
  const outPath = join(dir, "bom.xlsx");
  const currency = deriveCurrency(country);
  const statusMap = statusBySku(priced, validationResults);
  const lines: BoMExportLine[] = priced.map((p) => ({
    sku: p.sku, description: p.description, qty: p.qty, category: p.category,
    unitListPrice: p.unitListSar, unitSellPrice: p.unitSellPrice,
    extendedSell: p.extendedSell, currency,
    validationStatus: statusMap.get(p.sku) ?? "pass",
  }));
  await writeBoMExport(lines, {
    customerName: inputs.customerName ?? "Customer",
    estimateId: inputs.estimateId ?? `EST-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    country,
    summary: {
      hardwareTotal: totals.hardwareTotal,
      softwareTotal: totals.softwareTotal,
      serviceTotal: totals.serviceTotal,
      subscriptionTotal: totals.subscriptionTotal,
      subtotalExVat: totals.grandTotalExVat,
      vatRate,
      vatAmount: totals.vatAmount,
      grandTotalIncVat: totals.grandTotalIncVat,
    },
  }, outPath);
  return outPath;
}
